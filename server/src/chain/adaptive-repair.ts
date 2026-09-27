export interface RepairDecision {
  repair: boolean;
  reason: 'complete' | 'first_targeted_repair' | 'issues_reduced' | 'repeated_issues' | 'no_measurable_progress';
}

export interface ContinuationDecision {
  continue: boolean;
  reason: 'target_reached' | 'first_continuation' | 'meaningful_progress' | 'no_growth' | 'insufficient_progress';
  gainedWords: number;
  requiredGain: number;
}

/** 确定性扫描结论里的 `| 位置: … | 原文: …` 每次都随重写变化，比较前必须剥离。 */
const VOLATILE_FINDING_SUFFIX = /\s*\|\s*(?:位置|原文)\s*[:：][\s\S]*$/;
/** `【硬红线·确定性扫描·42】…` / `【质量建议·确定性扫描·26】…` → 规则号才是稳定身份。 */
const DETERMINISTIC_FINDING = /^【[^】]*?确定性扫描·([^】·]+)】/;

/**
 * 把一条结论归约成“重写后依然不变”的身份。确定性扫描结论自带段落位置与违规原文，
 * 而这两者每次重写都会变；不剥离它们，同一条硬伤换个段落就会被判成“全新问题”。
 */
export function issueSignature(issue: string): string {
  const text = String(issue ?? '').trim();
  if (!text) return '';
  const scanned = text.match(DETERMINISTIC_FINDING);
  if (scanned) return `确定性扫描#${scanned[1]}`;
  return text.replace(VOLATILE_FINDING_SUFFIX, '').trim();
}

function normalizedIssueSet(issues: readonly string[]): string[] {
  return [...new Set(issues.map(issueSignature).filter(Boolean))].sort();
}

/** Reviewers may rewrite wording, so compare stable semantic families as a secondary guard. */
export function repairIssueFamily(issue: string): string {
  const text = String(issue || '').trim().toLowerCase();
  if (/必需事件|未兑现|covered=false|漏.{0,8}(事件|场景|钩子)/.test(text)) return 'outline_missing';
  if (/时间|倒计时|时序|timeline|先后顺序/.test(text)) return 'timeline';
  if (/跨章|场景边界|提前.{0,8}(下章|后章)|章节边界/.test(text)) return 'chapter_boundary';
  if (/世界观|世界规则|规则违反|能力边界/.test(text)) return 'world_rule';
  if (/人物|角色|动机|智力底线|character/.test(text)) return 'character';
  if (/物品状态|状态链|拿出|收起|没盖帽|收纳/.test(text)) return 'object_state';
  if (/重复|同句|同义|措辞|身体反应|段落|文风|prose/.test(text)) return 'prose';
  if (/来源冲突|资料冲突|上下文冲突/.test(text)) return 'source_conflict';
  return text.replace(/[“”'‘’『』【】\s\d，。；：、,.!?！？()-]/g, '').slice(0, 28) || 'unknown';
}

/**
 * Continue repair only when the verified issue set becomes a strict subset of
 * the previous one. A repair is never allowed to “pay for” removing one defect
 * by introducing another defect, even when the raw issue count decreases.
 */
export function decideProgressiveRepair(
  history: readonly (readonly string[])[],
  currentIssues: readonly string[],
): RepairDecision {
  const current = normalizedIssueSet(currentIssues);
  if (current.length === 0) return { repair: false, reason: 'complete' };
  if (history.length === 0) return { repair: true, reason: 'first_targeted_repair' };

  const signature = current.join('\n');
  const previousSets = history.map(normalizedIssueSet);
  if (previousSets.some(items => items.join('\n') === signature)) {
    return { repair: false, reason: 'repeated_issues' };
  }

  const previous = previousSets[previousSets.length - 1];
  const previousSet = new Set(previous);
  const introduced = current.filter(issue => !previousSet.has(issue));
  if (introduced.length > 0) {
    return { repair: false, reason: 'no_measurable_progress' };
  }
  if (current.length >= previous.length) {
    return { repair: false, reason: 'no_measurable_progress' };
  }

  const previousFamilies = new Set(previous.map(repairIssueFamily));
  const introducedFamilies = current
    .map(repairIssueFamily)
    .filter(family => !previousFamilies.has(family));
  if (introducedFamilies.length > 0) {
    return { repair: false, reason: 'no_measurable_progress' };
  }
  return { repair: true, reason: 'issues_reduced' };
}

/** A whole-chapter semantic rewrite must improve facts without creating new defects. */
export function assessSemanticRepairProgress(
  beforeIssues: readonly string[],
  afterIssues: readonly string[],
): { improved: boolean; before: number; after: number; introducedFamilies: string[] } {
  const before = normalizedIssueSet(beforeIssues);
  const after = normalizedIssueSet(afterIssues);
  const beforeSet = new Set(before);
  const introducedIssues = after.filter(issue => !beforeSet.has(issue));
  const knownFamilies = new Set(before.map(repairIssueFamily));
  const introducedFamilies = [...new Set(after.map(repairIssueFamily)
    .filter(family => !knownFamilies.has(family)))];
  return {
    improved: after.length < before.length && introducedIssues.length === 0 && introducedFamilies.length === 0,
    before: before.length,
    after: after.length,
    introducedFamilies,
  };
}

/**
 * A continuation is earned by measured movement toward the requested lower
 * bound. The first continuation may run because the first draft establishes
 * the baseline. Later calls must close a meaningful part of the remaining
 * deficit; otherwise repeating the same creative operation only spends more
 * time and tokens while increasing continuity risk.
 */
export function decideLengthContinuation(
  previousWords: number | null,
  currentWords: number,
  minimumWords: number,
): ContinuationDecision {
  if (currentWords >= minimumWords) {
    return { continue: false, reason: 'target_reached', gainedWords: 0, requiredGain: 0 };
  }
  if (previousWords === null) {
    return { continue: true, reason: 'first_continuation', gainedWords: currentWords, requiredGain: 0 };
  }
  const gainedWords = currentWords - previousWords;
  const previousDeficit = Math.max(0, minimumWords - previousWords);
  const requiredGain = Math.min(previousDeficit, Math.max(120, Math.ceil(previousDeficit * 0.35)));
  if (gainedWords <= 0) {
    return { continue: false, reason: 'no_growth', gainedWords, requiredGain };
  }
  if (gainedWords < requiredGain) {
    return { continue: false, reason: 'insufficient_progress', gainedWords, requiredGain };
  }
  return { continue: true, reason: 'meaningful_progress', gainedWords, requiredGain };
}
