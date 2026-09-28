/**
 * PlatformAnalyticsService — 工作台数据驾驶舱聚合（跨业务表 + 生成遥测，确定性统计，不伪造任何数据）
 *
 * 指标围绕「作者真正要改的写作问题」设计（结合番茄/起点黄金三章、留存、AI 产品返工指标）：
 *  - 口径真实：质检问题只统计每章「最新一份报告」仍 open 的项（旧报告随正文重写失效，不再累加虚高）；
 *    章节区分「有正文」与「空壳（word_count=0，仅大纲占位）」；一致性问题按(章节,类型)只留最新未解决；
 *  - 质量画像：20+ 机器 issue_type 经 labels.qualityDimensionOf 归并成 7 大写作维度（开篇钩子/节奏/对话/AI痕迹/逻辑/细节/标点）；
 *  - 标签契合：平台/分类/基调/文风/流派/视角 六维契合分（来自质检报告 payload.tagFit；维度与
 *    生成侧执行标准共用 shared/src/execution-standard-dimensions.ts 唯一来源，未评维度单独列出）；
 *  - 字数达标：对照每本书 settings.chapterWordRange 判断达标/偏短/偏长与缺口；
 *  - 返工：writing_revision_records 每章修订次数、≥3 次的章节；生成步骤一次成功率/平均返工（generation_step_metrics）；
 *  - 每日变化：产出字数、生成、问题新增/解决趋势。
 * 机器 key 一律经 labels.ts 转中文；任一表异常独立容错，不拖垮整个看板。
 */
import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseService } from '../../database/database.service';
import { SEED_BASELINE_VERSION, SEED_MODULE_STANDARDS } from '../module-standards/module-standards.seed';
import { CHAPTER_WORD_RANGE, EXECUTION_STANDARD_DIMENSIONS, EXECUTION_STANDARD_DIMENSION_LABELS } from '../../../shared/src';
import {
  platformLabel, storyTypeLabel,
  qualityIssueLabel, checkTypeLabel, severityLabel, errorKindLabel,
  scenarioLabel, scenarioGroupOf, qualityDimensionOf, QUALITY_DIM_LABEL, QUALITY_DIM_ORDER,
  hardlineRuleLabel,
  type QualityDim,
} from './labels';
import { getPlatform, targetForLength, measureAgainstTarget } from '../../chain/platform-benchmarks';

const DAY = 86400_000;

export interface OverviewOptions {
  days?: number;
  projectId?: string | null;
  storyType?: string | null;
  platform?: string | null;
}

interface Scope {
  ids: string[] | null;
  matched: Array<{ id: string; type: string | null; target_platform: string | null }>;
  filtered: boolean;
}

export interface TrendBucket {
  date: string; llmCalls: number; llmFail: number; llmSuccess: number; outputWords: number;
  newProjects: number; newChapters: number; newIssues: number; resolvedIssues: number;
}

@Injectable()
export class PlatformAnalyticsService {
  constructor(private readonly database: DatabaseService) {}

  private db() {
    return this.database.getDb();
  }

  private safeAll(sql: string, params: any[] = []): any[] {
    try {
      return this.db().prepare(sql).all(...params) as unknown as any[];
    } catch {
      return [];
    }
  }

  private safeOne(sql: string, params: any[] = []): any {
    try {
      return this.db().prepare(sql).get(...params);
    } catch {
      return null;
    }
  }

  private parseJson(raw: unknown): any {
    if (raw == null) return {};
    if (typeof raw === 'object') return raw;
    try {
      return JSON.parse(String(raw));
    } catch {
      return {};
    }
  }

