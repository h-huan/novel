export interface RepairStrategyStats {
  attempts: number;
  accepted: number;
  rollbacks?: number;
  damage?: number;
  tokens?: number;
  latencyMs?: number;
  improvement?: number;
  improvement_sum?: number;
}

/**
 * Bayesian success estimate with bounded harm and cost penalties. Cost never
 * outweighs correctness; it only breaks ties between similarly reliable
 * strategies so the platform learns to use fewer tokens and less time.
 */
export function repairStrategyUtility(raw: RepairStrategyStats): number {
  const attempts = Math.max(1, Number(raw.attempts) || 0);
  const accepted = Math.max(0, Number(raw.accepted) || 0);
  const success = (accepted + 1) / (attempts + 2);
  const harmRate = Math.min(1, ((Number(raw.rollbacks) || 0) + (Number(raw.damage) || 0)) / attempts);
  const averageTokens = Math.max(0, Number(raw.tokens) || 0) / attempts;
  const averageLatency = Math.max(0, Number(raw.latencyMs) || 0) / attempts;
  const progress = Math.min(1, Math.max(0, Number(raw.improvement ?? raw.improvement_sum) || 0) / attempts);
  const tokenPenalty = 0.04 * Math.min(1, Math.log1p(averageTokens) / Math.log(100_001));
  const latencyPenalty = 0.04 * Math.min(1, Math.log1p(averageLatency) / Math.log(600_001));
  return success + 0.12 * progress - 0.25 * harmRate - tokenPenalty - latencyPenalty;
}
