import { describe, expect, it } from 'vitest';
import { assessHardlineRepairProgress } from './hardline-repair-progress';
import type { HardlineFinding } from './hardline-scanner';

const finding = (ruleId: string, occurrenceCount = 1): HardlineFinding => ({
  ruleId, occurrenceCount, message: ruleId, snippet: ruleId, position: '全文',
});

describe('hardline local repair progress', () => {
  it('allows a bounded batch to reduce bad windows while keeping the gate blocked', () => {
    const result = assessHardlineRepairProgress([finding('35', 6), finding('42')], [finding('35', 3), finding('42')]);
    expect(result).toMatchObject({ accepted: true, beforeRules: 2, afterRules: 2, beforeOccurrences: 7, afterOccurrences: 4 });
  });

  it('rejects trading a fixed layout defect for a new dash-density hardline', () => {
    const result = assessHardlineRepairProgress(
      [finding('26-uniform'), finding('35', 5)],
      [finding('35', 3), finding('dash-density', 6)],
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain('引入新硬红线');
  });

  it('rejects shifting a monotone punctuation window with no net reduction', () => {
    const result = assessHardlineRepairProgress([finding('35', 4)], [finding('35', 4)]);
    expect(result.accepted).toBe(false);
  });

  it('lets a whole-chapter fact repair keep existing hardlines but rejects an increase', () => {
    expect(assessHardlineRepairProgress([finding('35', 2)], [finding('35', 2)], false).accepted).toBe(true);
    expect(assessHardlineRepairProgress([finding('35', 2)], [finding('35', 3)], false).accepted).toBe(false);
  });
});
