import { CHARACTER_VOICE_COMPARISON_ISSUE_TYPES } from '../../../shared/src/system-workflow-rules.registry';
import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export type QualityStage = 'project' | 'world' | 'character' | 'outline' | 'chapter' | 'refinement';
export type QualitySeverity = 'blocking' | 'high' | 'medium' | 'low' | 'info';
export interface QualityIssue {
  id: string;
  projectId: string;
  entityId: string | null;
  runId: string | null;
  constitutionRevision: number | null;
  stage: QualityStage;
  ruleId: string;
  severity: QualitySeverity;
  status: 'open' | 'resolved' | 'superseded' | 'dismissed';
  message: string;
  evidence: { quote: string; start: number | null; end: number | null; verified: boolean };
  evaluation: 'evidenced' | 'insufficient_evidence';
  source: string;
  contractVersion?: string;
  contractField?: string;
  /** A verified missing prerequisite must be resolved before a framework is expanded into prose. */
  requiredPlanningCondition?: boolean;
}

/** QLT-003: recover only layout differences; never stitch or rewrite a quotation. */
export function resolveQualityEvidence(content: string, candidate: unknown): {
  quote: string; start: number | null; end: number | null; verified: boolean; unique: boolean;
} {
  const quote = typeof candidate === 'string' ? candidate.trim() : '';
  const absent = { quote, start: null, end: null, verified: false, unique: false };
  if (!quote) return absent;
  const exact = content.indexOf(quote);
  if (exact >= 0) {
    const unique = content.indexOf(quote, exact + 1) < 0;
    return { quote: content.slice(exact, exact + quote.length), start: unique ? exact : null,
      end: unique ? exact + quote.length : null, verified: true, unique };
  }
  // String offsets are UTF-16 units, including surrogate pairs. Array.from indexes
  // code points and therefore cannot be used as offsets into the original string.
  const indexes: number[] = [];
  let compact = '';
  for (let index = 0; index < content.length; index++) {
    if (/\s/u.test(content[index])) continue;
    indexes.push(index);
    compact += content[index];
  }
  const compactQuote = quote.replace(/\s/gu, '');
  if (!compactQuote) return absent;
  const found = compact.indexOf(compactQuote);
  if (found < 0) return absent;
  const start = indexes[found];
  const end = indexes[found + compactQuote.length - 1] + 1;
  const unique = compact.indexOf(compactQuote, found + 1) < 0;
  return { quote: content.slice(start, end), start: unique ? start : null,
    end: unique ? end : null, verified: true, unique };
}

/** Required semantic bases are owned by QLT-003; sources are supplied by callers. */
export function verifySemanticEvidence(finding: {
  ruleId?: string; issueType?: string; evidence?: unknown; shownEvidence?: unknown;
  evidenceKind?: string; basisEvidence?: unknown; basisSource?: string; basisReason?: string;
}, content: string, sources: Record<string, string> = {}) {
  const primary = resolveQualityEvidence(content, finding.evidence);
  const reasons: string[] = [];
  if (!primary.verified) reasons.push('问题引文不能连续定位到原文');
  const ruleId = finding.ruleId || finding.issueType || '';
  const explanation = /(?:over_explain|overexplanation|too_expository|causal_author_explanation)/.test(ruleId)
    || finding.evidenceKind === 'redundant_interpretation';
  const premature = finding.evidenceKind === 'premature_reveal';
  const causalGap = /(?:causality_gap|causal_gap)/.test(ruleId) || finding.evidenceKind === 'causal_gap';
  let shown = resolveQualityEvidence(content, finding.shownEvidence);
  let basis = resolveQualityEvidence(sources[finding.basisSource || ''] || '', finding.basisEvidence);
  if (explanation && !premature) {
    if (!shown.verified) reasons.push('过度解释缺少已呈现信息的原文证据');
    if (!finding.basisReason?.trim()) reasons.push('未说明解释是否新增信息、改变判断或推动选择');
  }
  if (CHARACTER_VOICE_COMPARISON_ISSUE_TYPES.some(type => ruleId === type || ruleId.endsWith('.' + type))) {
    if (!shown.verified) reasons.push('人物声音同质缺少另一人物的连续对白证据');
    if (primary.quote === shown.quote) reasons.push('人物声音同质不能仅凭同一句简短应答判断');
    if (!finding.basisReason?.trim()) reasons.push('缺少人物、表达或应对方式及场景依据的说明');
  }
  if (premature || causalGap) {
    if (premature && finding.basisSource !== 'chapter_plan') reasons.push('提前揭示须引用章纲揭示安排');
    if (!basis.verified) reasons.push('缺少可核对的章纲或必要前提依据');
    if (!finding.basisReason?.trim()) reasons.push('缺少揭示越界或必要因果前提的说明');
  }
  return { primary, shown, basis, verified: reasons.length === 0, reasons };
}

