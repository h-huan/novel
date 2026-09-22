/**
 * ModuleStandardsService — 功能模块标准库 / 自归纳 / 发展历程
 *
 * 机制（变化驱动，而非固定时间驱动）：
 * - 启动时幂等写入 seed 基线（module-standards.seed），并把当前标准装入 standardDirectiveCache；
 * - 代码基线升级：seed 文件 SEED_BASELINE_VERSION 高于库内记录时，启动即用新基线确定性覆盖当前标准、
 *   旧版归档（trigger=seed_upgrade，不调用模型），保证"改了标准代码、重启即生效且留历史"；
 * - 变化检测只读取指标，不调用模型：模块积累足够新样本且指标出现实质变化时标为 dirty；
 * - 归纳必须由用户在标准页明确触发。启动、状态查询和页面轮询均不得隐式调用模型；
 * - 归纳输入 = 当前标准 + 该模块近期埋点指标 + 跨章节避坑经验，用【配置的日常模型 scenario=daily】
 *   （走 RealLLM 统一配置路由，绝不自由选模型/降级）产出新版标准；
 * - 归纳前把旧标准保存为内部审计快照，再更新当前标准并刷新注入缓存；前端和公开 API 只读取当前标准；
 * - 任何归纳失败都保留旧标准、只记 run=failed，绝不影响正常生成。
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as crypto from 'crypto';
import { DatabaseService } from '../../database/database.service';
import { RealLLMService } from '../../chain/real-llm.service';
import { GenerationMetricsService } from '../generation-metrics/generation-metrics.service';
import { SEED_MODULE_STANDARDS, SEED_BASELINE_VERSION, SeedModuleStandard } from './module-standards.seed';
import { standardDirectiveCache } from './standard-directive.cache';

const ACTIVITY_LOOKBACK_DAYS = 7;
/** 自上次归纳以来，该模块场景至少新增多少次真实生成，才具备归纳的样本前提 */
const MIN_NEW_CALLS = 3;
interface MetricsAgg {
  calls: number;
  failRate: number;
  firstPassRate: number;
  avgDeficit: number;
  bottleneckKinds: number;
  lessonsCount: number;
  lessonsTopOcc: number;
}

interface DirtyState {
  dirty: boolean;
  reasons: string[];
}

