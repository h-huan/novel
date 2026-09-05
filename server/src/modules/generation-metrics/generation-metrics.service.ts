import { aggregateProjectScore, type StageScore } from '../writing-quality/stage-score';
import { qualityGate, qualityIssue } from '../writing-quality/quality-issue';
import { readConstitution } from '../project/creative-constitution';
/**
 * GenerationMetricsService — 全链路生成步骤遥测与"首版一次到位"自优化
 *
 * 设计原则：
 * 1) 一处记录、全步骤覆盖：RealLLMService 每次物理 LLM 调用结束都调 record()，
 *    题材/大纲/世界观/角色/组织/伏笔/时间线/正文/精修…无需各自手写埋点。
 * 2) 透明化：getFlowSummary / getOverview / getRecentBottlenecks 把"哪步卡、重试几轮、
 *    多久、为什么、目标 vs 实际字数"聚合出来，供首页与项目仪表盘展示给作者。
 * 3) 闭环自优化：getLengthCalibration 用历史"目标字数→首版实际字数"产出比做校准，
 *    让首版 prompt 按模型真实产出能力铺够篇幅，把"少字要补 3-4 轮"压到 1-2 轮；
 *    同类机制可泛化到任何"首版不到位、靠多轮重试"的步骤。
 * 4) 埋点绝不影响主流程：record 内部全容错，任何异常都静默吞掉。
 */
import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import * as crypto from 'crypto';

/** 一次 LLM 调用的遥测输入 */
export interface StepMetricInput {
  runId?: string;
  projectId?: string | null;
  chapterIndex?: number | null;
  stepKey?: string | null;
  scenario?: string | null;
  modelVersion?: string | null;
  attempt?: number;
  phase?: string | null;
  status: 'success' | 'empty' | 'truncated' | 'network_error' | 'failed';
  failReason?: string | null;
  durationMs: number;
  promptChars?: number;
  outputText?: string;
  outputWords?: number;
  targetWords?: number | null;
  deficitWords?: number | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  internalRetries?: number;
}

export interface StepFlowStat {
  stepKey: string;
  label: string;
  scenario: string;
  calls: number;
  firstPassCalls: number;
  firstPassRate: number;
  retryCalls: number;
  avgAttempts: number;
  maxAttempts: number;
  avgDurationMs: number;
  p90DurationMs: number;
  successCalls: number;
  failedCalls: number;
  failRate: number;
  emptyCalls: number;
  truncatedCalls: number;
  avgOutputWords: number | null;
  avgTargetWords: number | null;
  avgDeficitWords: number | null;
  totalTokens: number;
  bottleneck: boolean;
  bottleneckReasons: string[];
  lastAt: string | null;
}

/** 业务步骤 / 模型场景 → 中文名（作者可读）。未列出的回退为原始 key。 */
const STEP_LABELS: Record<string, string> = {
  body_first: '正文·首版生成',
  body_length_retry: '正文·字数补足',
  body_alignment_repair: '正文·大纲/硬红线精修',
  consistency_repair: '设定一致性修订',
  idea_generate: '题材/灵感生成',
  inspiration: '题材/灵感生成',
  outline: '大纲规划',
  world_building: '世界观生成',
  character_design: '角色设计',
  organization_map: '组织地图',
  foreshadowing: '伏笔设计',
  timeline: '时间线编排',
  writing: '正文写作',
  writing_daily: '正文写作(日常)',
  writing_climax: '正文写作(高潮)',
  chapter_synthesis: '章节综合',
  polish: '润色',
  refinement: '精修',
  character_review: '审查/一致性',
  review: '审查/一致性',
  daily: '常规生成(日常模型)',
  adapt_platform: '平台风格改写',
  enhance_opening: '开篇强化',
  enhance_reversal: '反转强化',
  quality_refine: '质检精修',
};

const BOTTLENECK_MIN_CALLS = 2;

