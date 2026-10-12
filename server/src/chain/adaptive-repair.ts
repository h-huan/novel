export interface RepairDecision {
  repair: boolean;
  reason: 'complete' | 'first_local_repair' | 'measurable_progress' | 'repeated_issues' | 'no_measurable_progress';
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

export function issueSignature(issue: string): string {
  const text = String(issue ?? '').trim();
  if (!text) return '';
  const scanned = text.match(DETERMINISTIC_FINDING);
  if (scanned) return `确定性扫描#${scanned[1]}`;
  // A measured metric has a stable identity even when the reviewer paraphrases it.
  if (/(?:对白|对话)占比[^。；\n]{0,45}(?:不足|未达|低于|高于|过高|过低|目标|区间)/.test(text)) return 'platform#dialogue_ratio';
  return text.replace(VOLATILE_FINDING_SUFFIX, '').trim();
}

function citesUnchangedPassage(issue: string, beforeContent: string, afterContent: string): boolean {
  const quotes = [...issue.matchAll(/[“‘]([^”’\n]{12,})[”’]/g)].map(match => match[1]);
  const bodyQuotes = quotes.filter(quote => afterContent.includes(quote));
  if (!bodyQuotes.length) return false;
  const paragraphs = afterContent.split(/\n\s*\n/).filter(paragraph => paragraph.trim());
  // Do not match by family, approximate text or a short name. Every cited body
  // passage must identify a whole paragraph or sentence which existed unchanged.
  return bodyQuotes.every(quote => {
    const matches = paragraphs.filter(paragraph => paragraph.includes(quote));
    if (matches.length !== 1) return false;
    if (beforeContent.includes(matches[0])) return true;
    const paragraph = matches[0];
    const offset = paragraph.indexOf(quote);
    if (paragraph.indexOf(quote, offset + 1) !== -1) return false;
    const prefix = paragraph.slice(0, offset);
    const start = Math.max(prefix.lastIndexOf('。'), prefix.lastIndexOf('！'), prefix.lastIndexOf('？')) + 1;
    const suffixOffset = offset + quote.length;
    const suffix = paragraph.slice(suffixOffset);
    const stop = suffix.search(/[。！？]/);
    let end = stop < 0 ? paragraph.length : suffixOffset + stop + 1;
    if (/[”’]/.test(paragraph[end] || '')) end += 1;
    return beforeContent.includes(paragraph.slice(start, end).trim());
  });
}

function normalizedIssueSet(issues: readonly string[]): string[] {
  return [...new Set(issues.map(issueSignature).filter(Boolean))].sort();
}

export function repairIssueFamily(issue: string): string {
  const text = String(issue || '').trim().toLowerCase();
  if (/必需事件|未兑现|covered=false|漏.{0,8}(事件|场景|钩子)/.test(text)) return 'outline_missing';
  if (/时间|倒计时|时序|timeline|先后顺序/.test(text)) return 'timeline';
  if (/跨章|场景边界|提前.{0,8}(下一章|下章|后章)|章节边界/.test(text)) return 'chapter_boundary';
  if (/世界观|世界规则|规则违反|能力边界/.test(text)) return 'world_rule';
  if (/人物|角色|动机|智力底线|character/.test(text)) return 'character';
  if (/物品状态|状态链|拿出|收起|没盖帽|收纳/.test(text)) return 'object_state';
  if (/重复|同句|同义|措辞|身体反应|段落|文风|prose/.test(text)) return 'prose';
  if (/来源冲突|资料冲突|上下文冲突/.test(text)) return 'source_conflict';
  return text.replace(/[“”'‘’『』【】\s\d，。；：、,.!?！？()-]/g, '').slice(0, 28) || 'unknown';
}

/**
 * Authorize evidence-anchored LOCAL fact repair only.
 *
 * The caller records each pre-repair issue set. A first local patch is allowed;
 * another local patch is earned when the remaining set is a strict subset,
 * or the caller has verified that newly worded findings cite unchanged original
 * passages and the remaining count strictly decreases. Repeated/equal/growing
 * sets stop without a separate complete evidence audit; the caller must bound
 * audited iterations, and callers without original-body evidence stay strict.
 * Whole-chapter rewriting is separately blocked at the LLM boundary, so this
 * decision can never be interpreted as permission to regenerate the chapter.
 */
export function decideProgressiveRepair(
  history: readonly (readonly string[])[],
  currentIssues: readonly string[],
  evidenceValidatedProgress = false,
): RepairDecision {
  const current = normalizedIssueSet(currentIssues);
  if (current.length === 0) return { repair: false, reason: 'complete' };
  if (history.length === 0) return { repair: true, reason: 'first_local_repair' };

  const signature = current.join('\n');
  const previousSets = history.map(normalizedIssueSet);
  if (previousSets.some(items => items.join('\n') === signature)) {
    return { repair: false, reason: 'repeated_issues' };
  }

  const latest = previousSets[previousSets.length - 1] || [];
  const latestSet = new Set(latest);
  const strictSubset = current.length < latest.length && current.every(issue => latestSet.has(issue));
  if (strictSubset || evidenceValidatedProgress) {
    return { repair: true, reason: 'measurable_progress' };
  }
  return { repair: false, reason: 'no_measurable_progress' };
}

/**
 * Compare bounded local candidates. Without both original bodies, retain the
 * strict issue-set guard. With bodies, a newly reported original defect may be
 * retained only through an unchanged full sentence/paragraph, never a family
 * resemblance. Remaining defects still block Canon through the complete gates.
 */
export function assessSemanticRepairProgress(
  beforeIssues: readonly string[],
  afterIssues: readonly string[],
  bodies?: { beforeContent: string; afterContent: string },
): { improved: boolean; before: number; after: number; introducedFamilies: string[] } {
  const before = normalizedIssueSet(beforeIssues);
  const after = normalizedIssueSet(afterIssues);
  const beforeSet = new Set(before);
  const introducedIssues = after.filter(issue => !beforeSet.has(issue)
    && !(bodies && citesUnchangedPassage(issue, bodies.beforeContent, bodies.afterContent)));
  const knownFamilies = new Set(before.map(repairIssueFamily));
  const introducedFamilies = [...new Set(introducedIssues.map(repairIssueFamily)
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