export function semanticEvidenceSources(content: string, context: string, executionStandard: string) {
  let snapshot: any = {};
  try { snapshot = JSON.parse(context); } catch { /* Non-JSON context has no verified ChapterPlan field. */ }
  return {
    body: content, project_context: context, execution_standard: executionStandard,
    chapter_plan: JSON.stringify([snapshot.outline, snapshot.chapterContract, snapshot.planningSources].filter(Boolean)),
  };
}

/** Correct a citation address only when its unchanged quote has one real source.
 * Reveal ordering must still cite chapter_plan; no evidence or verdict is invented. */
export function resolveExactCausalBasisSource(finding: any, sources: Record<string, string>) {
  if (finding?.evidenceKind !== 'causal_gap' || typeof finding.basisEvidence !== 'string' || !finding.basisEvidence.trim()
    || resolveQualityEvidence(sources[finding.basisSource] || '', finding.basisEvidence).verified) return finding;
  const matches = Object.entries(sources).filter(([, text]) => resolveQualityEvidence(text, finding.basisEvidence).verified);
  return matches.length === 1 ? { ...finding, basisSource: matches[0][0] } : finding;
}

export function materializeDimensionBasis(criterionSource: string, basis: any, dimensionId: string) {
  if (!basis || basis.criterionId !== dimensionId) return basis;
  return {...basis,criterion:criterionSource,selectionMethod:'provided_criterion_id'};
}

export function verifyDimensionBasis(criterionSource: string, basis: unknown, definitionStatus?: string): boolean {
  if (definitionStatus === 'unknown_definition') return false;
  if (!basis || typeof basis !== 'object') return false;
  const value = basis as { status?: string; criterion?: unknown; reason?: string };
  return value.status === 'evaluated' && !!value.reason?.trim()
    && resolveQualityEvidence(criterionSource, value.criterion).verified;
}

/**
 * 唯一标记：该问题的成因是「项目创作宪法里这一维的执行标准本身为空」。
 * 语义是【未执行标准】——用户创建项目时没有确认这一维，不是「正文写得不好」。
 * 任何地方判断「这是不是未执行标准」都必须调用 isMissingStandardIssue（结构化问题侧）
 * 或 chain.controller 的 isMissingStandardFinding（审查器文本侧），禁止各自再拼一份
 * 字符串/正则：口径分叉成两套判据，正是此前 Gate 文案把「标准没设」和「写得不好」
 * 混成一条报错的根因。
 */
export const MISSING_STANDARD_SOURCE = 'constitution_missing_standard';

/** 唯一判别函数：只做归类，不降级、不静默、不发明第二套判据。 */
export function isMissingStandardIssue(issue: Pick<QualityIssue, 'source' | 'ruleId'>): boolean {
  return issue.source === MISSING_STANDARD_SOURCE || issue.ruleId.endsWith('.missing_standard');
}

/**
 * A semantic blocking verdict becomes a proven blocker only when its evidence is
 * verifiable against the artifact. Missing execution standards are different:
 * they are structural project facts, so they do not require a quote from prose.
 */
export function isConfirmedBlockingIssue(issue: QualityIssue): boolean {
  return issue.status === 'open'
    && (issue.severity === 'blocking' || issue.requiredPlanningCondition === true)
    && (isMissingStandardIssue(issue) || issue.evaluation === 'evidenced');
}

/**
 * Keeps reviewer uncertainty visible without turning it into either a false PASS
 * or an unrepairable BLOCK. The reviewer must provide evidence before this claim
 * can participate in the blocking set.
 */
export function isUnevidencedBlockingIssue(issue: QualityIssue): boolean {
  return issue.status === 'open'
    && issue.severity === 'blocking'
    && !isMissingStandardIssue(issue)
    && issue.evaluation !== 'evidenced';
}