@Injectable()
export class GenerationMetricsService {
  private readonly logger = new Logger(GenerationMetricsService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  beginRun(projectId: string | undefined, scenario: string, prompt: string, systemPrompt?: string, stepKey?: string | null, chapterIndex?: number | null) {
    const db = this.databaseService.getDb();
    const row = projectId ? db.prepare('SELECT * FROM projects WHERE id=?').get(projectId) as any : null;
    if (projectId && !row) throw new Error('生成项目不存在');
    const constitution = row ? readConstitution(row) : null;
    const id = crypto.randomUUID();
    const digest = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
    const stageKey = `${scenario} ${stepKey || ''}`;
    const stage = /world/.test(stageKey) ? 'world' : /character/.test(stageKey) ? 'character'
      : /outline/.test(stageKey) ? 'outline' : /polish|refin|repair|de.?ai/.test(stageKey) ? 'refinement'
      : /writ|body|chapter/.test(stageKey) ? 'chapter' : 'project';
    db.prepare(`INSERT INTO generation_runs (id, project_id, stage, scenario, status, constitution_revision,
      constitution_json, prompt_version, context_version, started_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      id, projectId ?? null, stage, scenario, 'running', constitution?.revision ?? null,
      constitution ? JSON.stringify(constitution) : null, digest(systemPrompt || ''), digest(prompt), new Date().toISOString());
    const context = row ? this.qualityContext(projectId!) : '';
    db.prepare('UPDATE generation_runs SET context_snapshot=?,context_version=?,prompt_version=?,chapter_index=? WHERE id=?').run(context, digest(prompt + context), digest((systemPrompt || '') + JSON.stringify(constitution)), chapterIndex ?? null, id);
    const previousChapters = row ? db.prepare("SELECT id,content FROM chapters WHERE project_id=? AND content IS NOT NULL AND (? IS NULL OR chapter_index < ?) ORDER BY chapter_index DESC LIMIT 12").all(projectId!, chapterIndex ?? null, chapterIndex ?? null) as Array<{ id: string; content: string }> : [];
    const characterNames = row ? (db.prepare('SELECT name FROM characters WHERE project_id=?').all(projectId!) as Array<{ name: string }>).map(c => c.name) : [];
    const lessons = row ? (db.prepare("SELECT lesson FROM generation_lessons WHERE project_id=? AND category='verified_quality_repair' ORDER BY occurrence DESC,updated_at DESC LIMIT 8").all(projectId!) as Array<{ lesson: string }>).map(r => r.lesson) : [];
    return { id, constitution, stage, context, projectId, previousChapters, characterNames, lessons };
  }

  private qualityContext(projectId: string): string {
    const db = this.databaseService.getDb();
    return JSON.stringify({
      world: db.prepare('SELECT * FROM world_settings WHERE project_id=? ORDER BY id').all(projectId),
      characters: db.prepare('SELECT * FROM characters WHERE project_id=? ORDER BY id').all(projectId),
      outlines: db.prepare('SELECT * FROM outlines WHERE project_id=? ORDER BY id').all(projectId),
      confirmedState: db.prepare("SELECT * FROM state_items WHERE project_id=? AND status='confirmed' ORDER BY id").all(projectId),
    });
  }

  runIsCurrent(runId: string, projectId: string): boolean {
    const db = this.databaseService.getDb();
    const run = db.prepare('SELECT constitution_json,context_snapshot FROM generation_runs WHERE id=? AND project_id=?').get(runId, projectId) as any;
    const row = db.prepare('SELECT * FROM projects WHERE id=?').get(projectId) as any;
    return !!run && !!row && run.constitution_json === JSON.stringify(readConstitution(row)) && run.context_snapshot === this.qualityContext(projectId);
  }

  finishRun(id: string, status: 'success' | 'failed' | 'cancelled', started: number, output?: string, error?: string, model?: string) {
    this.databaseService.getDb().prepare(`UPDATE generation_runs SET status=?, finished_at=?, duration_ms=?,
      output_text=?, error=?, model=? WHERE id=? AND status='running'`).run(
      status, new Date().toISOString(), Date.now() - started, output ?? null, error ?? null, model ?? null, id);
  }

  saveRunScore(runId: string, projectId: string, score: StageScore) {
    const db = this.databaseService.getDb();
    if (!this.runIsCurrent(runId, projectId)) {
      score.issues.push(qualityIssue({ projectId, runId, stage: score.stage, ruleId: 'constitution.stale_context',
        severity: 'blocking', message: '生成期间创作宪法或前序资料已变化，必须基于最新上下文重新生成', source: 'version_gate' }));
      score.overallScore = null;
    }
    const gate = qualityGate(score.issues, score.status === 'evaluated');
    const now = new Date().toISOString();
    db.prepare('UPDATE generation_runs SET gate_status=? WHERE id=?').run(gate.status, runId);
    db.prepare(`INSERT INTO writing_quality_reports (id,project_id,source_type,source_id,scope,title,summary,overall_level,overall_score,payload,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, overall_score=excluded.overall_score,
      overall_level=excluded.overall_level, summary=excluded.summary, updated_at=excluded.updated_at`).run(
      runId, projectId, 'generation_run', runId, score.stage, score.stage + '质量评分', gate.status,
      gate.passed ? (score.overallScore !== null && score.overallScore >= 90 ? 'high' : 'medium') : 'low', score.overallScore, JSON.stringify({ stageScore: score, gate }), now, now);
    db.prepare("UPDATE writing_quality_issues SET status='superseded',updated_at=? WHERE report_id=? AND status='open'").run(now, runId);
    db.prepare(`UPDATE writing_quality_reports SET chapter_id=(SELECT c.id FROM chapters c JOIN generation_runs r
      ON c.project_id=r.project_id AND c.chapter_index=r.chapter_index WHERE r.id=? LIMIT 1) WHERE id=?`).run(runId, runId);
    for (const issue of score.issues) db.prepare(`INSERT INTO writing_quality_issues
      (id,report_id,project_id,issue_type,severity,title,summary,evidence,payload,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,payload=excluded.payload,updated_at=excluded.updated_at`).run(
      issue.id, runId, projectId, issue.ruleId, issue.severity, issue.message, issue.message,
      issue.evidence.quote, JSON.stringify({ qualityIssue: issue }), issue.status, now, now);
    db.prepare('UPDATE writing_quality_issues SET chapter_id=(SELECT chapter_id FROM writing_quality_reports WHERE id=?) WHERE report_id=?').run(runId, runId);
    return gate;
  }

  learnAcceptedRepair(projectId: string, repairId: string, before: StageScore, after: StageScore) {
    const db = this.databaseService.getDb();
    const repair = db.prepare("SELECT status FROM generation_repairs WHERE id=? AND project_id=?").get(repairId, projectId) as any;
    if (repair?.status !== 'accepted' || after.status !== 'evaluated') return;
    for (const rule of [...new Set(before.issues.map(issue => issue.ruleId))]) {
      if (after.issues.some(issue => issue.ruleId === rule && issue.status === 'open')) continue;
      const lesson = '已验证策略：遇到 ' + rule + ' 问题，只替换原文中唯一匹配的局部片段；对照创作宪法复检全部维度，无退步且问题消除才接受。';
      const now = new Date().toISOString();
      db.prepare(`INSERT INTO generation_lessons (id,project_id,category,lesson,occurrence,last_chapter_index,created_at,updated_at)
        VALUES (?,?,?,?,1,0,?,?) ON CONFLICT(project_id,lesson) DO UPDATE SET occurrence=occurrence+1,updated_at=excluded.updated_at`).run(
        crypto.randomUUID(), projectId, 'verified_quality_repair', lesson, now, now);
    }
  }

  recordRepair(runId: string, projectId: string, beforeText: string, afterText: string | null,
    before: StageScore, after: StageScore | null, accepted: boolean, reason: string) {
    const id = crypto.randomUUID();
    const db = this.databaseService.getDb();
    db.prepare(`INSERT INTO generation_repairs (id,run_id,project_id,stage,status,strategy,before_text,after_text,
      before_score,after_score,before_report,after_report,reason,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, runId, projectId, before.stage, accepted ? 'accepted' : 'rolled_back', 'unique_local_replacement',
      beforeText, afterText, before.overallScore, after?.overallScore ?? null, JSON.stringify(before), after ? JSON.stringify(after) : null, reason, new Date().toISOString());
    return id;
  }

  getCockpit(projectId: string) {
    const db = this.databaseService.getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id=?').get(projectId) as any;
    const currentConstitution = project ? JSON.stringify(readConstitution(project)) : null;
    const runs = db.prepare(`SELECT r.*, q.payload AS quality_payload, q.overall_score, (SELECT SUM(m.total_tokens) FROM generation_step_metrics m WHERE m.run_id=r.id) AS total_tokens FROM generation_runs r
      LEFT JOIN writing_quality_reports q ON q.id=r.id WHERE r.project_id=? ORDER BY r.started_at DESC LIMIT 100`).all(projectId) as any[];
    const issues = db.prepare("SELECT * FROM writing_quality_issues WHERE project_id=? AND status='open' ORDER BY created_at DESC LIMIT 100").all(projectId);
    const scores: Record<string, any> = {};
    for (const run of runs) {
      const payload = run.quality_payload ? JSON.parse(run.quality_payload) : {};
      run.score = payload.stageScore ?? null;
      run.currentConstitution = run.constitution_json === currentConstitution;
      if (!(run.stage in scores)) scores[run.stage] = run.currentConstitution ? run.score : null;
      delete run.quality_payload; delete run.output_text; delete run.constitution_json; delete run.context_snapshot;
    }
    scores.project = aggregateProjectScore(scores);
    const repairs = db.prepare('SELECT id,stage,status,reason,before_score,after_score,before_text,after_text FROM generation_repairs WHERE project_id=? ORDER BY created_at DESC LIMIT 100').all(projectId);
    return { runs, issues, scores, repairs, scope: '最近100次生成与100条未解决问题',
      bottlenecks: runs.filter(r => r.status === 'running' || r.status === 'failed' || r.gate_status === 'blocked'),
      trend: runs.filter(r => r.score).map(r => ({ at: r.started_at, stage: r.stage, score: r.score.overallScore, coverage: r.score.coverage })).reverse() };
  }

  getRuns(projectId?: string, limit = 50) {
    const db = this.databaseService.getDb();
    const bounded = Math.max(1, Math.min(200, Number.isFinite(limit) ? Math.floor(limit) : 50));
    return projectId
      ? db.prepare('SELECT * FROM generation_runs WHERE project_id=? ORDER BY started_at DESC LIMIT ?').all(projectId, bounded)
      : db.prepare('SELECT * FROM generation_runs ORDER BY started_at DESC LIMIT ?').all(bounded);
  }

  /** 与正文 generatedNarrativeWordCount 同口径：汉字数 + 英文词数。 */
  static countWords(text: string | null | undefined): number {
    if (!text) return 0;
    const chinese = (text.match(/[一-鿿㐀-䶿]/g) || []).length;
    const english = text
      .replace(/[一-鿿㐀-䶿]/g, ' ')
      .split(/\s+/)
      .filter((token) => /[a-zA-Z]/.test(token)).length;
    return chinese + english;
  }

  labelOf(stepKey: string, scenario?: string | null): string {
    return STEP_LABELS[stepKey] || STEP_LABELS[scenario || ''] || stepKey || scenario || '未知步骤';
  }

  /** 记录一次步骤调用（全容错，绝不抛出影响生成主流程）。 */
  record(input: StepMetricInput): void {
    try {
      const scenario = input.scenario || 'daily';
      const stepKey = input.stepKey || scenario;
      const outputWords = input.outputWords ?? GenerationMetricsService.countWords(input.outputText);
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      this.databaseService.getDb()
        .prepare(
          `INSERT INTO generation_step_metrics
            (id, project_id, chapter_index, step_key, scenario, model_version, attempt, phase,
             status, fail_reason, duration_ms, prompt_chars, output_chars, output_words,
             target_words, deficit_words, prompt_tokens, completion_tokens, total_tokens,
             internal_retries, created_at, run_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          id,
          input.projectId ?? null,
          input.chapterIndex ?? null,
          stepKey,
          scenario,
          input.modelVersion ?? null,
          Math.max(0, Math.floor(input.attempt ?? 0)),
          input.phase ?? null,
          input.status,
          input.failReason ? String(input.failReason).slice(0, 300) : null,
          Math.max(0, Math.round(input.durationMs || 0)),
          input.promptChars ?? (input as any)._promptChars ?? 0,
          input.outputText ? input.outputText.length : 0,
          outputWords,
          input.targetWords ?? null,
          input.deficitWords ?? null,
          input.promptTokens ?? null,
          input.completionTokens ?? null,
          input.totalTokens ?? null,
          Math.max(0, Math.floor(input.internalRetries ?? 0)),
          now, input.runId ?? null,
        );
    } catch (err) {
      this.logger.debug?.(`record 埋点失败（不影响生成）: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private since(days: number): string {
    return new Date(Date.now() - days * 86400_000).toISOString();
  }

  /** 拉取时间窗内明细（JS 聚合，跨 SQLite 版本可靠）。 */
  private fetchRows(projectId?: string, days = 30): any[] {
    const since = this.since(days);
    const db = this.databaseService.getDb();
    const rows = projectId
      ? db
          .prepare(
            `SELECT step_key, scenario, attempt, status, duration_ms, output_words, target_words,
                    deficit_words, total_tokens, fail_reason, internal_retries, created_at
             FROM generation_step_metrics WHERE project_id=? AND created_at>=?`,
          )
          .all(projectId, since)
      : db
          .prepare(
            `SELECT step_key, scenario, attempt, status, duration_ms, output_words, target_words,
                    deficit_words, total_tokens, fail_reason, internal_retries, created_at
             FROM generation_step_metrics WHERE created_at>=?`,
          )
          .all(since);
    return rows as any[];
  }

  private static percentile(sortedAsc: number[], p: number): number {
    if (!sortedAsc.length) return 0;
    const idx = Math.min(sortedAsc.length - 1, Math.ceil(p * sortedAsc.length) - 1);
    return sortedAsc[idx];
  }

  private aggregate(rows: any[]): StepFlowStat[] {
    const groups = new Map<string, any[]>();
    for (const r of rows) {
      const key = r.step_key || r.scenario || 'unknown';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    const stats: StepFlowStat[] = [];
    for (const [key, list] of groups) {
      const calls = list.length;
      const success = list.filter((r) => r.status === 'success');
      const firstPass = list.filter((r) => r.attempt === 0 && r.status === 'success');
      const retry = list.filter((r) => r.attempt > 0);
      const failed = list.filter((r) => r.status !== 'success');
      const durations = list.map((r) => Number(r.duration_ms) || 0).sort((a, b) => a - b);
      const attempts = list.map((r) => Number(r.attempt) || 0);
      const wordRows = list.filter((r) => Number(r.target_words) > 0);
      const avg = (arr: number[]) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
      const avgDuration = avg(durations) ?? 0;
      const p90 = GenerationMetricsService.percentile(durations, 0.9);
      const firstPassRate = calls ? firstPass.length / calls : 0;
      const failRate = calls ? failed.length / calls : 0;
      const avgAttempts = calls ? attempts.reduce((a, b) => a + b, 0) / calls + 1 : 1;
      const reasons: string[] = [];
      if (calls >= BOTTLENECK_MIN_CALLS && firstPassRate < 0.7) reasons.push(`首版一次到位率仅 ${(firstPassRate * 100).toFixed(0)}%`);
      if (avgAttempts > 1.3) reasons.push(`平均要 ${avgAttempts.toFixed(1)} 轮`);
      if (calls >= BOTTLENECK_MIN_CALLS && failRate > 0.2) reasons.push(`失败率 ${(failRate * 100).toFixed(0)}%`);
      const deficitRows = wordRows.filter((r) => r.deficit_words != null && Number(r.deficit_words) > 0);
      stats.push({
        stepKey: key,
        label: this.labelOf(key, list[0]?.scenario),
        scenario: list[0]?.scenario || key,
        calls,
        firstPassCalls: firstPass.length,
        firstPassRate: Number(firstPassRate.toFixed(3)),
        retryCalls: retry.length,
        avgAttempts: Number(avgAttempts.toFixed(2)),
        maxAttempts: attempts.length ? Math.max(...attempts) : 0,
        avgDurationMs: avgDuration,
        p90DurationMs: p90,
        successCalls: success.length,
        failedCalls: failed.length,
        failRate: Number(failRate.toFixed(3)),
        emptyCalls: list.filter((r) => r.status === 'empty').length,
        truncatedCalls: list.filter((r) => r.status === 'truncated').length,
        avgOutputWords: avg(wordRows.map((r) => Number(r.output_words) || 0)),
        avgTargetWords: avg(wordRows.map((r) => Number(r.target_words) || 0)),
        avgDeficitWords: avg(deficitRows.map((r) => Number(r.deficit_words) || 0)),
        totalTokens: list.reduce((a, r) => a + (Number(r.total_tokens) || 0), 0),
        bottleneck: reasons.length > 0,
        bottleneckReasons: reasons,
        lastAt: list.map((r) => r.created_at).sort().pop() || null,
      });
    }
    // 瓶颈优先、再按调用次数降序
    return stats.sort((a, b) => {
      if (a.bottleneck !== b.bottleneck) return a.bottleneck ? -1 : 1;
      return b.calls - a.calls;
    });
  }

  /** 项目（或全局）步骤流程统计。 */
  getFlowSummary(projectId?: string, days = 30) {
    try {
      const rows = this.fetchRows(projectId || undefined, days);
      const steps = this.aggregate(rows);
      const totalCalls = rows.length;
      const overallFirstPass = totalCalls
        ? rows.filter((r) => r.attempt === 0 && r.status === 'success').length / totalCalls
        : 1;
      const bottlenecks = steps.filter((s) => s.bottleneck);
      return {
        scope: projectId ? 'project' : 'global',
        days,
        totalCalls,
        overallFirstPassRate: Number(overallFirstPass.toFixed(3)),
        bottleneckCount: bottlenecks.length,
        steps,
      };
    } catch (err) {
      return { scope: projectId ? 'project' : 'global', days, totalCalls: 0, overallFirstPassRate: 1, bottleneckCount: 0, steps: [], error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** 全局概览：整体一次到位率 + 最卡步骤 Top N（首页用）。 */
  getOverview(days = 30, topN = 5) {
    const summary = this.getFlowSummary(undefined, days);
    const top = summary.steps.slice(0, topN);
    const totalDurationMs = summary.steps.reduce((a, s) => a + s.avgDurationMs * s.calls, 0);
    return {
      days,
      totalCalls: summary.totalCalls,
      overallFirstPassRate: summary.overallFirstPassRate,
      bottleneckCount: summary.bottleneckCount,
      estimatedTotalDurationMs: totalDurationMs,
      topBottlenecks: top.filter((s) => s.bottleneck),
      topSteps: top,
    };
  }

  /** 最近的卡点明细（重试轮 / 失败），让作者看到"具体卡在哪一次"。 */
  getRecentBottlenecks(projectId?: string, limit = 20, days = 30) {
    try {
      const since = this.since(days);
      const db = this.databaseService.getDb();
      const rows = (projectId
        ? db
            .prepare(
              `SELECT * FROM generation_step_metrics
               WHERE project_id=? AND created_at>=? AND (attempt>0 OR status!='success')
               ORDER BY created_at DESC LIMIT ?`,
            )
            .all(projectId, since, limit)
        : db
            .prepare(
              `SELECT * FROM generation_step_metrics
               WHERE created_at>=? AND (attempt>0 OR status!='success')
               ORDER BY created_at DESC LIMIT ?`,
            )
            .all(since, limit)) as any[];
      return rows.map((r) => ({
        ...r,
        label: this.labelOf(r.step_key, r.scenario),
      }));
    } catch {
      return [];
    }
  }

  /**
   * 字数产出比自校准：历史"正文首版实际字数 / 目标字数"的中位数。
   * 样本不足 minSamples 时返回 null（冷启动不盲目调整）。
   * ratio<1 表示模型系统性写不够，首版应按 target/ratio 铺够；ratio>=1 表示首版基本到位。
   */
  getLengthCalibration(projectId?: string, minSamples = 3): { samples: number; ratio: number; medianTarget: number } | null {
    try {
      const since = this.since(14);
      const db = this.databaseService.getDb();
      const rows = (projectId
        ? db
            .prepare(
              `SELECT output_words, target_words FROM generation_step_metrics
               WHERE project_id=? AND step_key='body_first' AND status='success'
                 AND target_words>0 AND output_words>0 AND created_at>=?
               ORDER BY created_at DESC LIMIT 50`,
            )
            .all(projectId, since)
        : db
            .prepare(
              `SELECT output_words, target_words FROM generation_step_metrics
               WHERE step_key='body_first' AND status='success'
                 AND target_words>0 AND output_words>0 AND created_at>=?
               ORDER BY created_at DESC LIMIT 50`,
            )
            .all(since)) as Array<{ output_words: number; target_words: number }>;
      if (rows.length < minSamples) return null;
      const ratios = rows.map((r) => r.output_words / r.target_words).sort((a, b) => a - b);
      const median = ratios[Math.floor(ratios.length / 2)];
      const targets = rows.map((r) => r.target_words).sort((a, b) => a - b);
      const medianTarget = targets[Math.floor(targets.length / 2)];
      if (!Number.isFinite(median) || median <= 0) return null;
      return { samples: rows.length, ratio: Number(median.toFixed(3)), medianTarget };
    } catch {
      return null;
    }
  }
}
