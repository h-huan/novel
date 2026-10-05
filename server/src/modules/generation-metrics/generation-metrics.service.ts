import { defaultRepairStrategy, repairStrategies } from '../writing-quality/repair-strategy-registry';
import { aggregateArtifactScores, aggregateProjectScore, type StageScore } from '../writing-quality/stage-score';
import { qualityGate, qualityIssue } from '../writing-quality/quality-issue';
import { readConstitution } from '../project/creative-constitution';
import { loadCharacterNames } from '../character/character-names';
import { qualityStage } from '../../routing/scenario-taxonomy';
import { expectsProjectId } from '../../common/creation-context';
import { CHAPTER_RESPONSIBILITY_CRITERION_ID_PATTERN } from '../../../shared/src';
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
import { Injectable, Logger, BadRequestException, type OnModuleInit } from '@nestjs/common';
import { standardDirectiveCache } from '../module-standards/standard-directive.cache';
import { DatabaseService } from '../../database/database.service';
import * as crypto from 'crypto';
import { compileContext } from './context-compiler';
import { isRepairStrategyEligible, repairStrategyUtility } from './repair-learning';

export const CHAPTER_RESPONSIBILITY_REPAIR_STRATEGIES = [
  'constraint_matrix',
  'dependency_cascade',
  'full_replan',
] as const;
export type ChapterResponsibilityRepairStrategy = typeof CHAPTER_RESPONSIBILITY_REPAIR_STRATEGIES[number];

export function chapterResponsibilityIssueSignature(issues: string[]): string {
  const categories = new Set<string>();
  // 判据编号优先：审查条目按 shared 的 CR-1…CR-7 判据产出，用判据编号分类才与平台/题材无关。
  // 旧关键词表里夹带着某一部旧书的题材词（门禁/影子/替身/亲属关系/失踪登记），
  // 换一本书就把冲突归错类，策略学习信号随即失效——这正是「换题材后又开始反复修复」的一部分原因。
  const criterionBuckets: Record<string, string> = {
    '1': 'capability_scope',
    '2': 'trigger_timing',
    '3': 'chapter_boundary',
    '4': 'repetition',
    '5': 'motivation_transition',
    '6': 'authority_procedure',
    '7': 'authorization_timing',
  };
  const criterionPattern = new RegExp(CHAPTER_RESPONSIBILITY_CRITERION_ID_PATTERN.source, "g");
  for (const raw of issues) {
    const issue = String(raw || "");
    for (const match of issue.matchAll(criterionPattern)) {
      const bucket = criterionBuckets[match[1]];
      if (bucket) categories.add(bucket);
    }
    if (/触发条件|何时触发|超过|尚未|提前|时点|第\s*\d+\s*日/.test(issue)) categories.add("trigger_timing");
    if (/前提|未安排|不能执行|须经|条件未满足/.test(issue)) categories.add("missing_prerequisite");
    if (/份|人数|人证|分配|名额|不在.{0,8}人/.test(issue)) categories.add("allocation");
    if (/重复|重演|再次执行/.test(issue)) categories.add("repetition");
    if (/跨章|后续章|下一章|提前完成|提前兑现/.test(issue)) categories.add("chapter_boundary");
    if (/预知|信息来源|后来才|尚未知/.test(issue)) categories.add("information_timing");
    if (/权限移交|生效文书|生效条件|权利生效|法定继承|程序未走完/.test(issue)) categories.add("authority_procedure");
    if (/立场|倒向|相助|关键材料|转变触发|动机/.test(issue)) categories.add("motivation_transition");
    if (/旧授权|高权限|远程授权|自动响应|持续机制/.test(issue)) categories.add("authorization_timing");
    if (/超自然|改写|现实记录|现实设备|作用范围/.test(issue)) categories.add("reality_boundary");
    if (/痕迹|模仿|诱导|交涉|未赋予|未授权|能力范围/.test(issue)) categories.add("capability_scope");
  }
  if (categories.size === 0) categories.add("semantic_consistency");
  return `chapter_responsibility.${[...categories].sort().join("+")}`;
}

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
  'long-novel-init-foundation': '长篇·世界观地基',
  'long-novel-flexible-outline': '长篇·弹性大纲',
  'inspiration-seed-enrich': '灵感种子补全',
};

const BOTTLENECK_MIN_CALLS = 2;

export function generationRulesetSnapshotIsCurrent(
  rawSnapshot: unknown,
  currentRulesetVersion: number,
  currentRegistryDigest: string,
): boolean {
  if (typeof rawSnapshot !== 'string' || !rawSnapshot.trim()) return false;
  try {
    const snapshot = JSON.parse(rawSnapshot) as { rulesetVersion?: number; registryDigest?: string };
    return snapshot.rulesetVersion === currentRulesetVersion
      && snapshot.registryDigest === currentRegistryDigest;
  } catch {
    return false;
  }
}

