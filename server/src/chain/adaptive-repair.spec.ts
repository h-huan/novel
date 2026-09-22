import { describe, expect, it } from 'vitest';
import { decideLengthContinuation, decideProgressiveRepair, repairIssueFamily } from './adaptive-repair';

describe('decideProgressiveRepair', () => {
  it('does not repair a clean first draft', () => {
    expect(decideProgressiveRepair([], [])).toEqual({ repair: false, reason: 'complete' });
  });

  it('allows the first evidenced targeted repair', () => {
    expect(decideProgressiveRepair([], ['漏结尾钩子'])).toMatchObject({ repair: true });
  });

  it('stops when a repair repeats or replaces issues without reducing them', () => {
    expect(decideProgressiveRepair([['漏场景', '漏钩子']], ['漏场景', '漏钩子']).reason).toBe('repeated_issues');
    expect(decideProgressiveRepair([['漏场景', '漏钩子']], ['人物越界', '漏钩子']).reason).toBe('no_measurable_progress');
  });

  it('earns another repair only after the verified issue count decreases', () => {
    expect(decideProgressiveRepair([['漏场景', '漏钩子']], ['漏钩子'])).toEqual({
      repair: true,
      reason: 'issues_reduced',
    });
  });

  it('stops when fewer issues are achieved by introducing a different defect family', () => {
    expect(decideProgressiveRepair(
      [['时间线跳跃', '提前执行下一章场景', '漏结尾钩子']],
      ['人物动机越界'],
    )).toEqual({ repair: false, reason: 'no_measurable_progress' });
    expect(repairIssueFamily('相邻段落短距离重复身体反应')).toBe('prose');
  });
});

describe('decideLengthContinuation', () => {
  it('allows one targeted continuation after the first short draft', () => {
    expect(decideLengthContinuation(null, 2200, 3000).reason).toBe('first_continuation');
  });

  it('continues only when the new text measurably closes the deficit', () => {
    expect(decideLengthContinuation(2200, 2520, 3000).reason).toBe('meaningful_progress');
    expect(decideLengthContinuation(2200, 2300, 3000).reason).toBe('insufficient_progress');
  });

  it('stops unchanged output and a completed draft', () => {
    expect(decideLengthContinuation(2200, 2200, 3000).reason).toBe('no_growth');
    expect(decideLengthContinuation(2800, 3000, 3000).reason).toBe('target_reached');
  });
});
