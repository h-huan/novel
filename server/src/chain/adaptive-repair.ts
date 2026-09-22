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

function normalizedIssueSet(issues: readonly string[]): string[] {
  return [...new Set(issues.map(issue => String(issue).trim()).filter(Boolean))].sort();
}

/**
 * Reviewers often rewrite the wording of the same defect.  Compare semantic
 * families as well as raw counts so a repair cannot "make progress" by
 * replacing timeline errors with new character, boundary, or fact errors.
 */
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
 * Continue only while the verified issue set becomes strictly smaller.  This
 * makes repair count a result of measured progress instead of a fixed quota:
 * a clean first draft gets zero repairs, an unchanged repair stops after one,
 * and another pass is earned only by removing confirmed issues.
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
  if (current.length >= previous.length) {
    // 旧问题已全部解决、当前全部是新问题：视为实质进展（旧违规已修复），继续下一轮修复。
    // repeated_issues 仍会拦截“44→42→44”这类来回跳；≤3 上限防一次引入过多新问题。
    const allNew = current.every(c => !previous.includes(c));
    if (allNew && current.length <= 3) {
      return { repair: true, reason: 'issues_reduced' };
    }
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

/**
 * A continuation is earned by measured movement toward the requested lower
 * bound.  The first continuation may run because the first draft establishes
 * the baseline.  Later calls must close a meaningful part of the remaining
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
