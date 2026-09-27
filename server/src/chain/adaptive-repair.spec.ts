import { describe, expect, it } from 'vitest';
import { assessSemanticRepairProgress, decideLengthContinuation, decideProgressiveRepair, issueSignature, repairIssueFamily } from './adaptive-repair';

describe('whole-chapter fact repair rollback', () => {
  it('rejects the observed rewrite that adds arithmetic and list contradictions', () => {
    const result = assessSemanticRepairProgress(
      ['大纲必需事件未兑现：林川空白刻痕', '林川格位与周家格位冲突'],
      ['大纲必需事件未兑现：时间回拨一小时', '名单格数内部矛盾：七层三户二十格',
        '名单剩余自相矛盾：明列多户有名却说只剩一格'],
    );
    expect(result).toMatchObject({ improved: false, before: 2, after: 3 });
  });

  it('accepts only a reduction without a new issue family', () => {
    expect(assessSemanticRepairProgress(['漏钩子', '漏场景'], ['漏钩子']).improved).toBe(true);
    expect(assessSemanticRepairProgress(['时间线跳跃', '漏钩子'], ['人物越界']).improved).toBe(false);
  });
});

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

  it('reads the same deterministic rule at a new position as the same defect, not as progress', () => {
    const before = ['【硬红线·确定性扫描·42】对话太圆滑机械 | 位置: 第 46-51 段 | 原文: 好的，我马上帮您查询'];
    const after = ['【硬红线·确定性扫描·42】对话太圆滑机械 | 位置: 第 102-110 段 | 原文: 请您稍等，我为您核实'];
    expect(issueSignature(after[0])).toBe('确定性扫描#42');
    expect(decideProgressiveRepair([before], after).reason).toBe('repeated_issues');
  });

  it('still earns one repair when the deterministic rule that fired actually changes', () => {
    const before = ['【硬红线·确定性扫描·42】对话太圆滑机械 | 位置: 第 46-51 段 | 原文: 好的，我马上帮您查询'];
    const after = ['【硬红线·确定性扫描·43】缺少不完美细节 | 位置: 第 20-24 段 | 原文: 桌面一尘不染'];
    expect(decideProgressiveRepair([before], after)).toMatchObject({ repair: true, reason: 'issues_reduced' });
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
