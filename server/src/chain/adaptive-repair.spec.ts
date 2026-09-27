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

  it('accepts only a strict subset of the previous issue set', () => {
    expect(assessSemanticRepairProgress(['漏钩子', '漏场景'], ['漏钩子']).improved).toBe(true);
    expect(assessSemanticRepairProgress(['时间线跳跃', '漏钩子'], ['人物越界']).improved).toBe(false);
    expect(assessSemanticRepairProgress(['漏钩子', '漏场景'], ['新问题']).improved).toBe(false);
  });
});

describe('decideProgressiveRepair', () => {
  it('does not repair a clean first draft', () => {
    expect(decideProgressiveRepair([], [])).toEqual({ repair: false, reason: 'complete' });
  });

  it('allows exactly the first evidence-anchored local fact repair', () => {
    expect(decideProgressiveRepair([], ['漏结尾钩子'])).toEqual({
      repair: true,
      reason: 'first_local_repair',
    });
  });

  it('identifies an exact repeated issue set and stops', () => {
    expect(decideProgressiveRepair([['漏场景', '漏钩子']], ['漏场景', '漏钩子'])).toEqual({
      repair: false,
      reason: 'repeated_issues',
    });
  });

  it('earns another local patch only when unresolved issues are a strict subset', () => {
    expect(decideProgressiveRepair([['漏场景', '漏钩子']], ['漏钩子'])).toEqual({
      repair: true,
      reason: 'measurable_progress',
    });
  });

  it('stops when a different problem replaces the old one', () => {
    expect(decideProgressiveRepair([['漏场景', '漏钩子']], ['人物越界'])).toEqual({
      repair: false,
      reason: 'no_measurable_progress',
    });
  });

  it('reads the same deterministic rule at a new position as the same defect', () => {
    const before = ['【硬红线·确定性扫描·42】对话太圆滑机械 | 位置: 第 46-51 段 | 原文: 好的，我马上帮您查询'];
    const after = ['【硬红线·确定性扫描·42】对话太圆滑机械 | 位置: 第 102-110 段 | 原文: 请您稍等，我为您核实'];
    expect(issueSignature(after[0])).toBe('确定性扫描#42');
    expect(decideProgressiveRepair([before], after).reason).toBe('repeated_issues');
  });

  it('keeps semantic family normalization available to local repair diagnostics', () => {
    expect(repairIssueFamily('相邻段落短距离重复身体反应')).toBe('prose');
    expect(repairIssueFamily('提前执行下一章场景')).toBe('chapter_boundary');
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