/**
 * 文本侧同一判据。审查器与 Gate 把结论作为字符串传下去（missing / contradictions 数组），
 * 这条文本便是一串「创作宪法里这一维为空」的说明，而不是结构化 issue，所以必须有一条字符串判据。
 *
 * 【为什么判据要写成宽口径】实测三类同义文本描述的是同一件事——标准没设：
 *   · 创作宪法未设置分类：属未执行标准，必须补齐后才能继续（不得用默认值或平台推荐替代）
 *   · 项目卡 creativeConstitution 中 category、pov、targetAudience 为空，而世界观档案与本章详细大纲…
 *   · 创作宪法 category 为空，无法核对本章分类归属；修复动作：补全分类字段后重评 category 维度。
 * 只认第一种严措辞，后两种会被判成「本章大纲不一致」：用户照着报错去改大纲，改完仍然失败，
 * 这才是「同一个 Gate 反反复复出现」的真正来源。
 *
 * 【为什么这条不能删】partitionAlignmentFindings 里这条判据排在 sourceConflicts 之前；
 * 后两种文本同时含「世界观档案」与「详细大纲」，一旦不在此拦下就会被来源冲突通道吸走、静默放行。
 *
 * 【为什么主体锚点是必要条件】「为空 / 缺失」这类词正文里也会出现；必须同时点到
 * 创作宪法 / 项目卡 / creativeConstitution 才算标准缺失，否则会把正文质量问题误判成未执行标准。
 * 判据只有这一份：chain.controller 与 gate-failure 都必须调用本函数，禁止各自再拼正则。
 */
export function isMissingStandardFinding(text: string): boolean {
  const value = String(text || '');
  if (!value) return false;
  // 严措辞：历史文本形态，两串同时出现才成立。
  if (value.includes('创作宪法未设置') && value.includes('未执行标准')) return true;
  // 宽措辞：主体锚点（必要条件）+ 状态词。
  const namesStandard = /creativeConstitution|创作宪法|项目卡/.test(value);
  const namesVacancy = /为空|缺失|未设置|未配置|未填写|未确认|未指定|not set|missing/i.test(value);
  return namesStandard && namesVacancy;
}

/** Adapts warning/contradiction/hardline and persisted issues without inventing evidence. */
export function qualityIssue(input: {
  id?: string; projectId: string; entityId?: string | null; runId?: string | null;
  constitutionRevision?: number | null; stage: QualityStage; ruleId: string;
  severity?: string; status?: string; message: string; quote?: string; content?: string;
  evidenceVerified?: boolean; source: string;
}): QualityIssue {
  // 严重度大小写不敏感归一：评审模型经常返回 "BLOCKING"/"HIGH"。此前大写 BLOCKING 不在映射表、
  // 也不在小写白名单，会落到默认值 medium —— 等于把阻断静默降级，是必须消除的降级路径。
  const rawSeverity = String(input.severity ?? '').toLowerCase();
  const severity: QualitySeverity = ({ critical: 'blocking', contradiction: 'blocking', warning: 'medium',
    info: 'info' } as Record<string, QualitySeverity>)[rawSeverity]
    || (['blocking', 'high', 'medium', 'low', 'info'].includes(rawSeverity) ? rawSeverity as QualitySeverity : 'medium');
  const located = resolveQualityEvidence(input.content ?? '', input.quote);
  const quote = located.quote;
  // Trusted structural findings without prose have their own authority. A flag
  // must never override a failed quote when the actual artifact is available.
  const verified = located.verified || (input.content === undefined && input.evidenceVerified === true);
  return {
    id: input.id || createHash('sha256').update(JSON.stringify([input.projectId, input.entityId, input.runId, input.ruleId, quote, input.message])).digest('hex'),
    projectId: input.projectId, entityId: input.entityId ?? null, runId: input.runId ?? null,
    constitutionRevision: input.constitutionRevision ?? null, stage: input.stage, ruleId: input.ruleId,
    severity, status: ['resolved', 'superseded', 'dismissed'].includes(input.status || '') ? input.status as QualityIssue['status'] : 'open',
    message: input.message, evidence: { quote, start: located.start, end: located.end, verified },
    evaluation: verified ? 'evidenced' : 'insufficient_evidence', source: input.source,
  };
}

export function qualityGate(issues: QualityIssue[], evaluated: boolean) {
  const blocking = issues.filter(isConfirmedBlockingIssue);
  const unevidencedBlocking = issues.filter(isUnevidencedBlockingIssue);
  const reviewComplete = evaluated && issues.every(issue => issue.status !== 'open'
    || isMissingStandardIssue(issue) || issue.evaluation === 'evidenced');
  return {
    passed: reviewComplete && blocking.length === 0,
    status: blocking.length ? 'blocked' : !reviewComplete ? 'not_evaluated' : 'passed',
    blockingIssueIds: blocking.map(i => i.id),
    unevidencedBlockingIssueIds: unevidencedBlocking.map(i => i.id),
  };
}