  private percentile(sortedAsc: number[], p: number): number {
    if (!sortedAsc.length) return 0;
    const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil(p * sortedAsc.length) - 1));
    return Math.round(sortedAsc[idx]);
  }

  private dayKey(iso: string): string {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return '';
    return new Date(t).toISOString().slice(0, 10);
  }

  // ───────────────────────── 项目筛选范围 ─────────────────────────

  private resolveScope(opts: OverviewOptions): Scope {
    const all = this.safeAll(`SELECT id, type, target_platform FROM projects`)
      .map(r => ({ id: String(r.id), type: r.type ?? null, target_platform: r.target_platform ?? null }));
    let rows = all;
    if (opts.projectId) rows = rows.filter(r => r.id === opts.projectId);
    if (opts.storyType) rows = rows.filter(r => r.type === opts.storyType);
    if (opts.platform) rows = rows.filter(r => (r.target_platform || 'generic') === opts.platform);
    const filtered = !!(opts.projectId || opts.storyType || opts.platform);
    return { ids: filtered ? rows.map(r => r.id) : null, matched: rows, filtered };
  }

  private scopeClause(scope: Scope, col = 'project_id'): { clause: string; params: string[] } {
    if (!scope.filtered) return { clause: '', params: [] };
    const ids = scope.ids || [];
    if (!ids.length) return { clause: ` AND ${col} IS NULL AND 1=0`, params: [] };
    const placeholders = ids.map(() => '?').join(',');
    return { clause: ` AND ${col} IN (${placeholders})`, params: ids };
  }

  /** 每个章节「最新一份质检报告」的 id（旧报告问题随重写失效，不计入当前待改） */
  private latestReportIds(scope: Scope): string[] {
    const sc = this.scopeClause(scope);
    const rows = this.safeAll(
      `SELECT id, chapter_id,source_type,scope,created_at FROM writing_quality_reports WHERE chapter_id IS NOT NULL${sc.clause} ORDER BY created_at ASC`,
      sc.params,
    );
    const latest = new Map<string, string>();
    for (const r of rows) latest.set(`${r.chapter_id}:${r.source_type}:${r.scope}`, String(r.id));
    return [...latest.values()];
  }

  // ───────────────────────── 对外入口 ─────────────────────────

  overview(opts: OverviewOptions = {}) {
    const days = Number(opts.days) || 30;
    const scope = this.resolveScope(opts);
    const latestIds = this.latestReportIds(scope);
    const wordCompliance = this.wordCompliance(scope);
    const kpis = this.kpis(days, scope, latestIds);
    const processAgg = this.process(days, scope);
    kpis.wordComplianceRate = wordCompliance.rate;
    kpis.firstPassRate = processAgg.firstPassRate; // 与环节表/正文按章口径一致，不再按 LLM 调用条数算
    return {
      generatedAt: new Date().toISOString(),
      windowDays: days,
      scope: {
        filtered: scope.filtered,
        projectCount: scope.filtered ? (scope.ids || []).length : null,
      },
      filterOptions: this.filterOptions(),
      kpis,
      qualityDimensions: this.qualityDimensions(scope, latestIds),
      // 七维下钻：每个维度 → 具体问题类型 → 涉及章节/示例（前端点击展开并跳转处理）
      issueDrilldown: this.issueDrilldown(scope, latestIds),
      currentIssues: this.currentIssueTypes(scope, latestIds),
      consistency: this.currentConsistency(scope),
      tagFit: this.tagFit(latestIds),
      wordCompliance,
      revision: this.revision(scope),
      process: processAgg,
      generationRuns: this.generationRuns(days, scope),
      // 正文首版一次到位率 / 平均补字轮次 / 平均对齐回炉次数（解释少字补几轮、为何反复重写）
      bodyConvergence: this.bodyConvergence(days, scope),
      // 正文反复回炉的具体原因分布（硬红线规则号 / 大纲不符，大白话）
      repairReasons: this.repairReasons(scope),
      // 章节级质量矩阵（每章：字数/对话/段落/钩子/返工/质检分，可排序下钻）
      chapterMatrix: this.chapterMatrix(scope),
      // 当前值 vs 所在平台·长短篇基准（确定性现算，对照受众/爆款基准线）
      benchmarkCompare: this.benchmarkCompare(scope),
      distributions: this.distributions(scope),
      trend: this.trend(days, scope),
    };
  }

  health(days = 30) {
    const scope: Scope = { ids: null, matched: [], filtered: false };
    const latestIds = this.latestReportIds(scope);
    const k = this.kpis(days, scope, latestIds);
    return {
      projectCount: k.projectCount,
      chapterCount: k.writtenChapterCount,
      totalWords: k.totalWords,
      llmCalls: k.llmCalls,
      firstPassRate: k.firstPassRate,
      openIssues: k.currentIssues,
    };
  }

  /** Generation attempts include failures before a provider call; never count these as LLM usage. */
  private generationRuns(days: number, scope: Scope) {
    const sc = this.scopeClause(scope);
    const params = [new Date(Date.now() - days * DAY).toISOString(), ...sc.params];
    try {
      const totals = this.db().prepare(`SELECT COUNT(*) total,
        SUM(status='failed') failed,SUM(status='running') running,SUM(status='success') succeeded,
        SUM(status='cancelled') cancelled FROM generation_runs WHERE started_at>=?${sc.clause}`).get(...params) as any;
      const recent = this.db().prepare(`SELECT id,project_id,scenario,status,error,started_at,gate_status,standards_snapshot
        FROM generation_runs WHERE started_at>=?${sc.clause} ORDER BY started_at DESC LIMIT 20`).all(...params) as any[];
      return { available: true, total: Number(totals.total), failed: Number(totals.failed), running: Number(totals.running),
        succeeded: Number(totals.succeeded), cancelled: Number(totals.cancelled),
        recent: recent.map(r => ({ ...r, label: scenarioLabel(r.scenario), standards: this.parseJson(r.standards_snapshot) })) };
    } catch (error) {
      return { available: false, error: '生成运行记录读取失败，请检查数据库迁移', recent: [] };
    }
  }

  filterOptions() {
    const projects = this.safeAll(`SELECT id, title, type, target_platform FROM projects ORDER BY updated_at DESC`)
      .map(p => ({
        id: String(p.id),
        title: p.title || '未命名',
        type: p.type || null,
        typeLabel: storyTypeLabel(p.type),
        platform: p.target_platform || 'generic',
        platformLabel: platformLabel(p.target_platform),
      }));
    const platformSet = new Set<string>();
    const typeSet = new Set<string>();
    projects.forEach(p => { platformSet.add(p.platform); typeSet.add(p.type || 'unknown'); });
    return {
      projects,
      platforms: [...platformSet].map(v => ({ value: v, label: platformLabel(v) })),
      storyTypes: [...typeSet].filter(v => v !== 'unknown').map(v => ({ value: v, label: storyTypeLabel(v) })),
    };
  }

  // ───────────────────────── 质量 KPI（真实口径） ─────────────────────────

  private kpis(days: number, scope: Scope, latestIds: string[]) {
    const sinceIso = new Date(Date.now() - days * DAY).toISOString();
    const pCount = scope.filtered
      ? (scope.ids || []).length
      : Number(this.safeOne(`SELECT COUNT(*) n FROM projects`)?.n || 0);

    // 章节：区分有正文 / 空壳，并统计字数（章节按 project_id 过滤；项目目标区间在 wordCompliance 处理）
    const chSc = this.scopeClause(scope);
    const chAgg = this.safeOne(
      `SELECT COUNT(*) n,
              COALESCE(SUM(CASE WHEN word_count>0 THEN 1 ELSE 0 END),0) written,
              COALESCE(SUM(CASE WHEN COALESCE(word_count,0)=0 THEN 1 ELSE 0 END),0) empty,
              COALESCE(SUM(word_count),0) words,
              COALESCE(SUM(CASE WHEN word_count>0 THEN word_count ELSE 0 END),0) writtenWords,
              COALESCE(SUM(CASE WHEN word_count>0 AND auto_quality_status='ok' THEN 1 ELSE 0 END),0) aqOk,
              COALESCE(SUM(CASE WHEN word_count>0 AND auto_quality_status='needs_rewrite' THEN 1 ELSE 0 END),0) aqNeedsRewrite,
              COALESCE(SUM(CASE WHEN word_count>0 AND auto_quality_status='failed' THEN 1 ELSE 0 END),0) aqFailed,
              COALESCE(SUM(CASE WHEN word_count>0 AND auto_quality_status='running' THEN 1 ELSE 0 END),0) aqRunning,
              COALESCE(SUM(CASE WHEN word_count>0 AND auto_quality_status IS NULL THEN 1 ELSE 0 END),0) aqNone
       FROM chapters WHERE 1=1${chSc.clause}`, chSc.params,
    );
    const written = Number(chAgg?.written || 0);
    const totalWords = Number(chAgg?.writtenWords || 0);

    // 当前有效问题（最新报告口径）
    const curIssues = this.countCurrentIssues(latestIds);
    const curCons = this.countCurrentConsistency(scope);

    // 平均质量分（每章最新报告）
    let avgScore: number | null = null;
    if (latestIds.length) {
      const ph = latestIds.map(() => '?').join(',');
      const row = this.safeOne(`SELECT AVG(overall_score) a FROM writing_quality_reports WHERE id IN (${ph})`, latestIds);
      avgScore = row?.a != null ? Math.round(Number(row.a)) : null;
    }

    // 有修订记录的章节数
    const rvSc = this.scopeClause(scope);
    const rewriteChapterCount = Number(this.safeOne(
      `SELECT COUNT(DISTINCT chapter_id) n FROM writing_revision_records WHERE 1=1${rvSc.clause}`, rvSc.params,
    )?.n || 0);

    // 生成遥测（时间窗）
    const mSc = this.scopeClause(scope);
    const calls = this.safeOne(
      `SELECT COUNT(*) n,
              COALESCE(SUM(CASE WHEN status='success' THEN 1 ELSE 0 END),0) ok,
              COALESCE(SUM(CASE WHEN attempt=0 AND status='success' THEN 1 ELSE 0 END),0) firstOk
       FROM generation_step_metrics WHERE created_at>=?${mSc.clause}`,
      [sinceIso, ...mSc.params],
    );
    const llmCalls = Number(calls?.n || 0);

    return {
      projectCount: pCount,
      chapterCount: Number(chAgg?.n || 0),
      writtenChapterCount: written,
      emptyChapterCount: Number(chAgg?.empty || 0),
      totalWords,
      avgChapterWords: written ? Math.round(totalWords / written) : 0,
      wordComplianceRate: null as number | null, // 由 wordCompliance 回填
      avgQualityScore: avgScore,
      currentIssues: curIssues,
      currentConsistency: curCons,
      rewriteChapterCount,
      llmCalls,
      llmSuccess: Number(calls?.ok || 0),
      llmSuccessRate: llmCalls ? Number((Number(calls?.ok || 0) / llmCalls).toFixed(3)) : null,
      firstPassRate: llmCalls ? Number((Number(calls?.firstOk || 0) / llmCalls).toFixed(3)) : null,
      // 自动质检覆盖（真实口径）：有正文章节里 成功/失败/进行中/未跑 各多少，失败即需作者重跑
      autoQuality: {
        written,
        ok: Number(chAgg?.aqOk || 0),
        needsRewrite: Number(chAgg?.aqNeedsRewrite || 0),
        failed: Number(chAgg?.aqFailed || 0),
        running: Number(chAgg?.aqRunning || 0),
        none: Number(chAgg?.aqNone || 0),
      },
    };
  }

  /** 当前有效 issue 明细行（最新报告 + open），供维度/类型聚合复用 */
  private currentIssueRows(latestIds: string[]): any[] {
    if (!latestIds.length) return [];
    const ph = latestIds.map(() => '?').join(',');
    return this.safeAll(
      `SELECT issue_type, chapter_id, severity FROM writing_quality_issues
       WHERE status='open' AND report_id IN (${ph})`, latestIds,
    );
  }

  private countCurrentIssues(latestIds: string[]): number {
    return this.currentIssueRows(latestIds).length;
  }

  // ───────────────────────── 质量维度画像 ─────────────────────────

  private qualityDimensions(scope: Scope, latestIds: string[]) {
    const rows = this.currentIssueRows(latestIds);
    const map = new Map<QualityDim, { count: number; chapters: Set<string>; maxSeverity: number }>();
    const sevRank: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
    for (const r of rows) {
      const dim = qualityDimensionOf(r.issue_type);
      if (!map.has(dim)) map.set(dim, { count: 0, chapters: new Set(), maxSeverity: 0 });
      const e = map.get(dim)!;
      e.count++;
      if (r.chapter_id) e.chapters.add(String(r.chapter_id));
      e.maxSeverity = Math.max(e.maxSeverity, sevRank[r.severity] || 1);
    }
    const rankSev: Record<number, string> = { 1: 'low', 2: 'medium', 3: 'high', 4: 'critical' };
    return QUALITY_DIM_ORDER.filter(d => map.has(d)).map(d => {
      const e = map.get(d)!;
      return {
        dim: d.dim,
        name: QUALITY_DIM_LABEL[d],
        count: e.count,
        chapterCount: e.chapters.size,
        maxSeverity: rankSev[e.maxSeverity] || 'low',
        maxSeverityLabel: severityLabel(rankSev[e.maxSeverity] || 'low'),
      };
    }).sort((a, b) => b.count - a.count);
  }

  private currentIssueTypes(scope: Scope, latestIds: string[]) {
    const rows = this.currentIssueRows(latestIds);
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.issue_type, (m.get(r.issue_type) || 0) + 1);
    return [...m.entries()]
      .map(([value, count]) => ({ value, key: qualityIssueLabel(value), count }))
      .sort((a, b) => b.count - a.count);
  }

  // ───────────────────────── 当前一致性问题（每章每类只留最新未解决） ─────────────────────────

  private currentConsistencyRows(scope: Scope): any[] {
    const sc = this.scopeClause(scope, 'i.project_id');
    const rows = this.safeAll(
      `SELECT i.issue_type check_type,i.severity,c.chapter_index,i.created_at detected_at
       FROM writing_quality_issues i LEFT JOIN chapters c ON c.id=i.chapter_id
       WHERE i.status='open' AND (i.issue_type LIKE 'consistency.%' OR i.issue_type='originality'
         OR i.issue_type='outline_alignment' OR i.issue_type LIKE 'hardline.%')${sc.clause}
       ORDER BY i.created_at ASC`, sc.params,
    );
    const latest = new Map<string, any>();
    for (const r of rows) {
      r.check_type = String(r.check_type).replace(/^consistency\./, '');
      latest.set(`${r.chapter_index}::${r.check_type}`, r);
    }
    return [...latest.values()];
  }

  private countCurrentConsistency(scope: Scope): number {
    return this.currentConsistencyRows(scope).length;
  }

  private currentConsistency(scope: Scope) {
    const rows = this.currentConsistencyRows(scope);
    const byType = new Map<string, number>();
    const bySev = new Map<string, number>();
    for (const r of rows) {
      byType.set(r.check_type, (byType.get(r.check_type) || 0) + 1);
      bySev.set(r.severity, (bySev.get(r.severity) || 0) + 1);
    }
    return {
      total: rows.length,
      types: [...byType.entries()].map(([value, count]) => ({ value, key: checkTypeLabel(value), count })).sort((a, b) => b.count - a.count),
      severity: [...bySev.entries()].map(([value, count]) => ({ value, key: severityLabel(value), count })).sort((a, b) => b.count - a.count),
    };
  }

  // ─────────── 标签契合（平台/分类/基调/文风/流派/视角，六维） ───────────
  // 维度列表不在看板侧手写：与生成侧执行标准、质检评分共用 shared 的唯一来源
  // （shared/src/execution-standard-dimensions.ts）。否则会出现「生成按六维执行、
  // 看板只统计四维」——分类与视角用户设了却看不见。

  private tagFit(latestIds: string[]) {
    if (!latestIds.length) return { available: false, items: [], best: null, worst: null, missingDims: [], dimensionCount: 0, chapterWorst: [], chapterBest: null };
    const ph = latestIds.map(() => '?').join(',');
    const reports = this.safeAll(`SELECT payload FROM writing_quality_reports WHERE id IN (${ph})`, latestIds);
    const requiredFor = (payload: any): string[] => Array.isArray(payload?.tagFitCoverage?.required)
      ? payload.tagFitCoverage.required
      : EXECUTION_STANDARD_DIMENSIONS.map(d => d.dimension); // 旧报告没有范围快照，沿用当时六维口径。
    // 这里曾有过第二份固定六维看板口径，后果是新项目没有的投稿字段被报成“漏评”。
    const requiredKeys = new Set(reports.flatMap(r => requiredFor(this.parseJson(r.payload))));
    const dims = EXECUTION_STANDARD_DIMENSIONS.filter(d => requiredKeys.has(d.dimension));
    const sums: Record<string, { sum: number; n: number }> = {};
    const missingTally: Record<string, number> = {};
    for (const d of dims) { sums[d.dimension] = { sum: 0, n: 0 }; missingTally[d.dimension] = 0; }
    for (const r of reports) {
      const payload = this.parseJson(r.payload);
      const fit = payload?.tagFit;
      for (const d of dims) {
        if (!requiredFor(payload).includes(d.dimension)) continue;
        const raw = fit ? fit[d.dimension] : null;
        const v = Number(raw);
        if (raw !== null && raw !== undefined && Number.isFinite(v)) { sums[d.dimension].sum += v; sums[d.dimension].n++; }
        else missingTally[d.dimension]++;
      }
    }
    const items = dims.map(d => sums[d.dimension].n
      ? { dim: d.dimension, name: EXECUTION_STANDARD_DIMENSION_LABELS[d.dimension], score: Math.round(sums[d.dimension].sum / sums[d.dimension].n) }
      : { dim: d.dimension, name: EXECUTION_STANDARD_DIMENSION_LABELS[d.dimension], score: null });
    const scored = items.filter(x => x.score != null) as Array<{ dim: string; name: string; score: number }>;
    const best = scored.length ? scored.reduce((a, b) => (b.score > a.score ? b : a)) : null;
    const worst = scored.length ? scored.reduce((a, b) => (b.score < a.score ? b : a)) : null;
    // 未评维度显式列出：既不折算 0 分，也不从分母里消失（那等于把「没评」静默算成「评得好」）。
    const missingDims = dims
      .filter(d => missingTally[d.dimension] > 0)
      .map(d => ({ dim: d.dimension, name: EXECUTION_STANDARD_DIMENSION_LABELS[d.dimension], reports: missingTally[d.dimension] }));
    // 每章标签契合明细（找最贴合 / 最需加强的具体章节，供下钻跳转；必须带 chapterId，否则跳不过去）
    const chRows = this.safeAll(
      `SELECT r.payload payload, c.id cid, c.chapter_index cidx, c.title ctitle, p.id pid, p.title ptitle
       FROM writing_quality_reports r
       LEFT JOIN chapters c ON c.id=r.chapter_id
       LEFT JOIN projects p ON p.id=r.project_id
       WHERE r.id IN (${ph})`, latestIds,
    );
    const chapters: any[] = [];
    for (const r of chRows) {
      const payload = this.parseJson(r.payload);
      const fit = payload.tagFit;
      if (!fit) continue;
      const scores: Record<string, number | null> = {};
      let sum = 0;
      let n = 0;
      for (const d of dims) {
        if (!requiredFor(payload).includes(d.dimension)) continue;
        const raw = fit[d.dimension];
        const v = Number(raw);
        if (raw !== null && raw !== undefined && Number.isFinite(v)) { scores[d.dimension] = v; sum += v; n++; }
        else scores[d.dimension] = null;
      }
      if (!n) continue;
      chapters.push({
        projectId: r.pid, projectTitle: r.ptitle, chapterId: r.cid, chapterIndex: r.cidx,
        chapterTitle: r.ctitle, scores, avg: Math.round(sum / n),
      });
    }
    chapters.sort((a, b) => a.avg - b.avg);
    return {
      available: scored.length > 0, items, best, worst, missingDims, dimensionCount: dims.length,
      chapterWorst: chapters.slice(0, 5),
      chapterBest: chapters.length ? chapters[chapters.length - 1] : null,
    };
  }

  // ───────────────────────── 七维问题下钻（维度→类型→具体章节/示例） ─────────────────────────
  private issueDrilldown(scope: Scope, latestIds: string[]) {
    if (!latestIds.length) return [];
    const ph = latestIds.map(() => '?').join(',');
    const sc = this.scopeClause(scope, 'i.project_id');
    const rows = this.safeAll(
      `SELECT i.issue_type type, i.severity sev, i.title ititle, i.evidence evid,
              i.project_id pid, i.chapter_id cid, c.chapter_index cidx, c.title ctitle, p.title ptitle
       FROM writing_quality_issues i
       LEFT JOIN chapters c ON c.id=i.chapter_id
       LEFT JOIN projects p ON p.id=i.project_id
       WHERE i.status='open' AND i.report_id IN (${ph})${sc.clause}
       ORDER BY i.created_at`, [...latestIds, ...sc.params],
    );
    const sevRank: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
    const rankSev: Record<number, string> = { 1: 'low', 2: 'medium', 3: 'high', 4: 'critical' };
    const dims = new Map<string, any>();
    for (const r of rows) {
      const dim = qualityDimensionOf(r.type);
      if (!dims.has(dim)) dims.set(dim, { dim, name: QUALITY_DIM_LABEL[dim], count: 0, chapters: new Set<string>(), types: new Map<string, any>() });
      const d = dims.get(dim);
      d.count++;
      if (r.cid) d.chapters.add(String(r.cid));
      if (!d.types.has(r.type)) d.types.set(r.type, { type: r.type, label: qualityIssueLabel(r.type), count: 0, maxSev: 1, items: [] });
      const t = d.types.get(r.type);
      t.count++;
      t.maxSev = Math.max(t.maxSev, sevRank[r.sev] || 1);
      if (t.items.length < 3) {
        t.items.push({
          projectId: r.pid, projectTitle: r.ptitle, chapterId: r.cid, chapterIndex: r.cidx,
          chapterTitle: r.ctitle, title: r.ititle, evidence: String(r.evid || '').slice(0, 90), severity: r.sev,
        });
      }
    }
    return [...dims.values()].map(d => ({
      dim: d.dim, name: d.name, count: d.count, chapterCount: d.chapters.size,
      types: [...d.types.values()].map((t: any) => ({
        type: t.type, label: t.label, count: t.count,
        maxSeverity: rankSev[t.maxSev], maxSeverityLabel: severityLabel(rankSev[t.maxSev]), items: t.items,
      })).sort((a: any, b: any) => b.count - a.count),
    })).sort((a, b) => b.count - a.count);
  }

  // ───────────────────────── 正文收敛效率（首版到位率/补字/回炉轮次） ─────────────────────────
  private bodyConvergence(days: number, scope: Scope) {
    const bodyKeys = new Set(['body_first', 'body_length_retry', 'body_alignment_repair', 'body_benchmark_refine']);
    const body = this.metricRows(days, scope).filter(r => bodyKeys.has(r.step_key));
    const first = body.filter(r => r.step_key === 'body_first' && r.status === 'success');
    const firstHit = first.filter(r => {
      const t = Number(r.target_words) || 0;
      const o = Number(r.output_words) || 0;
      return t > 0 && o >= t * 0.9 && o <= t * 1.15;
    });
    const byChapter = new Map<string, { len: number; rep: number; bench: number }>();
    for (const r of body) {
      const k = `${r.project_id || '?'}::${r.chapter_index ?? '?'}`;
      if (!byChapter.has(k)) byChapter.set(k, { len: 0, rep: 0, bench: 0 });
      const e = byChapter.get(k)!;
      if (r.step_key === 'body_length_retry') e.len++;
      if (r.step_key === 'body_alignment_repair') e.rep++;
      if (r.step_key === 'body_benchmark_refine') e.bench++;
    }
    const arr = [...byChapter.values()];
    const avg = (a: number[]) => a.length ? Number((a.reduce((x, y) => x + y, 0) / a.length).toFixed(2)) : 0;
    const successCalls = body.filter(r => r.status === 'success').length;
    return {
      bodyCallCount: successCalls,
      chapterCount: byChapter.size,
      avgVersions: byChapter.size ? Number((successCalls / byChapter.size).toFixed(2)) : 0,
      firstCount: first.length,
      firstHitCount: firstHit.length,
      firstHitRate: first.length ? Number((firstHit.length / first.length).toFixed(3)) : null,
      avgLengthRetry: avg(arr.map(a => a.len)),
      avgAlignmentRepair: avg(arr.map(a => a.rep)),
      avgBenchmarkRefine: avg(arr.map(a => a.bench)),
      chaptersNeedLengthRetry: arr.filter(a => a.len > 0).length,
      chaptersNeedRepair: arr.filter(a => a.rep > 0).length,
      chaptersNeedBenchmarkRefine: arr.filter(a => a.bench > 0).length,
    };
  }

  // ───────────────────────── 正文反复回炉的原因分布（大白话） ─────────────────────────
  private repairReasons(scope: Scope) {
    const sc = this.scopeClause(scope, 'i.project_id');
    const rows = this.safeAll(
      `SELECT i.issue_type check_type,i.summary message,i.payload FROM writing_quality_issues i
       WHERE i.status='open' AND (i.issue_type LIKE 'consistency.%' OR i.issue_type='originality'
         OR i.issue_type='outline_alignment' OR i.issue_type LIKE 'hardline.%')${sc.clause}`, sc.params,
    );
    const m = new Map<string, number>();
    for (const r of rows) {
      let label: string;
      let source = '';
      try { source = this.parseJson(r.payload)?.qualityIssue?.source || ''; } catch { /* ignore malformed legacy payload */ }
      const checkType = String(r.check_type).replace(/^consistency\./, '');
      if (source === 'alignment_verifier_hardline' || checkType.startsWith('hardline.')) {
        const mm = String(r.message || '').match(/【硬红线·确定性扫描·([^】]+)】/);
        label = mm ? hardlineRuleLabel(mm[1]) : '硬红线违规';
      } else {
        label = checkTypeLabel(checkType);
      }
      m.set(label, (m.get(label) || 0) + 1);
    }
    return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
  }

  // ───────────────────────── 字数达标（对照每本书目标区间） ─────────────────────────

  private wordCompliance(scope: Scope) {
    const sc = this.scopeClause(scope, 'c.project_id');
    const rows = this.safeAll(
      `SELECT c.word_count wc, p.settings settings, p.type ptype
       FROM chapters c JOIN projects p ON p.id=c.project_id WHERE 1=1${sc.clause}`, sc.params,
    );
    let ok = 0, short = 0, long = 0, written = 0, sumWords = 0, deficitSum = 0;
    for (const r of rows) {
      const w = Number(r.wc) || 0;
      if (w <= 0) continue; // 空壳章节不参与字数达标
      written++;
      sumWords += w;
      const min = CHAPTER_WORD_RANGE.min;
      const max = CHAPTER_WORD_RANGE.max;
      if (w < min) { short++; deficitSum += (min - w); }
      else if (w > max) long++;
      else ok++;
    }
    const rate = written ? Number((ok / written).toFixed(3)) : null;
    return {
      writtenChapters: written,
      ok, short, long,
      rate,
      avgWords: written ? Math.round(sumWords / written) : 0,
      avgDeficit: short ? Math.round(deficitSum / short) : 0,
    };
  }

  // ─────────────── 章节级质量矩阵 + 当前值 vs 平台基准（确定性现算，不依赖 LLM） ───────────────

  /** 拉取 scope 内所有「有正文」章节，并按该书平台·长短篇基准现算文本指标；附带返工数与最新质检分 */
  private chapterRows(scope: Scope): any[] {
    const sc = this.scopeClause(scope, 'c.project_id');
    const chapters = this.safeAll(
      'SELECT c.id cid,c.project_id pid,c.chapter_index idx,c.title ctitle,c.word_count wc,c.status cstatus,c.content content,'
      + ' p.title ptitle,p.type ptype,p.target_platform platform,p.settings settings '
      + 'FROM chapters c JOIN projects p ON p.id=c.project_id '
      + 'WHERE c.word_count>0 AND length(c.content)>0' + sc.clause + ' ORDER BY p.title,c.chapter_index',
      sc.params,
    );
    const revMap = new Map<string, number>();
    for (const r of this.safeAll('SELECT chapter_id cid, COUNT(*) n FROM writing_revision_records WHERE chapter_id IS NOT NULL GROUP BY chapter_id')) {
      revMap.set(String(r.cid), Number(r.n));
    }
    const scoreMap = new Map<string, number>();
    // 章节质量分的唯一权威 = 每章「最新一条」报告表列 overall_score（旧报告已 superseded、时间更早，
    // ASC 遍历时被最新值覆盖）。此前误从 payload.overallScore 取，但 payload 只存 unifiedScore、并无该字段，
    // 导致看板/项目总览章节行永远取不到分、恒显「待质检」。直接 SELECT 表列，杜绝取错字段。
    for (const r of this.safeAll('SELECT chapter_id cid, overall_score score FROM writing_quality_reports WHERE chapter_id IS NOT NULL ORDER BY created_at ASC')) {
      const v = Number((r as any).score);
      if (Number.isFinite(v)) scoreMap.set(String(r.cid), v);
    }
    const rows: any[] = [];
    for (const c of chapters) {
      const b = getPlatform(c.platform);
      const t = targetForLength(b, c.ptype);
      const measured = measureAgainstTarget(String(c.content || ''), t);
      const wMin = CHAPTER_WORD_RANGE.min;
      const wMax = CHAPTER_WORD_RANGE.max;
      const checks: Record<string, string> = {};
      for (const x of measured.rows) checks[x.key] = x.status;
      const m = measured.metrics;
      // 追读风险（创作侧可计算的读者留存代理信号，对应平台“章尾钩子/对话推进/文字墙/单章甜区/开篇钩”）
      const riskReasons: string[] = [];
      if (!m.endingHasHook) riskReasons.push('章尾无钩子');
      if (checks.dialogueRatio === 'bad') riskReasons.push('对话偏少、靠叙述推进');
      if (checks.avgParaChars === 'bad' || checks.longParaRatio === 'bad') riskReasons.push('段落偏长、易成文字墙');
      if (m.words < wMin || m.words > wMax) riskReasons.push('字数偏离平台甜区');
      if (Number(c.idx) === 1 && !m.openingHasHook) riskReasons.push('开篇缺钩子');
      const retentionRisk = riskReasons.length >= 3 ? 2 : riskReasons.length >= 1 ? 1 : 0;
      rows.push({
        projectId: c.pid, projectTitle: c.ptitle, platform: String(c.platform || 'generic'), platformLabel: b.label, storyType: c.ptype,
        chapterIndex: c.idx, chapterId: c.cid, title: c.ctitle, status: c.cstatus,
        words: m.words, wordMin: wMin, wordMax: wMax,
        wordStatus: m.words < wMin ? 'short' : m.words > wMax ? 'long' : 'ok',
        dialogueRatio: m.dialogueRatio, avgParaChars: m.avgParaChars, longParaRatio: m.longParaRatio,
        openingHook: m.openingHasHook, endingHook: m.endingHasHook,
        checks, repairCount: revMap.get(String(c.cid)) || 0,
        retentionRisk, retentionReasons: riskReasons,
        qualityScore: scoreMap.has(String(c.cid)) ? scoreMap.get(String(c.cid))! : null,
      });
    }
    return rows;
  }

  private static rateOf(list: any[], ok: (r: any) => boolean): number | null {
    if (!list.length) return null;
    return Number((list.filter(ok).length / list.length).toFixed(3));
  }

  private chapterMatrix(scope: Scope) {
    const rows = this.chapterRows(scope);
    return {
      available: rows.length > 0,
      total: rows.length,
      // 各检查项的章节达标率（大白话：多少章在这项上达标）
      passRate: {
        words: PlatformAnalyticsService.rateOf(rows, r => r.wordStatus === 'ok'),
        dialogue: PlatformAnalyticsService.rateOf(rows, r => r.checks.dialogueRatio === 'ok'),
        avgPara: PlatformAnalyticsService.rateOf(rows, r => r.checks.avgParaChars === 'ok'),
        longPara: PlatformAnalyticsService.rateOf(rows, r => r.checks.longParaRatio !== 'bad'),
        opening: PlatformAnalyticsService.rateOf(rows, r => r.openingHook),
        ending: PlatformAnalyticsService.rateOf(rows, r => r.endingHook),
        retentionSafe: PlatformAnalyticsService.rateOf(rows, r => r.retentionRisk === 0),
      },
      rows,
    };
  }

  /** 按「平台 × 长短篇」分组，把当前章节均值与该平台基准线并排，差距一眼可见 */
  private benchmarkCompare(scope: Scope) {
    const rows = this.chapterRows(scope);
    const groups = new Map<string, any[]>();
    for (const r of rows) {
      const k = r.platform + '__' + (r.storyType || 'short_story');
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(r);
    }
    const pct = (v: number) => Math.round(v * 100) + '%';
    const out: any[] = [];
    for (const [k, list] of groups) {
      const [platform, type] = k.split('__');
      const b = getPlatform(platform);
      const t = targetForLength(b, type);
      const avg = (arr: number[]) => arr.length ? Number((arr.reduce((a, x) => a + x, 0) / arr.length).toFixed(3)) : 0;
      const dialogue = avg(list.map(x => Number(x.dialogueRatio)));
      const avgPara = Math.round(avg(list.map(x => Number(x.avgParaChars))));
      const longPara = avg(list.map(x => Number(x.longParaRatio)));
      const openRate = avg(list.map(x => x.openingHook ? 1 : 0));
      const endRate = avg(list.map(x => x.endingHook ? 1 : 0));
      const mk = (label: string, value: string, target: string, status: string, advice?: string) => ({ label, value, target, status, advice: advice || '' });
      out.push({
        platform, platformLabel: b.label, storyType: type, chapterCount: list.length,
        audience: b.audience,
        metrics: [
          mk('对话占比', pct(dialogue), pct(t.dialogueRatio[0]) + '–' + pct(t.dialogueRatio[1]),
            dialogue >= t.dialogueRatio[0] && dialogue <= t.dialogueRatio[1] ? 'ok' : dialogue < t.dialogueRatio[0] ? 'bad' : 'warn',
            dialogue < t.dialogueRatio[0] ? '对话偏少，把信息和冲突放进人物对话' : ''),
          mk('平均段落字数', avgPara + ' 字', '≤ ' + t.avgParaCharsMax + ' 字', avgPara <= t.avgParaCharsMax ? 'ok' : 'bad'),
          mk('超长段落占比', pct(longPara), '≤ ' + pct(t.longParaRatioMax), longPara <= t.longParaRatioMax ? 'ok' : 'warn'),
          mk('开篇钩子达标率', pct(openRate), '100%', openRate >= 1 ? 'ok' : openRate >= 0.8 ? 'warn' : 'bad'),
          mk('章尾留钩达标率', pct(endRate), '100%', endRate >= 1 ? 'ok' : endRate >= 0.8 ? 'warn' : 'bad'),
        ],
      });
    }
    return { available: out.length > 0, groups: out };
  }

  // ───────────────────────── 返工（修订记录） ─────────────────────────

  private revision(scope: Scope) {
    const sc = this.scopeClause(scope, 'r.project_id');
    const perChapter = this.safeAll(
      `SELECT c.id cid, c.title title, c.chapter_index idx, COUNT(r.id) cnt
       FROM writing_revision_records r JOIN chapters c ON c.id=r.chapter_id
       WHERE 1=1${sc.clause} GROUP BY c.id ORDER BY cnt DESC`, sc.params,
    );
    const counts = perChapter.map(r => Number(r.cnt));
    const dist = { '1-2': 0, '3-4': 0, '5+': 0 };
    for (const n of counts) {
      if (n <= 2) dist['1-2']++;
      else if (n <= 4) dist['3-4']++;
      else dist['5+']++;
    }
    const total = counts.reduce((a, b) => a + b, 0);
    return {
      revisedChapters: perChapter.length,
      totalRevisions: total,
      avgPerChapter: perChapter.length ? Number((total / perChapter.length).toFixed(1)) : 0,
      heavyChapters: perChapter.filter(r => Number(r.cnt) >= 3).slice(0, 20).map(r => ({
        chapterId: r.cid, chapterIndex: r.idx, title: r.title, count: Number(r.cnt),
      })),
      distribution: Object.entries(dist).map(([key, count]) => ({ key, count })),
    };
  }

  // ───────────────────────── 生成步骤返工与稳定性（不展示耗时为主） ─────────────────────────

  private metricRows(days: number, scope: Scope): any[] {
    const sinceIso = new Date(Date.now() - days * DAY).toISOString();
    const sc = this.scopeClause(scope);
    return this.safeAll(
      `SELECT step_key, scenario, attempt, status, duration_ms, output_words, target_words, total_tokens, fail_reason, created_at, project_id, chapter_index
       FROM generation_step_metrics WHERE created_at>=?${sc.clause}`,
      [sinceIso, ...sc.params],
    );
  }

  private statOfList(list: any[]) {
    const calls = list.length;
    const firstOk = list.filter(r => Number(r.attempt) === 0 && r.status === 'success').length;
    const fail = list.filter(r => r.status !== 'success').length;
    const truncated = list.filter(r => r.status === 'truncated').length;
    const empty = list.filter(r => r.status === 'empty').length;
    const wordRows = list.filter(r => Number(r.target_words) > 0);
    const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
    return {
      calls,
      firstPassRate: calls ? Number((firstOk / calls).toFixed(3)) : null,
      avgAttempts: calls ? Number((list.reduce((a, r) => a + (Number(r.attempt) || 0), 0) / calls + 1).toFixed(2)) : null,
      failCount: fail, truncatedCount: truncated, emptyCount: empty,
      firstOkCount: firstOk, unitCount: list.filter(r => Number(r.attempt) === 0).length,
      avgOutputWords: avg(wordRows.map(r => Number(r.output_words) || 0)),
      avgTargetWords: avg(wordRows.map(r => Number(r.target_words) || 0)),
    };
  }

  private process(days: number, scope: Scope) {
    const rows = this.metricRows(days, scope);
    const baseOverall = this.statOfList(rows);
    // 同一章正文的首版/补字/对齐/基准精修全部归"正文写作"，按章聚成一行；其余按创作环节聚合
    const writingRows = rows.filter(r => scenarioGroupOf(r.scenario, r.step_key) === 'writing');
    const otherRows = rows.filter(r => scenarioGroupOf(r.scenario, r.step_key) !== 'writing');
    // 失败原因分类
    const errorKindMap = new Map<string, number>();
    for (const r of rows.filter(x => x.status !== 'success')) {
      let kind = r.status;
      const reason = String(r.fail_reason || '');
      if (/空内容/.test(reason)) kind = 'empty';
      else if (/截断|length/i.test(reason)) kind = 'truncated';
      else if (/ECONN|socket|timeout|terminated|network|fetch failed/i.test(reason)) kind = 'network_error';
      else if (/JSON|结构|校验/i.test(reason)) kind = '结构校验';
      const label = errorKindLabel(kind);
      errorKindMap.set(label, (errorKindMap.get(label) || 0) + 1);
    }
    // 非正文环节按 scenario（兜底 step_key）聚合
    const byScenario = new Map<string, any[]>();
    for (const r of otherRows) {
      const key = r.scenario || r.step_key || 'daily';
      if (!byScenario.has(key)) byScenario.set(key, []);
      byScenario.get(key)!.push(r);
    }
    const otherSteps = [...byScenario.entries()].map(([scenario, list]) => ({
      scenario, scenarioName: scenarioLabel(scenario), ...this.statOfList(list),
    })).filter(x => x.calls > 0);

    const steps: any[] = [];
    const bc = this.bodyConvergence(days, scope);
    if (bc.chapterCount > 0) {
      const bodyFirst = writingRows.filter(r => r.step_key === 'body_first');
      const wordRows = bodyFirst.filter(r => Number(r.target_words) > 0);
      const avgOut = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
      steps.push({
        scenario: '__body_writing__', scenarioName: '正文写作', isBody: true,
        calls: bc.chapterCount, llmCalls: bc.bodyCallCount,
        firstPassRate: bc.firstHitRate, avgAttempts: bc.avgVersions,
        avgLengthRetry: bc.avgLengthRetry, avgAlignmentRepair: bc.avgAlignmentRepair, avgBenchmarkRefine: bc.avgBenchmarkRefine,
        failCount: writingRows.filter(r => r.status !== 'success').length,
        truncatedCount: writingRows.filter(r => r.status === 'truncated').length,
        emptyCount: writingRows.filter(r => r.status === 'empty').length,
        avgOutputWords: avgOut(wordRows.map(r => Number(r.output_words) || 0)),
        avgTargetWords: avgOut(wordRows.map(r => Number(r.target_words) || 0)),
      });
    }
    steps.push(...otherSteps.sort((a, b) => (b.avgAttempts || 0) - (a.avgAttempts || 0)));

    // 总体一次成功率：正文按"章"、非正文按"环节发起单元(attempt=0)"加权，口径与每一行一致
    const bodyUnits = bc.chapterCount;
    const bodyHit = bc.firstHitCount;
    const otherUnits = otherSteps.reduce((a, x) => a + (x.unitCount || 0), 0);
    const otherHit = otherSteps.reduce((a, x) => a + (x.firstOkCount || 0), 0);
    const unitAll = bodyUnits + otherUnits;
    const unifiedFirstPass = unitAll ? Number(((bodyHit + otherHit) / unitAll).toFixed(3)) : null;
    return {
      ...baseOverall,
      firstPassRate: unifiedFirstPass,
      bodyChapters: bc.chapterCount,
      errorKinds: [...errorKindMap.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count),
      steps,
    };
  }

  // ───────────────────────── 宏观构成（只留平台/长短篇） ─────────────────────────

  private distributions(scope: Scope) {
    const pSc = this.scopeClause(scope, 'id');
    const projects = this.safeAll(`SELECT type, target_platform FROM projects WHERE 1=1${pSc.clause}`, pSc.params);
    const platformMap = new Map<string, number>();
    const typeMap = new Map<string, number>();
    for (const p of projects) {
      const pk = platformLabel(p.target_platform);
      platformMap.set(pk, (platformMap.get(pk) || 0) + 1);
      const tk = storyTypeLabel(p.type);
      typeMap.set(tk, (typeMap.get(tk) || 0) + 1);
    }
    const toArr = (m: Map<string, number>) => [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
    return { platform: toArr(platformMap), storyType: toArr(typeMap) };
  }

  // ───────────────────────── 每日变化（产出/生成/问题新增解决） ─────────────────────────

  private trend(days: number, scope: Scope) {
    const since = new Date(Date.now() - days * DAY).toISOString();
    const buckets: Record<string, TrendBucket> = {};
    const ensure = (d: string): TrendBucket | null => {
      if (!d) return null;
      if (!buckets[d]) buckets[d] = { date: d, llmCalls: 0, llmFail: 0, llmSuccess: 0, outputWords: 0, newProjects: 0, newChapters: 0, newIssues: 0, resolvedIssues: 0 };
      return buckets[d];
    };
    for (let i = days - 1; i >= 0; i--) ensure(new Date(Date.now() - i * DAY).toISOString().slice(0, 10));

    const mSc = this.scopeClause(scope);
    for (const r of this.safeAll(`SELECT status, output_words, created_at FROM generation_step_metrics WHERE created_at>=?${mSc.clause}`, [since, ...mSc.params])) {
      const b = ensure(this.dayKey(r.created_at)); if (!b) continue;
      b.llmCalls++;
      if (r.status === 'success') b.llmSuccess++; else b.llmFail++;
      b.outputWords += Number(r.output_words) || 0;
    }
    const pSc = this.scopeClause(scope, 'id');
    for (const r of this.safeAll(`SELECT created_at FROM projects WHERE created_at>=?${pSc.clause}`, [since, ...pSc.params])) {
      const b = ensure(this.dayKey(r.created_at)); if (b) b.newProjects++;
    }
    const cSc = this.scopeClause(scope);
    for (const r of this.safeAll(`SELECT created_at FROM chapters WHERE created_at>=?${cSc.clause}`, [since, ...cSc.params])) {
      const b = ensure(this.dayKey(r.created_at)); if (b) b.newChapters++;
    }
    for (const r of this.safeAll(`SELECT created_at, resolved_at FROM writing_quality_issues WHERE created_at>=?${cSc.clause}`, [since, ...cSc.params])) {
      const b1 = ensure(this.dayKey(r.created_at)); if (b1) b1.newIssues++;
      if (r.resolved_at && r.resolved_at >= since) { const b2 = ensure(this.dayKey(r.resolved_at)); if (b2) b2.resolvedIssues++; }
    }
    return Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date));
  }

  /** 启动/运行状态（迁移版本、只读执行标准版本、运行时长）。 */
  bootstrap() {
    const migrations = {
      appliedCount: 0,
      latestId: null as number | null,
      latestName: null as string | null,
      latestAt: null as string | null,
      fileCount: 0,
      pendingCount: 0,
    };
    try {
      const rows = this.safeAll(`SELECT id, name, executed_at FROM _migrations ORDER BY id`);
      migrations.appliedCount = rows.length;
      const last = rows[rows.length - 1];
      if (last) {
        migrations.latestId = Number(last.id);
        migrations.latestName = String(last.name);
        migrations.latestAt = String(last.executed_at);
      }
      try {
        const dir = path.join(__dirname, '..', '..', 'database', 'migrations');
        migrations.fileCount = fs.existsSync(dir)
          ? fs.readdirSync(dir).filter(f => /^\d+_.*\.(ts|js)$/.test(f) && !f.endsWith('.d.ts') && !f.includes('.spec.')).length
          : rows.length;
        migrations.pendingCount = Math.max(0, migrations.fileCount - migrations.appliedCount);
      } catch {
        migrations.fileCount = rows.length;
      }
    } catch {
      /* 迁移表查询失败不拖垮整体 */
    }

    const standards = {
      total: SEED_MODULE_STANDARDS.length,
      maxVersion: SEED_BASELINE_VERSION,
    };

    return {
      serverStartedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      migrations,
      standards,
    };
  }
}