@Injectable()
export class GenerationMetricsService implements OnModuleInit {
  private readonly logger = new Logger(GenerationMetricsService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  onModuleInit(): void {
    const recovered = this.recoverInterruptedRuns();
    if (recovered > 0) {
      this.logger.warn(`检测到 ${recovered} 条服务重启前未结束的生成记录，已标记为 cancelled`);
    }
  }

  /**
   * A process cannot have a genuinely active persisted run before its modules
   * finish booting. Keep the history, but close leftovers from a prior crash or
   * forced restart so dashboards never show them as permanently running.
   */
  recoverInterruptedRuns(): number {
    const now = new Date().toISOString();
    const result = this.databaseService.getDb().prepare(`UPDATE generation_runs
      SET status='cancelled', finished_at=?,
          error=COALESCE(NULLIF(error,''), '服务重启前生成未正常结束，已自动标记为中断')
      WHERE status='running'`).run(now);
    return Number(result.changes || 0);
  }

  beginRun(projectId: string | undefined, scenario: string, prompt: string, systemPrompt?: string, stepKey?: string | null, chapterIndex?: number | null, injectStandard = true) {
    const db = this.databaseService.getDb();
    // 项目内场景缺 projectId 一律阻断：以前这里静默取 constitution=null、runId 不注入 systemPrompt、
    // 记录退化成平台级，等于「没有执行标准的链路」照常跑完却看着正常（review/summary 判定失标的真因）。
    // 不降级为 warn、不填默认值：宁可让这一次调用明确失败，也不产生归属不明的生成记录。
    if (!projectId && expectsProjectId(scenario, stepKey)) {
      throw new Error(`项目内场景 ${scenario || stepKey || 'daily'} 缺少 projectId：无法归属项目、无法注入创作宪法与执行标准，已阻断（不降级为平台级记录）`);
    }
    const row = projectId ? db.prepare('SELECT * FROM projects WHERE id=?').get(projectId) as any : null;
    if (projectId && !row) throw new Error('生成项目不存在');
    const constitution = row ? readConstitution(row) : null;
    const id = crypto.randomUUID();
    const digest = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
    const stage = qualityStage(scenario, stepKey);
    db.prepare(`INSERT INTO generation_runs (id, project_id, stage, scenario, status, constitution_revision,
      constitution_json, prompt_version, context_version, started_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      id, projectId ?? null, stage, scenario, 'running', constitution?.revision ?? null,
      constitution ? JSON.stringify(constitution) : null, digest(systemPrompt || ''), digest(prompt), new Date().toISOString());
    const compiled = row ? compileContext(db, { projectId: projectId!, stage, chapterIndex }) : null;
    const context = compiled?.snapshot || '';
    const standards = standardDirectiveCache.snapshot(scenario, injectStandard, stepKey);
    db.prepare('UPDATE generation_runs SET standards_snapshot=? WHERE id=?').run(JSON.stringify(standards), id);
    db.prepare('UPDATE generation_runs SET context_snapshot=?,context_version=?,prompt_version=?,chapter_index=? WHERE id=?')
      .run(context, compiled?.version || digest(''), digest((systemPrompt || '') + JSON.stringify(constitution) + standards.digest), chapterIndex ?? null, id);
    const previousChapters = row ? db.prepare("SELECT id,content FROM chapters WHERE project_id=? AND content IS NOT NULL AND (? IS NULL OR chapter_index < ?) ORDER BY chapter_index DESC LIMIT 12").all(projectId!, chapterIndex ?? null, chapterIndex ?? null) as Array<{ id: string; content: string }> : [];
    // 【防复发】此处曾是第二份内联的取人物名 SQL（裸 SELECT name，不排序、不去重），
    // 与 chain.controller.getProjectCharacterNames 的排序去重口径不一致：同一个项目在两处拿到
    // 顺序/内容都不同的人名表，身份守护与硬红线规则 32 的判定因此漂移。现统一取唯一实现。
    const characterNames = row ? loadCharacterNames(db, projectId!) : [];
    const lessons = row ? (db.prepare("SELECT lesson FROM generation_lessons WHERE project_id=? AND category='verified_quality_repair' ORDER BY occurrence DESC,updated_at DESC LIMIT 8").all(projectId!) as Array<{ lesson: string }>).map(r => r.lesson) : [];
    return {
      id, constitution, stage, context, projectId, previousChapters, characterNames, lessons,
      rulesetVersion: standards.rulesetVersion,
      rulesetDigest: standards.registryDigest,
      ruleIds: standards.ruleIds,
    };
  }

  private qualityContext(projectId: string, stage: string = 'project', chapterIndex?: number | null): string {
    return compileContext(this.databaseService.getDb(), {
      projectId, stage: stage as any, chapterIndex,
    }).snapshot;
  }

  runIsCurrent(runId: string, projectId: string): boolean {
    const db = this.databaseService.getDb();
    const run = db.prepare('SELECT constitution_json,context_snapshot,standards_snapshot,stage,chapter_index FROM generation_runs WHERE id=? AND project_id=?').get(runId, projectId) as any;
    const row = db.prepare('SELECT * FROM projects WHERE id=?').get(projectId) as any;
    return !!run && !!row
      && run.constitution_json === JSON.stringify(readConstitution(row))
      && run.context_snapshot === this.qualityContext(projectId, run.stage, run.chapter_index)
      && generationRulesetSnapshotIsCurrent(
        run.standards_snapshot,
        standardDirectiveCache.getRulesetVersion(),
        standardDirectiveCache.getRulesetDigest(),
      );
  }

  finishRun(id: string, status: 'success' | 'failed' | 'cancelled', started: number, output?: string, error?: string, model?: string) {
    this.databaseService.getDb().prepare(`UPDATE generation_runs SET status=?, finished_at=?, duration_ms=?,
      output_text=?, error=?, model=? WHERE id=? AND status='running'`).run(
      status, new Date().toISOString(), Date.now() - started, output ?? null, error ?? null, model ?? null, id);
  }

  setRunModel(id: string, model: string) {
    this.databaseService.getDb().prepare('UPDATE generation_runs SET model=? WHERE id=?').run(model,id);
  }

  saveRunScore(runId: string, projectId: string, score: StageScore) {
    const db = this.databaseService.getDb();
    const run = db.prepare('SELECT stage,chapter_index FROM generation_runs WHERE id=? AND project_id=?').get(runId, projectId) as any;
    if (!run) throw new Error('生成记录不存在');
    const currentRun = this.runIsCurrent(runId, projectId);
    if (!currentRun) {
      score.issues.push(qualityIssue({ projectId, runId, stage: score.stage, ruleId: 'constitution.stale_context',
        severity: 'blocking', message: '生成期间创作宪法或前序资料已变化，必须基于最新上下文重新生成', source: 'version_gate' }));
      score.overallScore = null;
    }
    const gate = qualityGate(score.issues, score.status === 'evaluated');
    const now = new Date().toISOString();
    // A physical model call is a generation_run. A quality report belongs to the
    // current artifact scope and is updated in place across retries/regenerations.
    const artifactKey = `${projectId}:${run.stage}:${run.chapter_index ?? 'project'}`;
    const reportId = `artifact_${crypto.createHash('sha256').update(artifactKey).digest('hex')}`;
    db.prepare('UPDATE generation_runs SET gate_status=?,quality_payload=? WHERE id=?')
      .run(gate.status, JSON.stringify({ stageScore: score, gate }), runId);
    if (!currentRun) return gate;
    db.prepare(`INSERT INTO writing_quality_reports (id,project_id,source_type,source_id,scope,title,summary,overall_level,overall_score,payload,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET source_id=excluded.source_id,payload=excluded.payload,
      overall_score=excluded.overall_score,overall_level=excluded.overall_level,summary=excluded.summary,updated_at=excluded.updated_at`).run(
      reportId, projectId, 'artifact_quality', runId, score.stage, score.stage + '质量评分', gate.status,
      gate.passed ? (score.overallScore !== null && score.overallScore >= 90 ? 'high' : 'medium') : 'low', score.overallScore, JSON.stringify({ stageScore: score, gate }), now, now);
    db.prepare("UPDATE writing_quality_issues SET status='superseded',updated_at=? WHERE report_id=? AND status='open'").run(now, reportId);
    db.prepare(`UPDATE writing_quality_reports SET chapter_id=(SELECT c.id FROM chapters c JOIN generation_runs r
      ON c.project_id=r.project_id AND c.chapter_index=r.chapter_index WHERE r.id=? LIMIT 1) WHERE id=?`).run(runId, reportId);
    for (const issue of score.issues) {
      const issueId = crypto.createHash('sha256').update(JSON.stringify([reportId, issue.ruleId, issue.evidence.quote, issue.message])).digest('hex');
      db.prepare(`INSERT INTO writing_quality_issues
      (id,report_id,project_id,issue_type,severity,title,summary,evidence,payload,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,payload=excluded.payload,updated_at=excluded.updated_at`).run(
      issueId, reportId, projectId, issue.ruleId, issue.severity, issue.message, issue.message,
      issue.evidence.quote, JSON.stringify({ qualityIssue: issue }), issue.status, now, now);
    }
    db.prepare('UPDATE writing_quality_issues SET chapter_id=(SELECT chapter_id FROM writing_quality_reports WHERE id=?) WHERE report_id=?').run(reportId, reportId);
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

  selectRepairStrategy(projectId: string, issues: StageScore['issues'], runId?: string): string {
    const blocking = issues.filter(i => i.severity === 'blocking' && i.status === 'open');
    const severe = issues.filter(i => ['blocking', 'high'].includes(i.severity) && i.status === 'open');
    // A blocking issue is often only the visible symptom of the same local
    // defect (for example, a logic lapse plus a missing scene and a repeated
    // beat). Keep the blocking rule first for historical lookup, but let the
    // fallback executor see the whole open issue cluster so it can choose the
    // structural repair that is capable of fixing every occurrence together.
    const structuralCompanions = issues.filter(i => i.status === 'open'
      && (i.ruleId.includes('structure') || i.ruleId.includes('pacing')
        || i.ruleId.includes('timeline.repetition') || i.ruleId.startsWith('ai_trace.')));
    const focus = blocking.length
      ? [...blocking, ...structuralCompanions.filter(i => !blocking.includes(i))]
      : severe.length ? severe : issues.filter(i => i.status === 'open');
    const rules = [...new Set(focus.map(i => i.ruleId))];
    const fallback = defaultRepairStrategy(rules);
    if (!rules.length || !runId) return fallback;
    const db = this.databaseService.getDb();
    const run = db.prepare("SELECT prompt_version,COALESCE(model,(SELECT model_version FROM generation_step_metrics WHERE run_id=r.id AND model_version IS NOT NULL ORDER BY created_at DESC LIMIT 1)) model FROM generation_runs r WHERE id=? AND project_id=?").get(runId,projectId) as any;
    if (!run?.model || !run.prompt_version) return fallback;
    const c = readConstitution(db.prepare('SELECT * FROM projects WHERE id=?').get(projectId) as any);
    const rows = db.prepare("SELECT strategy_id,SUM(attempts) attempts,SUM(accepted) accepted,SUM(rollbacks) rollbacks,SUM(introduced_issue_count) damage,SUM(tokens_sum) tokens,SUM(latency_ms_sum) latencyMs FROM repair_strategy_stats WHERE rule_id=? AND platform=? AND genre=? AND story_type=? AND model=? AND prompt_version=? GROUP BY strategy_id HAVING SUM(attempts)>=5")
      .all(rules[0],c.targetPlatform,c.webNovelGenre.join('|') || c.category || 'generic',c.projectType,run.model,run.prompt_version) as any[];
    // 只保留"已被这条轴验证过"的策略：样本足够、接受率达标、且无等量级回滚/损伤。
    // 实测 unique_local_replacement / platform_metric_patch 在多个规则轴上 0% 接受率，
    // 却因为候选池里只剩它们而持续被选中，累计白烧数千秒与数百万 token。
    // 全部候选都不合格时返回确定性默认策略，而不是继续挑一个已知无效的策略。
    const eligible = rows.filter(r => r.strategy_id in repairStrategies && isRepairStrategyEligible(r));
    eligible.sort((a,b) => repairStrategyUtility(b) - repairStrategyUtility(a) || a.strategy_id.localeCompare(b.strategy_id));
    return eligible[0]?.strategy_id || fallback;
  }

  selectChapterResponsibilityRepairStrategies(
    projectId: string,
    issues: string[],
  ): ChapterResponsibilityRepairStrategy[] {
    const fallback = [...CHAPTER_RESPONSIBILITY_REPAIR_STRATEGIES];
    try {
      const db = this.databaseService.getDb();
      const project = db.prepare('SELECT * FROM projects WHERE id=?').get(projectId) as any;
      const constitution = readConstitution(project || {});
      const genre = constitution.webNovelGenre.join('|') || constitution.category || 'generic';
      const ruleId = chapterResponsibilityIssueSignature(issues);
      const rows = db.prepare(`SELECT strategy_id,SUM(attempts) attempts,SUM(accepted) accepted,SUM(rollbacks) rollbacks,
          SUM(improvement_sum) improvement_sum,SUM(introduced_issue_count) damage,
          SUM(tokens_sum) tokens,SUM(latency_ms_sum) latencyMs
        FROM repair_strategy_stats
        WHERE rule_id=? AND platform=? AND genre=? AND story_type=? AND model='adaptive' AND prompt_version='chapter-responsibility-v2'
        GROUP BY strategy_id`).all(
        ruleId, constitution.targetPlatform, genre, constitution.projectType,
      ) as Array<{ strategy_id: string; attempts: number; accepted: number; rollbacks: number; improvement_sum: number; damage: number; tokens: number; latencyMs: number }>;
      const known = new Set<string>(CHAPTER_RESPONSIBILITY_REPAIR_STRATEGIES);
      const learned = rows
        .filter(row => known.has(row.strategy_id) && Number(row.attempts) > 0)
        .sort((a, b) => {
          const scoreA = repairStrategyUtility(a);
          const scoreB = repairStrategyUtility(b);
          return scoreB - scoreA
            || Number(b.accepted) - Number(a.accepted)
            || Number(a.attempts) - Number(b.attempts)
            || fallback.indexOf(a.strategy_id as ChapterResponsibilityRepairStrategy)
              - fallback.indexOf(b.strategy_id as ChapterResponsibilityRepairStrategy);
        })
        .map(row => row.strategy_id as ChapterResponsibilityRepairStrategy);
      return [...learned, ...fallback.filter(strategy => !learned.includes(strategy))];
    } catch {
      return fallback;
    }
  }

  recordChapterResponsibilityRepairAttempt(
    projectId: string,
    issues: string[],
    strategyId: ChapterResponsibilityRepairStrategy,
    accepted: boolean,
    remainingIssues: string[] = [],
  ): void {
    try {
      const db = this.databaseService.getDb();
      const project = db.prepare('SELECT * FROM projects WHERE id=?').get(projectId) as any;
      const constitution = readConstitution(project || {});
      const genre = constitution.webNovelGenre.join('|') || constitution.category || 'generic';
      const ruleId = chapterResponsibilityIssueSignature(issues);
      const dimensions = [
        ruleId, constitution.targetPlatform, genre, constitution.projectType,
        'adaptive', 'chapter-responsibility-v2', strategyId,
      ];
      const statId = crypto.createHash('sha256').update(JSON.stringify(dimensions)).digest('hex');
      const now = new Date().toISOString();
      const resolvedRatio = issues.length > 0
        ? Math.max(0, issues.length - remainingIssues.length) / issues.length
        : 0;
      const noProgress = !accepted && remainingIssues.length >= issues.length;
      const introduced = Math.max(0, remainingIssues.length - issues.length);
      db.prepare(`INSERT INTO repair_strategy_stats (id,rule_id,platform,genre,story_type,model,prompt_version,strategy_id,
        attempts,accepted,rollbacks,before_score_sum,after_score_sum,improvement_sum,introduced_issue_count,tokens_sum,latency_ms_sum,updated_at)
        VALUES (?,?,?,?,?,?,?,?,1,?,?,0,0,?,?,0,0,?)
        ON CONFLICT(id) DO UPDATE SET attempts=attempts+1,accepted=accepted+excluded.accepted,
          rollbacks=rollbacks+excluded.rollbacks,improvement_sum=improvement_sum+excluded.improvement_sum,
          introduced_issue_count=introduced_issue_count+excluded.introduced_issue_count,updated_at=excluded.updated_at`).run(
        statId, ...dimensions, accepted ? 1 : 0, noProgress ? 1 : 0, resolvedRatio, introduced, now,
      );
    } catch (error) {
      // Telemetry and learning must never interrupt project creation.
      this.logger.debug(`章节分工策略学习记录失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  recordRepair(runId: string, projectId: string, beforeText: string, afterText: string | null,
    before: StageScore, after: StageScore | null, accepted: boolean, reason: string,
    strategyId = 'unique_local_replacement', latencyMs = 0) {
    const id = crypto.randomUUID();
    const db = this.databaseService.getDb();
    db.prepare(`INSERT INTO generation_repairs (id,run_id,project_id,stage,status,strategy,before_text,after_text,
      before_score,after_score,before_report,after_report,reason,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, runId, projectId, before.stage, accepted ? 'accepted' : 'rolled_back', strategyId,
      beforeText, afterText, before.overallScore, after?.overallScore ?? null, JSON.stringify(before), after ? JSON.stringify(after) : null, reason, new Date().toISOString());
    const run = db.prepare(`SELECT r.prompt_version,COALESCE(r.model,
      (SELECT model_version FROM generation_step_metrics m WHERE m.run_id=r.id AND m.model_version IS NOT NULL ORDER BY m.created_at DESC LIMIT 1),'unknown') model,
      COALESCE((SELECT SUM(total_tokens) FROM generation_step_metrics m WHERE m.run_id=r.id),0) tokens
      FROM generation_runs r WHERE r.id=?`).get(runId) as any;
    const project = db.prepare('SELECT * FROM projects WHERE id=?').get(projectId) as any;
    const constitution = readConstitution(project || {});
    const genre = constitution.webNovelGenre.join('|') || constitution.category || 'generic';
    const introduced = after ? after.issues.some(issue => !before.issues.some(old => old.ruleId === issue.ruleId)) : false;
    const improvement = before.overallScore !== null && after?.overallScore != null ? after.overallScore - before.overallScore : 0;
    const now = new Date().toISOString();
    for (const ruleId of [...new Set(before.issues.map(issue => issue.ruleId))]) {
      const statId = crypto.createHash('sha256').update(JSON.stringify([
        ruleId, constitution.targetPlatform, genre, constitution.projectType, run?.model || 'unknown', run?.prompt_version || 'unknown', strategyId,
      ])).digest('hex');
      db.prepare(`INSERT INTO repair_strategy_stats (id,rule_id,platform,genre,story_type,model,prompt_version,strategy_id,
        attempts,accepted,rollbacks,before_score_sum,after_score_sum,improvement_sum,introduced_issue_count,tokens_sum,latency_ms_sum,updated_at)
        VALUES (?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET attempts=attempts+1,
        accepted=accepted+excluded.accepted,rollbacks=rollbacks+excluded.rollbacks,before_score_sum=before_score_sum+excluded.before_score_sum,
        after_score_sum=after_score_sum+excluded.after_score_sum,improvement_sum=improvement_sum+excluded.improvement_sum,
        introduced_issue_count=introduced_issue_count+excluded.introduced_issue_count,tokens_sum=tokens_sum+excluded.tokens_sum,
        latency_ms_sum=latency_ms_sum+excluded.latency_ms_sum,updated_at=excluded.updated_at`).run(
        statId, ruleId, constitution.targetPlatform, genre, constitution.projectType, run?.model || 'unknown', run?.prompt_version || 'unknown', strategyId,
        accepted ? 1 : 0, accepted ? 0 : 1, before.overallScore ?? 0, after?.overallScore ?? 0, improvement,
        introduced ? 1 : 0, Number(run?.tokens) || 0, Math.max(0, latencyMs), now,
      );
    }
    return id;
  }

  getCockpit(projectId: string) {
    const db = this.databaseService.getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id=?').get(projectId) as any;
    const currentConstitution = project ? JSON.stringify(readConstitution(project)) : null;
    const currentContexts = new Map<string, string>();
    const currentContext = (stage: string, chapterIndex?: number | null) => {
      const key = `${stage}:${chapterIndex ?? ''}`;
      if (!currentContexts.has(key)) currentContexts.set(key, this.qualityContext(projectId, stage, chapterIndex));
      return currentContexts.get(key)!;
    };
    const runs = db.prepare(`SELECT r.*,(SELECT SUM(m.total_tokens) FROM generation_step_metrics m WHERE m.run_id=r.id) AS total_tokens
      FROM generation_runs r WHERE r.project_id=? ORDER BY r.started_at DESC LIMIT 100`).all(projectId) as any[];
    const issueRows = db.prepare(`SELECT i.*,q.source_type,r.stage run_stage,r.chapter_index run_chapter,r.context_snapshot run_context
      FROM writing_quality_issues i JOIN writing_quality_reports q ON q.id=i.report_id
      LEFT JOIN generation_runs r ON q.source_type='artifact_quality' AND r.id=q.source_id
      WHERE i.project_id=? AND i.status='open' AND (q.source_type!='artifact_quality'
        OR r.constitution_json=?) ORDER BY i.created_at DESC LIMIT 100`)
      .all(projectId, currentConstitution) as any[];
    const issues = issueRows.filter(issue => issue.source_type !== 'artifact_quality'
      || issue.run_context === currentContext(issue.run_stage, issue.run_chapter));
    for (const run of runs) {
      const payload = run.quality_payload ? JSON.parse(run.quality_payload) : {};
      run.score = payload.stageScore ?? null;
      run.currentConstitution = run.constitution_json === currentConstitution
        && run.context_snapshot === currentContext(run.stage, run.chapter_index);
      delete run.quality_payload; delete run.output_text; delete run.constitution_json; delete run.context_snapshot;
    }
    const reportRows = db.prepare(`SELECT q.payload,r.stage,r.chapter_index,r.context_snapshot FROM writing_quality_reports q JOIN generation_runs r ON r.id=q.source_id
      WHERE q.project_id=? AND q.source_type='artifact_quality' AND r.constitution_json=?`).all(
      projectId, currentConstitution,
    ) as Array<{ payload: string; stage: string; chapter_index: number | null; context_snapshot: string }>;
    const byStage = new Map<string, StageScore[]>();
    for (const row of reportRows) {
      try {
        if (row.context_snapshot !== currentContext(row.stage, row.chapter_index)) continue;
        const score = JSON.parse(row.payload || '{}').stageScore as StageScore | undefined;
        if (score) byStage.set(row.stage, [...(byStage.get(row.stage) || []), score]);
      } catch { /* malformed historical report remains unscored */ }
    }
    const scores: Record<string, any> = {};
    for (const [stage, values] of byStage) scores[stage] = aggregateArtifactScores(stage as any, values);
    scores.project = aggregateProjectScore(scores);
    const repairs = db.prepare('SELECT id,stage,status,strategy,reason,before_score,after_score,before_text,after_text FROM generation_repairs WHERE project_id=? ORDER BY created_at DESC LIMIT 100').all(projectId) as any[];
    const issuePareto = db.prepare(`SELECT issue_type ruleId,COUNT(*) count FROM writing_quality_issues
      WHERE project_id=? AND status='open' GROUP BY issue_type ORDER BY count DESC,issue_type LIMIT 20`).all(projectId);
    const issueStageDistribution = db.prepare(`SELECT q.scope stage,COUNT(*) count FROM writing_quality_issues i
      JOIN writing_quality_reports q ON q.id=i.report_id WHERE i.project_id=? AND i.status='open' GROUP BY q.scope ORDER BY count DESC`).all(projectId);
    const strategyStats = db.prepare(`SELECT strategy_id strategyId,SUM(attempts) attempts,SUM(accepted) accepted,SUM(rollbacks) rollbacks,
      ROUND(CASE WHEN SUM(attempts)>0 THEN 1.0*SUM(accepted)/SUM(attempts) END,3) successRate,
      ROUND(CASE WHEN SUM(attempts)>0 THEN 1.0*SUM(introduced_issue_count)/SUM(attempts) END,3) destructionRate,
      ROUND(CASE WHEN SUM(attempts)>0 THEN SUM(improvement_sum)/SUM(attempts) END,2) avgImprovement
      FROM repair_strategy_stats WHERE platform=? GROUP BY strategy_id ORDER BY successRate DESC`).all(project ? readConstitution(project).targetPlatform : 'generic');
    const modelPromptCompare = db.prepare(`SELECT COALESCE(model,'unknown') model,prompt_version promptVersion,COUNT(*) runs,
      ROUND(AVG(CASE WHEN gate_status='passed' THEN 1.0 ELSE 0 END),3) passRate,ROUND(AVG(duration_ms)) avgLatencyMs
      FROM generation_runs WHERE project_id=? AND status!='running' GROUP BY model,prompt_version ORDER BY runs DESC LIMIT 20`).all(projectId);
    return { runs, issues, scores, repairs, issuePareto, issueStageDistribution, strategyStats, modelPromptCompare,
      benchmark: this.getBenchmarkFramework(),
      benchmarkRuns: db.prepare('SELECT id,status,sample_count,completed_count,failed_count,started_at FROM quality_benchmark_runs WHERE project_id=? ORDER BY started_at DESC LIMIT 10').all(projectId),
      execution: runs.filter(r => r.score && r.currentConstitution).map(r => ({ runId: r.id, stage: r.stage, contextVersion: r.context_version,
        contracts: r.score.characterContractReview?.contracts?.map((c: any) => ({ characterId: c.characterId, name: c.name, version: c.version })) || [],
        attributionCount: r.score.characterContractReview?.evidence?.length || 0, narrativeTrace: r.score.narrativeTrace,
        policy: r.score.policy, gateStatus: r.gate_status })),
      scope: '最近100次生成与100条未解决问题',
      bottlenecks: runs.filter(r => r.status === 'running' || r.status === 'failed' || r.gate_status === 'blocked'),
      trend: runs.filter(r => r.score).map(r => ({ at: r.started_at, stage: r.stage, score: r.score.overallScore, coverage: r.score.coverage })).reverse() };
  }

  addBenchmarkSample(input: { projectId?: string; storyType: string; platform: string; content: string; sourceRef?: string; chapterIndex?: number }) {
    const allowed = new Set(['short_story:fanqie', 'short_story:zhihu', 'long_novel:fanqie', 'long_novel:qidian', 'long_novel:qimao']);
    if (!allowed.has(`${input.storyType}:${input.platform}`) || !input.content?.trim()) throw new BadRequestException('Benchmark 样本组合或正文无效');
    if (input.chapterIndex !== undefined && (!Number.isInteger(input.chapterIndex) || input.chapterIndex < 0)) throw new BadRequestException('章节索引无效');
    const id = crypto.randomUUID(); const now = new Date().toISOString();
    this.databaseService.getDb().prepare(`INSERT INTO quality_benchmark_samples
      (id,project_id,story_type,platform,content,source_ref,annotation_status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,'pending',?,?)`).run(id, input.projectId ?? null, input.storyType, input.platform, input.content, input.sourceRef ?? null, now, now);
    if (input.chapterIndex !== undefined) {
      this.databaseService.getDb().prepare('UPDATE quality_benchmark_samples SET chapter_index=? WHERE id=?').run(input.chapterIndex,id);
    }
    return { id, annotationStatus: 'pending' };
  }

  annotateBenchmarkSample(id: string, labels: string[]) {
    if (!Array.isArray(labels) || labels.some(label => typeof label !== 'string' || !label.trim())) throw new BadRequestException('人工标签无效');
    const result = this.databaseService.getDb().prepare(`UPDATE quality_benchmark_samples
      SET human_labels_json=?,annotation_status='labeled',updated_at=? WHERE id=?`).run(JSON.stringify([...new Set(labels)]), new Date().toISOString(), id);
    if (!result.changes) throw new BadRequestException('Benchmark 样本不存在');
    return { id, annotationStatus: 'labeled', labels: [...new Set(labels)] };
  }

  recordBenchmarkEvaluation(input: { sampleId: string; runId?: string; predictedLabels: string[]; repairAttempted?: boolean; repairAccepted?: boolean; introducedIssue?: boolean; beforeScore?: number; afterScore?: number }) {
    const id = crypto.randomUUID();
    this.databaseService.getDb().prepare(`INSERT INTO quality_benchmark_evaluations
      (id,sample_id,run_id,predicted_labels_json,repair_attempted,repair_accepted,introduced_issue,before_score,after_score,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id, input.sampleId, input.runId ?? null, JSON.stringify([...new Set(input.predictedLabels || [])]),
      input.repairAttempted ? 1 : 0, input.repairAccepted ? 1 : 0, input.introducedIssue ? 1 : 0,
      input.beforeScore ?? null, input.afterScore ?? null, new Date().toISOString());
    return { id };
  }

  getBenchmarkFramework() {
    const db = this.databaseService.getDb();
    const combinations = [
      ['short_story', 'fanqie'], ['short_story', 'zhihu'], ['long_novel', 'fanqie'], ['long_novel', 'qidian'], ['long_novel', 'qimao'],
    ] as const;
    const groups = combinations.map(([storyType, platform]) => {
      const samples = db.prepare(`SELECT s.*,e.predicted_labels_json,e.repair_attempted,e.repair_accepted,e.introduced_issue
        FROM quality_benchmark_samples s LEFT JOIN quality_benchmark_evaluations e ON e.id=(SELECT id FROM quality_benchmark_evaluations
        WHERE sample_id=s.id ORDER BY created_at DESC LIMIT 1) WHERE s.story_type=? AND s.platform=?`).all(storyType, platform) as any[];
      let tp = 0; let fp = 0; let fn = 0; let attempts = 0; let accepted = 0; let damaged = 0;
      for (const sample of samples.filter(item => item.annotation_status === 'labeled' && item.predicted_labels_json)) {
        const human = new Set(JSON.parse(sample.human_labels_json || '[]') as string[]);
        const predicted = new Set(JSON.parse(sample.predicted_labels_json || '[]') as string[]);
        for (const label of predicted) human.has(label) ? tp++ : fp++;
        for (const label of human) if (!predicted.has(label)) fn++;
        attempts += Number(sample.repair_attempted) || 0; accepted += Number(sample.repair_accepted) || 0; damaged += Number(sample.introduced_issue) || 0;
      }
      const labeled = samples.filter(item => item.annotation_status === 'labeled').length;
      return { storyType, platform, samples: samples.length, labeled, pending: samples.length - labeled,
        precision: tp + fp ? tp / (tp + fp) : null, recall: tp + fn ? tp / (tp + fn) : null,
        falsePositives: fp, falseNegatives: fn, repairSuccessRate: attempts ? accepted / attempts : null,
        destructionRate: attempts ? damaged / attempts : null, status: samples.length ? (labeled ? 'measuring' : 'pending_annotation') : 'waiting_for_samples' };
    });
    return { available: groups.some(group => group.samples > 0), resultStatus: groups.some(group => group.samples > 0) ? 'real_samples_only' : 'waiting_for_real_samples', groups };
  }

  queryContentReports(query: Record<string, string | undefined>) {
    const db = this.databaseService.getDb();
    const page = Math.max(1, Math.floor(Number(query.page) || 1));
    const limit = Math.max(1, Math.min(50, Math.floor(Number(query.limit) || 10)));
    if (!Number.isFinite(page)) throw new BadRequestException('页码无效');
    const clauses: string[] = []; const params: any[] = [];
    const add = (sql: string, value: unknown) => { clauses.push(sql); params.push(value); };
    if (query.history !== 'true') clauses.push('r.position=1');
    if (query.projectId) add('r.project_id=?', query.projectId);
    if (query.storyType) add('r.project_type=?', query.storyType);
    if (query.platform) add('r.platform=?', query.platform);
    if (query.stage) add('r.stage=?', query.stage);
    for (const [key, operator] of [['from', '>='], ['to', '<=']] as const) {
      if (!query[key]) continue;
      const date = new Date(query[key]! + (query[key]!.length === 10 ? (key === 'to' ? 'T23:59:59.999Z' : 'T00:00:00.000Z') : ''));
      if (!Number.isFinite(date.getTime())) throw new BadRequestException('查询日期无效');
      add(`r.created_at${operator}?`, date.toISOString());
    }
    const issueClauses = ['i.report_id=r.id'];
    if (query.severity) { issueClauses.push('i.severity=?'); params.push(query.severity); }
    if (query.issueStatus) { issueClauses.push('i.status=?'); params.push(query.issueStatus); }
    if (issueClauses.length > 1) clauses.push(`EXISTS(SELECT 1 FROM writing_quality_issues i WHERE ${issueClauses.join(' AND ')})`);
    if (query.q?.trim()) {
      clauses.push(`(r.project_title LIKE ? OR r.chapter_title LIKE ? OR r.title LIKE ? OR r.summary LIKE ? OR EXISTS
        (SELECT 1 FROM writing_quality_issues i WHERE i.report_id=r.id AND (i.summary LIKE ? OR i.evidence LIKE ?)))`);
      params.push(...Array(6).fill('%' + query.q.trim() + '%'));
    }
    const cte = `WITH ranked AS (SELECT q.*, p.title project_title,p.type project_type,p.target_platform platform,
      p.settings project_settings,p.writing_style,p.target_words,
      c.title chapter_title,COALESCE(c.chapter_index,g.chapter_index) chapter_index,
      COALESCE(g.stage,'chapter') stage,g.constitution_json,
      ROW_NUMBER() OVER(PARTITION BY q.project_id,COALESCE(g.stage,'chapter'),COALESCE(q.chapter_id,CAST(g.chapter_index AS TEXT),'')
        ORDER BY q.created_at DESC,q.id DESC) position
      FROM writing_quality_reports q JOIN projects p ON p.id=q.project_id
      LEFT JOIN chapters c ON c.id=q.chapter_id LEFT JOIN generation_runs g ON g.id=q.source_id)
      `;
    const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
    const total = Number((db.prepare(cte + 'SELECT COUNT(*) n FROM ranked r' + where).get(...params) as any).n);
    const rows = db.prepare(cte + 'SELECT * FROM ranked r' + where + ' ORDER BY r.created_at DESC,r.id DESC LIMIT ? OFFSET ?')
      .all(...params, limit, (page - 1) * limit) as any[];
    const parse = (value: string | null) => { try { return JSON.parse(value || '{}'); } catch { return {}; } };
    return { total, page, limit, items: rows.map(r => {
      const score = parse(r.payload).stageScore ?? null;
      const current = !r.constitution_json || r.constitution_json === JSON.stringify(readConstitution({
        type: r.project_type, target_platform: r.platform,
        settings: r.project_settings, writing_style: r.writing_style, target_words: r.target_words,
      }));
      return { id: r.id, projectId: r.project_id, projectTitle: r.project_title, chapterId: r.chapter_id,
        chapterTitle: r.chapter_title, chapterIndex: r.chapter_index, stage: r.stage, createdAt: r.created_at,
        current, score: current ? score : null, overallScore: current ? r.overall_score : null,
        issues: db.prepare('SELECT id,severity,title,summary,evidence,suggestion,status FROM writing_quality_issues WHERE report_id=? ORDER BY created_at DESC').all(r.id),
        repairs: db.prepare('SELECT id,status,reason,before_score,after_score,before_text,after_text FROM generation_repairs WHERE run_id=? ORDER BY created_at DESC LIMIT 10').all(r.id),
      };
    }) };
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
   * ratio<1 表示历史首版偏短；仅作观测及章内缺口估计，不能据此改变章纲目标。
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