export interface QualityIssueWrite {
  ruleId: string;
  severity?: string;
  status?: string;
  message: string;
  quote?: string;
  content?: string;
  evidenceVerified?: boolean;
  suggestion?: string;
  details?: unknown;
  entityId?: string | null;
  runId?: string | null;
  constitutionRevision?: number | null;
}

/**
 * The only persistence adapter for non-manual quality checks.
 * One report represents one current artifact scope; reruns replace its open
 * findings instead of creating a report for each model response.
 */
export function replaceQualityIssues(db: DatabaseSync, input: {
  projectId: string;
  stage: QualityStage;
  source: string;
  scopeKey: string;
  chapterId?: string | null;
  title?: string;
  overallScore?: number | null;
  issues: QualityIssueWrite[];
}): { reportId: string; issues: QualityIssue[] } {
  const now = new Date().toISOString();
  const reportId = `quality_${createHash('sha256').update(JSON.stringify([
    input.projectId, input.stage, input.source, input.scopeKey,
  ])).digest('hex')}`;
  const normalized = input.issues.map(raw => qualityIssue({
    ...raw,
    projectId: input.projectId,
    entityId: raw.entityId ?? input.chapterId ?? null,
    stage: input.stage,
    source: input.source,
    severity: raw.severity,
  }));
  const evidenceComplete = normalized.every(issue => issue.evaluation === 'evidenced') || normalized.length === 0;
  const gate = qualityGate(normalized, evidenceComplete);
  const blocking = gate.status === 'blocked';
  const summary = normalized.length === 0 ? '未发现问题' : `${normalized.length} 条问题`;

  db.prepare(`INSERT INTO writing_quality_reports
    (id,project_id,chapter_id,source_type,source_id,scope,title,summary,overall_level,overall_score,status,payload,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET chapter_id=excluded.chapter_id,summary=excluded.summary,
      overall_level=excluded.overall_level,overall_score=excluded.overall_score,status=excluded.status,
      payload=excluded.payload,updated_at=excluded.updated_at`).run(
    reportId, input.projectId, input.chapterId ?? null, `quality:${input.source}`, input.scopeKey,
    input.stage, input.title || `${input.stage}质量检查`, summary,
    blocking ? 'low' : normalized.length ? 'medium' : 'high', input.overallScore ?? null,
    gate.status === 'passed' ? 'open' : gate.status,
    JSON.stringify({ evaluation: gate.status === 'not_evaluated' ? 'insufficient_evidence' : 'evaluated', source: input.source }), now, now,
  );
  db.prepare("UPDATE writing_quality_issues SET status='superseded',updated_at=? WHERE report_id=? AND status='open'")
    .run(now, reportId);

  const insert = db.prepare(`INSERT INTO writing_quality_issues
    (id,report_id,project_id,chapter_id,issue_type,severity,title,summary,evidence,suggestion,
     start_offset,end_offset,status,payload,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET chapter_id=excluded.chapter_id,severity=excluded.severity,
      title=excluded.title,summary=excluded.summary,evidence=excluded.evidence,suggestion=excluded.suggestion,
      start_offset=excluded.start_offset,end_offset=excluded.end_offset,status=excluded.status,
      payload=excluded.payload,updated_at=excluded.updated_at`);
  normalized.forEach((issue, index) => {
    const raw = input.issues[index];
    const issueId = createHash('sha256').update(JSON.stringify([
      reportId, issue.ruleId, issue.evidence.quote, issue.message,
    ])).digest('hex');
    issue.id = issueId;
    insert.run(issueId, reportId, input.projectId, input.chapterId ?? null, issue.ruleId,
      issue.severity, issue.message, issue.message, issue.evidence.quote || null, raw.suggestion ?? null,
      issue.evidence.start, issue.evidence.end, issue.status,
      JSON.stringify({ qualityIssue: issue, details: raw.details ?? null }), now, now);
  });
  return { reportId, issues: normalized };
}

/** Statistical platform deviations remain visible risks, not an automatic prose mandate. */
export function isAutomaticQualityRepairIssue(issue:QualityIssue) {
 if(issue.requiredPlanningCondition)return false;
 if(issue.status!=='open'||!['blocking','high'].includes(issue.severity)||issue.evaluation!=='evidenced')return false;
 if(issue.severity!=='blocking'&&issue.ruleId.startsWith('platform.')&&issue.source.startsWith('platform_deterministic'))return false;
 return true;
}
