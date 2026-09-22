import { describe, expect, it } from 'vitest';
import { repairStrategyUtility } from './repair-learning';

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