interface StandardRow {
  module_key: string;
  module_name: string;
  category: string;
  scenarios: string;
  business_tables: string;
  purpose: string;
  steps_json: string;
  requirements_json: string;
  rules_json: string;
  quality_bar: string;
  inputs_json: string;
  outputs_json: string;
  version: number;
  change_note: string;
  source: string;
  status: string;
  last_summarized_at: string | null;
  metrics_snapshot_json: string | null;
  seed_baseline_version: number;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class ModuleStandardsService implements OnModuleInit {
  private readonly logger = new Logger(ModuleStandardsService.name);
  private readonly running = new Set<string>();

  constructor(
    private readonly db: DatabaseService,
    private readonly realLLM: RealLLMService,
    private readonly metrics: GenerationMetricsService,
  ) {}

  onModuleInit(): void {
    try {
      // 先清理上一进程被强杀而遗留的“归纳中”僵尸记录，否则前端会永久显示“正在自归纳…”
      this.recoverInterruptedRuns();
      this.ensureSeeded();
      this.loadToCache();
    } catch (err) {
      this.logger.warn(`标准库初始化失败（不影响生成）: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * 启动恢复：归纳是异步任务，若上一进程在 LLM 归纳途中被强杀/重启，finally 与 finishRun 都不会执行，
   * 数据库会残留 status='running' 的僵尸记录，status() 只查库就会让前端永久转圈。
   * 新进程启动时内存 running 必为空，因此把所有遗留 running 统一标记为 interrupted（旧标准仍生效，不影响生成）。
   */
  private recoverInterruptedRuns(): void {
    const info = this.db.getDb()
      .prepare(
        `UPDATE standard_summarization_runs
           SET status='interrupted',
               error=COALESCE(error, ?),
               finished_at=COALESCE(finished_at, ?)
         WHERE status='running'`,
      )
      .run('服务重启，上次归纳被中断（未完成，旧标准仍生效）', this.now()) as { changes?: number };
    if (Number(info?.changes ?? 0) > 0) {
      this.logger.log(`启动清理：${info.changes} 条被中断的归纳记录已标记为 interrupted`);
    }
  }

  private now(): string {
    return new Date().toISOString();
  }

  private id(): string {
    return crypto.randomUUID();
  }

  /**
   * 幂等 seed：
   * - 缺失模块 → 插入代码基线（seed_baseline_version=SEED_BASELINE_VERSION）并归档一版；
   * - 已存在但代码基线版本更新 → 确定性覆盖当前标准、旧版归档（seed_upgrade），重启即生效。
   */
  ensureSeeded(): void {
    const database = this.db.getDb();
    const rows = database.prepare('SELECT * FROM module_standards').all() as unknown as StandardRow[];
    const byKey = new Map(rows.map(r => [r.module_key, r]));
    const now = this.now();
    const ins = database.prepare(
      `INSERT INTO module_standards
        (module_key, module_name, category, scenarios, business_tables, purpose, steps_json,
         requirements_json, rules_json, quality_bar, inputs_json, outputs_json, version,
         change_note, source, status, last_summarized_at, metrics_snapshot_json, seed_baseline_version, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,'初始标准基线','seed','active',?,NULL,?,?,?)`,
    );
    const insVer = database.prepare(
      `INSERT INTO module_standard_versions (id, module_key, module_name, version, snapshot_json, change_note, trigger, metrics_snapshot_json, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    );
    const upgrade = database.prepare(
      `UPDATE module_standards SET module_name=?, category=?, scenarios=?, business_tables=?, purpose=?, steps_json=?,
         requirements_json=?, rules_json=?, quality_bar=?, inputs_json=?, outputs_json=?, version=version+1,
         change_note=?, source='seed_upgrade', seed_baseline_version=?, updated_at=?
       WHERE module_key=?`,
    );
    for (const s of SEED_MODULE_STANDARDS) {
      const cur = byKey.get(s.module_key);
      if (!cur) {
        ins.run(
          s.module_key, s.module_name, s.category, JSON.stringify(s.scenarios), JSON.stringify(s.business_tables),
          s.purpose, JSON.stringify(s.steps), JSON.stringify(s.requirements), JSON.stringify(s.rules),
          s.quality_bar, JSON.stringify(s.inputs), JSON.stringify(s.outputs),
          // 初始基线从未经过归纳：last_summarized_at 置 NULL，达到样本条件后在页面提示可手动归纳
          null, SEED_BASELINE_VERSION, now, now,
        );
        insVer.run(this.id(), s.module_key, s.module_name, 1, JSON.stringify(this.seedToSnapshot(s)), '初始标准基线', 'seed', null, now);
        continue;
      }
      const curSeedVer = Number(cur.seed_baseline_version ?? 1);
      if (curSeedVer < SEED_BASELINE_VERSION) {
        // 代码基线已升级：先归档旧版，再用代码基线确定性覆盖（不调用模型），保留 last_summarized_at/指标快照
        const curObj = this.parseRow(cur);
        insVer.run(
          this.id(), s.module_key, s.module_name, cur.version, JSON.stringify(curObj),
          `标准基线代码升级 v${curSeedVer}→v${SEED_BASELINE_VERSION}（确定性同步，未调用模型）`, 'seed_upgrade',
          cur.metrics_snapshot_json, now,
        );
        upgrade.run(
          s.module_name, s.category, JSON.stringify(s.scenarios), JSON.stringify(s.business_tables),
          s.purpose, JSON.stringify(s.steps), JSON.stringify(s.requirements), JSON.stringify(s.rules),
          s.quality_bar, JSON.stringify(s.inputs), JSON.stringify(s.outputs),
          `代码标准基线升级至 v${SEED_BASELINE_VERSION}`, SEED_BASELINE_VERSION, now, s.module_key,
        );
        this.logger.log(`模块 ${s.module_key} 标准基线代码升级 v${curSeedVer}→v${SEED_BASELINE_VERSION}（确定性同步）`);
      }
    }
  }

  private seedToSnapshot(s: SeedModuleStandard) {
    return {
      module_key: s.module_key, module_name: s.module_name, category: s.category, scenarios: s.scenarios,
      business_tables: s.business_tables, purpose: s.purpose, steps: s.steps, requirements: s.requirements,
      rules: s.rules, quality_bar: s.quality_bar, inputs: s.inputs, outputs: s.outputs,
    };
  }

  /** 读取当前 active 标准并重建注入缓存。 */
  loadToCache(): void {
    const rows = this.db.getDb()
      .prepare(`SELECT * FROM module_standards WHERE status='active'`)
      .all() as unknown as StandardRow[];
    standardDirectiveCache.rebuild(
      rows.map(r => ({
        module_key: r.module_key, module_name: r.module_name, category: r.category,
        version: r.version, seed_baseline_version: r.seed_baseline_version,
        scenarios: this.safeArr(r.scenarios), purpose: r.purpose, steps_json: r.steps_json,
        requirements_json: r.requirements_json, rules_json: r.rules_json, quality_bar: r.quality_bar,
      })) as any,
    );
  }

  private safeArr(raw: string): string[] {
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v.map(String) : [];
    } catch {
      return [];
    }
  }

  private parseRow(r: StandardRow) {
    const arr = (raw: string) => this.safeArr(raw);
    const obj = (raw: string) => {
      try { return JSON.parse(raw); } catch { return []; }
    };
    return {
      moduleKey: r.module_key, moduleName: r.module_name, category: r.category,
      scenarios: arr(r.scenarios), businessTables: arr(r.business_tables), purpose: r.purpose,
      steps: obj(r.steps_json), requirements: arr(r.requirements_json), rules: arr(r.rules_json),
      qualityBar: r.quality_bar, inputs: arr(r.inputs_json), outputs: arr(r.outputs_json),
      version: r.version, changeNote: r.change_note, source: r.source,
      lastSummarizedAt: r.last_summarized_at, metricsSnapshot: obj(r.metrics_snapshot_json || 'null'),
      seedBaselineVersion: Number(r.seed_baseline_version ?? 1),
      updatedAt: r.updated_at,
    };
  }

  /** 当前全部标准（最新标准页用）。 */
  list() {
    const rows = this.db.getDb()
      .prepare(`SELECT * FROM module_standards WHERE status='active' ORDER BY category, module_key`)
      .all() as unknown as StandardRow[];
    return rows.map(r => this.parseRow(r));
  }

  get(moduleKey: string) {
    const row = this.db.getDb()
      .prepare(`SELECT * FROM module_standards WHERE module_key=?`)
      .get(moduleKey) as StandardRow | undefined;
    return row ? this.parseRow(row) : null;
  }

  /** 避坑经验总量与最高出现次数（用于判断是否沉淀了新经验）。 */
  private lessonsStats(): { count: number; topOcc: number } {
    try {
      const r = this.db.getDb()
        .prepare(`SELECT COUNT(*) AS c, COALESCE(MAX(occurrence),0) AS m FROM generation_lessons`)
        .get() as { c: number; m: number };
      return { count: Number(r.c) || 0, topOcc: Number(r.m) || 0 };
    } catch {
      return { count: 0, topOcc: 0 };
    }
  }

  /** 该模块关联场景近 N 天的指标简报（归纳输入 + dirty 判定依据）。 */
  private buildMetricsBrief(scenarios: string[]): { windowDays: number; steps: any[]; agg: MetricsAgg } {
    const summary = this.metrics.getFlowSummary(undefined, ACTIVITY_LOOKBACK_DAYS);
    const hit = summary.steps.filter(s => scenarios.includes(s.stepKey) || scenarios.includes(s.scenario));
    const steps = hit.map(s => ({
      step: s.label, calls: s.calls, firstPassRate: s.firstPassRate, avgAttempts: s.avgAttempts,
      avgDurationMs: s.avgDurationMs, failRate: s.failRate,
      avgOutputWords: s.avgOutputWords, avgTargetWords: s.avgTargetWords, avgDeficitWords: s.avgDeficitWords,
      bottleneckReasons: s.bottleneckReasons,
    }));
    const calls = steps.reduce((a, s) => a + (s.calls || 0), 0);
    const wavg = (sel: (s: any) => number) =>
      calls ? steps.reduce((a, s) => a + (sel(s) || 0) * (s.calls || 0), 0) / calls : 0;
    const bottleneckKinds = new Set(steps.flatMap(s => s.bottleneckReasons || [])).size;
    const ls = this.lessonsStats();
    return {
      windowDays: ACTIVITY_LOOKBACK_DAYS,
      steps,
      agg: {
        calls,
        failRate: wavg(s => s.failRate),
        firstPassRate: wavg(s => s.firstPassRate),
        avgDeficit: wavg(s => s.avgDeficitWords),
        bottleneckKinds,
        lessonsCount: ls.count,
        lessonsTopOcc: ls.topOcc,
      },
    };
  }

  /** 跨章节避坑经验（按项目无关取全局高频，归纳为通用纪律）。 */
  private buildLessonsBrief(): string[] {
    try {
      const rows = this.db.getDb()
        .prepare(`SELECT category, lesson, occurrence FROM generation_lessons ORDER BY occurrence DESC LIMIT 12`)
        .all() as Array<{ category: string; lesson: string; occurrence: number }>;
      return rows.map(r => `[${r.category}×${r.occurrence}] ${r.lesson}`);
    } catch {
      return [];
    }
  }

  private pct(x: number): string {
    return `${(x * 100).toFixed(0)}%`;
  }

  /**
   * 变化驱动判定：该模块当前是否有值得归纳的新变化（dirty）。
   * 不看固定时长，只看：样本量 + 指标实质变化（失败率/首版率/字数缺口/卡点/避坑经验）。
   */
  private computeDirty(row: StandardRow): DirtyState {
    const scenarios = this.safeArr(row.scenarios);
    const brief = this.buildMetricsBrief(scenarios);
    const agg = brief.agg;
    if (agg.calls <= 0) return { dirty: false, reasons: ['该模块近期还没有真实生成，暂不归纳'] };

    let prevAgg: MetricsAgg | null = null;
    try {
      const prev = JSON.parse(row.metrics_snapshot_json || 'null');
      if (prev && prev.agg) prevAgg = prev.agg as MetricsAgg;
    } catch { /* ignore */ }

    if (!prevAgg) {
      if (agg.calls < MIN_NEW_CALLS) {
        return { dirty: false, reasons: [`样本不足（${agg.calls}/${MIN_NEW_CALLS} 次），积累到阈值再首次归纳`] };
      }
      return { dirty: true, reasons: [`已积累 ${agg.calls} 次真实生成，达到首次归纳条件`] };
    }

    const newCalls = agg.calls - (prevAgg.calls || 0);
    if (newCalls < MIN_NEW_CALLS) {
      return { dirty: false, reasons: [`自上次归纳仅新增 ${Math.max(0, newCalls)} 次（需≥${MIN_NEW_CALLS}）`] };
    }
    const reasons: string[] = [`自上次归纳新增 ${newCalls} 次真实生成`];
    if (agg.failRate - (prevAgg.failRate || 0) > 0.02) {
      reasons.push(`失败/截断率由 ${this.pct(prevAgg.failRate || 0)} 升至 ${this.pct(agg.failRate)}`);
    }
    if ((prevAgg.firstPassRate || 0) - agg.firstPassRate > 0.1) {
      reasons.push(`首版到位率由 ${this.pct(prevAgg.firstPassRate || 0)} 降至 ${this.pct(agg.firstPassRate)}（下滑>10pt）`);
    }
    if (agg.avgDeficit - (prevAgg.avgDeficit || 0) > 150) {
      reasons.push(`平均字数缺口扩大约 ${Math.round(agg.avgDeficit - (prevAgg.avgDeficit || 0))} 字`);
    }
    if (agg.bottleneckKinds > (prevAgg.bottleneckKinds || 0)) {
      reasons.push('出现新的流程卡点类型');
    }
    if (agg.lessonsCount > (prevAgg.lessonsCount || 0)) {
      reasons.push('沉淀了新的跨章节避坑经验');
    }
    // 第一条只是样本前提；必须再有至少一条"实质变化"才归纳，避免无意义调用模型
    if (reasons.length === 1) {
      return { dirty: false, reasons: ['新增样本但指标无实质变化，暂不归纳'] };
    }
    return { dirty: true, reasons };
  }

  /**
   * 归纳单个模块（自迭代核心）。用配置的日常模型，失败保留旧版。
   * 默认要求该模块 dirty（检测到变化）；force=true 用于强制重归纳。
   */
  async summarizeModule(
    moduleKey: string,
    trigger: 'scheduled' | 'manual' = 'scheduled',
    force = false,
  ): Promise<{ ok: boolean; code?: string; version?: number; changeNote?: string; error?: string }> {
    if (this.running.has(moduleKey)) return { ok: false, code: 'running', error: '该模块正在归纳中' };
    const current = this.db.getDb().prepare(`SELECT * FROM module_standards WHERE module_key=?`).get(moduleKey) as StandardRow | undefined;
    if (!current) return { ok: false, code: 'not_found', error: '模块不存在' };
    if (!force) {
      const d = this.computeDirty(current);
      if (!d.dirty) return { ok: false, code: 'not_dirty', error: d.reasons[0] || '该模块暂无新变化，无需归纳' };
    }
    this.running.add(moduleKey);
    const runId = this.id();
    const startedAt = this.now();
    this.db.getDb().prepare(
      `INSERT INTO standard_summarization_runs (id, module_key, status, trigger, from_version, to_version, change_note, error, started_at, finished_at)
       VALUES (?,?,?,?,?,?,?,?,?,NULL)`,
    ).run(runId, moduleKey, 'running', trigger, current.version, null, null, null, startedAt);
    try {
      const scenarios = this.safeArr(current.scenarios);
      const metricsBrief = this.buildMetricsBrief(scenarios);
      const lessons = this.buildLessonsBrief();
      const currentObj = this.parseRow(current);
      const prompt = this.buildSummarizePrompt(currentObj, metricsBrief, lessons);
      const resp = await this.realLLM.generate({
        prompt,
        scenario: 'daily', // 固定走"日常场景"配置的模型版本；RealLLM configured-only，不降级、不自由选模型
        temperature: 0.4,
        responseFormat: 'json_object',
        maxTokens: 8192,
        injectStandard: false, // 归纳是"维护标准"的元任务，不再注入标准，避免递归
      });
      const next = this.extractJson(resp.content);
      if (!next || typeof next !== 'object') throw new Error('归纳结果不是合法 JSON 对象');

      const purpose = String(next.purpose || current.purpose || '').trim();
      const steps = this.normalizeSteps(next.steps) ;
      const requirements = this.toStringArray(next.requirements);
      const rules = this.toStringArray(next.rules);
      const qualityBar = String(next.qualityBar || current.quality_bar || '').trim();
      const changeNote = String(next.changeNote || '根据近期生成指标与避坑经验归纳更新').trim().slice(0, 300);
      if (!purpose || (steps.length === 0 && requirements.length === 0 && rules.length === 0)) {
        throw new Error('归纳结果缺少有效内容（purpose/steps/requirements/rules 全空）');
      }

      const now = this.now();
      // 1) 旧版整体归档进发展历程
      this.db.getDb().prepare(
        `INSERT INTO module_standard_versions (id, module_key, module_name, version, snapshot_json, change_note, trigger, metrics_snapshot_json, created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      ).run(
        this.id(), moduleKey, current.module_name, current.version,
        JSON.stringify(currentObj), current.change_note || '上一版本', trigger,
        JSON.stringify(metricsBrief), now,
      );
      // 2) 更新当前标准（同时刷新指标快照，作为下一次 dirty 对比基线）
      const newVersion = current.version + 1;
      this.db.getDb().prepare(
        `UPDATE module_standards SET purpose=?, steps_json=?, requirements_json=?, rules_json=?, quality_bar=?,
           version=?, change_note=?, source=?, last_summarized_at=?, metrics_snapshot_json=?, updated_at=?
         WHERE module_key=?`,
      ).run(
        purpose, JSON.stringify(steps), JSON.stringify(requirements), JSON.stringify(rules), qualityBar,
        newVersion, changeNote, trigger, now, JSON.stringify(metricsBrief), now, moduleKey,
      );
      // 3) 刷新注入缓存，让后续任何模型立即按最新标准执行
      this.loadToCache();
      this.finishRun(runId, 'done', newVersion, changeNote, null);
      this.logger.log(`模块标准归纳完成 ${moduleKey} v${newVersion}：${changeNote}`);
      return { ok: true, version: newVersion, changeNote };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.finishRun(runId, 'failed', null, null, message);
      this.logger.warn(`模块标准归纳失败 ${moduleKey}（保留旧版，不影响生成）: ${message}`);
      return { ok: false, code: 'failed', error: message };
    } finally {
      this.running.delete(moduleKey);
    }
  }

  private finishRun(runId: string, status: string, toVersion: number | null, changeNote: string | null, error: string | null) {
    this.db.getDb().prepare(
      `UPDATE standard_summarization_runs SET status=?, to_version=?, change_note=?, error=?, finished_at=? WHERE id=?`,
    ).run(status, toVersion, changeNote, error, this.now(), runId);
  }

  private buildSummarizePrompt(current: any, metricsBrief: unknown, lessons: string[]): string {
    return [
      '你是小说创作平台的"功能模块标准"维护者。请基于该模块的【现行标准】、近期真实【运行指标】和【避坑经验】，归纳出一版更可执行的最新标准。',
      '要求：保留行之有效的部分，针对指标暴露的卡点（首版到位率低、平均轮次多、失败率高、字数缺口等）把对策固化进步骤/规则；语言精炼、每条可直接执行；不得写空泛口号；不得改变模块职责边界。',
      '',
      '【现行标准 v' + current.version + '】',
      JSON.stringify({
        purpose: current.purpose, steps: current.steps, requirements: current.requirements,
        rules: current.rules, qualityBar: current.qualityBar,
      }, null, 2),
      '',
      '【近7天运行指标】',
      JSON.stringify(metricsBrief, null, 2),
      '',
      '【高频避坑经验】',
      lessons.length ? lessons.join('\n') : '（暂无）',
      '',
      '只输出一个 JSON 对象，字段：purpose(string), steps(array of {name,goal}), requirements(string[]), rules(string[]), qualityBar(string), changeNote(string，本次相对上版改了什么、为什么，≤80字)。不要输出 JSON 以外的任何内容。',
    ].join('\n');
  }

  private extractJson(raw: string): any {
    if (!raw) return null;
    const direct = this.tryParse(raw);
    if (direct) return direct;
    const match = raw.match(/\{[\s\S]*\}/);
    return match ? this.tryParse(match[0]) : null;
  }

  private tryParse(text: string): any {
    try { return JSON.parse(text); } catch { return null; }
  }

  private normalizeSteps(input: unknown): Array<{ name: string; goal: string }> {
    if (!Array.isArray(input)) return [];
    return input.map((x: any) => {
      if (typeof x === 'string') return { name: x, goal: '' };
      return { name: String(x?.name || '').trim(), goal: String(x?.goal || '').trim() };
    }).filter(x => x.name);
  }

  private toStringArray(input: unknown): string[] {
    if (!Array.isArray(input)) return [];
    return input.map(x => String(x ?? '').trim()).filter(Boolean);
  }

  /** 前端状态：只读。正在归纳的模块 + 最近运行记录 + 每模块 dirty 状态。 */
  status() {
    const database = this.db.getDb();
    const running = (database
      .prepare(`SELECT * FROM standard_summarization_runs WHERE status='running' ORDER BY started_at DESC`)
      .all() as any[])
      // 双保险：只有“本进程内存中确实在跑”的才算正在归纳，过滤掉强杀残留的僵尸记录，杜绝永久转圈
      .filter(r => this.running.has(r.module_key));
    const recent = database
      .prepare(`SELECT * FROM standard_summarization_runs ORDER BY started_at DESC LIMIT 20`)
      .all() as any[];
    const rows = database.prepare(`SELECT * FROM module_standards WHERE status='active'`).all() as unknown as StandardRow[];
    const modules = rows.map(r => {
      let d: DirtyState = { dirty: false, reasons: [] };
      try { d = this.computeDirty(r); } catch { /* ignore */ }
      return {
        moduleKey: r.module_key,
        moduleName: r.module_name,
        category: r.category,
        version: r.version,
        running: this.running.has(r.module_key),
        dirty: d.dirty,
        reasons: d.reasons,
        lastSummarizedAt: r.last_summarized_at,
      };
    });
    const mapName = (key: string) => (this.get(key)?.moduleName) || key;
    return {
      running: running.map(r => ({ id: r.id, moduleKey: r.module_key, moduleName: mapName(r.module_key), trigger: r.trigger, startedAt: r.started_at })),
      recent: recent.map(r => ({
        id: r.id, moduleKey: r.module_key, moduleName: mapName(r.module_key), status: r.status,
        fromVersion: r.from_version, toVersion: r.to_version, changeNote: r.change_note,
        error: r.error, startedAt: r.started_at, finishedAt: r.finished_at,
      })),
      modules,
      /** 检测到变化、可由用户手动归纳的模块数 */
      dirtyCount: modules.filter(m => m.dirty).length,
      cacheRebuiltAt: standardDirectiveCache.getRebuiltAt(),
    };
  }
}
