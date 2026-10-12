import { describe, expect, it } from 'vitest';
import { repairStrategyUtility, verifiedRepairLesson } from './repair-learning';

describe('repair strategy learning utility', () => {
  it('prefers a similarly successful strategy that uses fewer tokens and less time', () => {
    const efficient = repairStrategyUtility({ attempts: 20, accepted: 16, tokens: 80_000, latencyMs: 200_000 });
    const expensive = repairStrategyUtility({ attempts: 20, accepted: 16, tokens: 800_000, latencyMs: 2_000_000 });
    expect(efficient).toBeGreaterThan(expensive);
  });

  it('keeps correctness more important than cost and penalizes damage', () => {
    const reliable = repairStrategyUtility({ attempts: 20, accepted: 18, tokens: 800_000, latencyMs: 2_000_000 });
    const cheapButWeak = repairStrategyUtility({ attempts: 20, accepted: 8, tokens: 20_000, latencyMs: 20_000 });
    const damaging = repairStrategyUtility({ attempts: 20, accepted: 18, damage: 8, tokens: 800_000, latencyMs: 2_000_000 });
    expect(reliable).toBeGreaterThan(cheapButWeak);
    expect(reliable).toBeGreaterThan(damaging);
  });

  it('learns from verified partial progress instead of treating every non-final attempt equally', () => {
    const reducedMostIssues = repairStrategyUtility({ attempts: 4, accepted: 0, improvement_sum: 3 });
    const madeNoProgress = repairStrategyUtility({ attempts: 4, accepted: 0, improvement_sum: 0, rollbacks: 4 });
    expect(reducedMostIssues).toBeGreaterThan(madeNoProgress);
  });
});

describe('verified strategy references', () => {
  it('records the actual strategy, with current-context verification instead of generic advice', () => {
    const lesson=verifiedRepairLesson('platform.dialogue_ratio','platform_metric_patch');
    expect(lesson).toContain('platform_metric_patch');
    expect(lesson).toContain('禁止新增人物或剧情');
    expect(lesson).toContain('历史成功不代替本次验收');
    expect(lesson).not.toContain('35%');
  });
  it('does not turn unknown strategy names into verified experience', () => {
    expect(verifiedRepairLesson('logic','unknown')).toBeNull();
    expect(verifiedRepairLesson('logic','toString')).toBeNull();
  });
});
