import type { HardlineFinding } from './hardline-scanner';

export interface HardlineRepairProgress {
  accepted: boolean;
  reason: string;
  beforeRules: number;
  afterRules: number;
  beforeOccurrences: number;
  afterOccurrences: number;
}

/** Compare scanner evidence, not just the number of rule IDs. Saving still requires zero findings. */
export function assessHardlineRepairProgress(
  before: readonly HardlineFinding[],
  after: readonly HardlineFinding[],
  requireImprovement = true,
): HardlineRepairProgress {
  const countByRule = (items: readonly HardlineFinding[]) => {
    const counts = new Map<string, number>();
    for (const finding of items) {
      const count = Math.max(1, Number(finding.occurrenceCount) || 1);
      counts.set(finding.ruleId, (counts.get(finding.ruleId) || 0) + count);
    }
    return counts;
  };
  const beforeCounts = countByRule(before);
  const afterCounts = countByRule(after);
  const beforeOccurrences = [...beforeCounts.values()].reduce((sum, count) => sum + count, 0);
  const afterOccurrences = [...afterCounts.values()].reduce((sum, count) => sum + count, 0);
  const result = (accepted: boolean, reason: string): HardlineRepairProgress => ({
    accepted, reason, beforeRules: before.length, afterRules: after.length,
    beforeOccurrences, afterOccurrences,
  });

  for (const [ruleId, count] of afterCounts) {
    if (!beforeCounts.has(ruleId)) return result(false, `引入新硬红线 ${ruleId}`);
    if (count > (beforeCounts.get(ruleId) || 0)) return result(false, `${ruleId} 命中数增加`);
  }
  if (requireImprovement && afterOccurrences >= beforeOccurrences) return result(false, '全量确定性命中数未下降');
  return result(true, requireImprovement
    ? '全量确定性命中数严格下降，剩余规则继续阻断保存'
    : '整章事实修订未引入或加重硬红线，剩余规则继续阻断保存');
}
