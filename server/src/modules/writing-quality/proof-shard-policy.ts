/**
 * Causal proof shard policy.
 *
 * Shard sizes are NOT a fixed number. Like chapter splitting, the plan is
 * derived from the work to be done and the model budget:
 *   - how many independent result obligations the chapter owns,
 *   - how long those result texts are (longer rows need more output tokens),
 *   - the call's structured output budget (reasoning is included),
 *   - an empirically reliable rows-per-call ceiling, configurable,
 *   - a minimum useful shard size (never create tiny shards just to hit a
 *     hard-coded call count).
 *
 * The policy only decides transport boundaries. Every result still has its own
 * proof row and the server still validates complete coverage, so changing a
 * limit cannot drop or sample an obligation.
 */

export interface ProofShardPolicyInput {
  /** Number of independent result obligations owned by this audit. */
  resultCount: number;
  /** Average characters of the result texts; used as a row-complexity signal. */
  averageResultChars: number;
  /** Structured output budget for one call, including reasoning tokens. */
  outputTokenBudget: number;
  /** Empirical maximum number of rows a single first pass reviews reliably. */
  reliableRowsPerCall: number;
  /** Token budget we are willing to spend on one proof response. */
  rowTokenBudget: number;
  /** Fixed cost of one proof row (anchors, status, reason, JSON shape). */
  baseRowTokens?: number;
  /** Below this, a shard is too small to be worth a separate call. */
  minimumRowsPerShard?: number;
  /** Optional absolute ceiling for diagnostics; 0 derives it from the work. */
  maximumShards?: number;
}

export interface ProofShardPlan {
  /** Number of result rows assigned to each first-pass call. */
  maxResultsPerShard: number;
  /** Total first-pass calls required; 1 means no sharding. */
  shardCount: number;
  /** The row budget the decision was based on, kept for logs/tests. */
  budgetRows: number;
  /** Average estimated output tokens per result row. */
  estimatedRowTokens: number;
}

const DEFAULT_BASE_ROW_TOKENS = 160;
const DEFAULT_MIN_ROWS = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Plan the first-pass split for one audit.
 *
 * `rowTokenBudget` (not the full model cap) is the anchor: a proof pass should
 * leave room for reasoning and must not consume the whole structured-output
 * envelope. `reliableRowsPerCall` is the empirical ceiling from observed
 * omissions; the smaller of the two wins.
 */
export function planProofShards(input: ProofShardPolicyInput): ProofShardPlan {
  const resultCount = Math.max(0, Math.floor(input.resultCount));
  const baseRowTokens = Math.max(32, input.baseRowTokens ?? DEFAULT_BASE_ROW_TOKENS);
  const minimumRows = Math.max(1, input.minimumRowsPerShard ?? DEFAULT_MIN_ROWS);
  const estimatedRowTokens = Math.max(1, Math.round(baseRowTokens + Math.max(0, input.averageResultChars)));
  const rowTokenBudget = Math.max(1, Math.floor(input.rowTokenBudget));
  const reliableRows = Math.max(1, Math.floor(input.reliableRowsPerCall));
  const budgetRows = Math.max(1, Math.floor(rowTokenBudget / estimatedRowTokens));
  const maximumRowsByModel = Math.max(1, Math.floor(Math.max(1, input.outputTokenBudget) / estimatedRowTokens));
  const perShard = clamp(Math.min(reliableRows, budgetRows, maximumRowsByModel), minimumRows, Math.max(1, resultCount));
  const requiredShards = resultCount === 0 ? 0 : Math.ceil(resultCount / perShard);
  const maximumShards = input.maximumShards && input.maximumShards > 0
    ? input.maximumShards
    : resultCount === 0 ? 0 : Math.max(1, Math.ceil(resultCount / minimumRows));
  const shardCount = Math.min(requiredShards, Math.max(1, maximumShards));
  return {
    maxResultsPerShard: perShard,
    shardCount,
    budgetRows,
    estimatedRowTokens,
  };
}

/**
 * A balanced split that never drops, duplicates or reorders an ID.
 * When `maxResultsPerShard` is absent or covers the whole set, one pass is
 * returned verbatim (the existing no-shard path).
 */
export function balancedProofPartitions<T>(
  items: readonly T[],
  maxResultsPerShard: number,
  maximumShards = 0,
): T[][] {
  if (!items.length) return [[]];
  const perShard = Math.max(1, Math.floor(maxResultsPerShard));
  const required = Math.ceil(items.length / perShard);
  const cap = maximumShards > 0 ? maximumShards : required;
  const shardCount = Math.max(1, Math.min(required, cap));
  if (shardCount === 1) return [[...items]];
  const size = Math.ceil(items.length / shardCount);
  const partitions: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    partitions.push(items.slice(index, index + size));
  }
  return partitions;
}

/** Average character length of a group of result texts. */
export function averageResultChars(texts: readonly string[]): number {
  if (!texts.length) return 0;
  return texts.reduce((sum, text) => sum + (text || '').length, 0) / texts.length;
}
