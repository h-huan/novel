import { describe, expect, it } from 'vitest';
import {
  averageResultChars,
  balancedProofPartitions,
  planProofShards,
} from './proof-shard-policy';

const base = {
  outputTokenBudget: 131072,
  reliableRowsPerCall: 24,
  rowTokenBudget: 4096,
};

describe('proof shard policy', () => {
  it('does not shard when the whole chapter fits the reliable row budget', () => {
    const plan = planProofShards({ ...base, resultCount: 20, averageResultChars: 30 });
    expect(plan.shardCount).toBe(1);
    expect(plan.maxResultsPerShard).toBe(20);
  });

  it('derives the split from result count, row length and budget instead of a fixed 24', () => {
    const short = planProofShards({ ...base, resultCount: 60, averageResultChars: 10 });
    const long = planProofShards({ ...base, resultCount: 60, averageResultChars: 120 });
    expect(short.shardCount).toBeLessThan(long.shardCount);
    expect(short.maxResultsPerShard).toBeGreaterThan(long.maxResultsPerShard);
  });

  it('lowers the per-call row count when the structured output budget is smaller', () => {
    const roomy = planProofShards({ ...base, resultCount: 80, averageResultChars: 20 });
    const tight = planProofShards({ ...base, outputTokenBudget: 8192, rowTokenBudget: 2048, resultCount: 80, averageResultChars: 20 });
    expect(tight.maxResultsPerShard).toBeLessThan(roomy.maxResultsPerShard);
    expect(tight.shardCount).toBeGreaterThan(roomy.shardCount);
  });

  it('respects the empirical reliability ceiling even with a huge output budget', () => {
    const plan = planProofShards({ ...base, outputTokenBudget: 1_000_000, rowTokenBudget: 1_000_000, reliableRowsPerCall: 24, resultCount: 100, averageResultChars: 10 });
    expect(plan.maxResultsPerShard).toBe(24);
    expect(plan.shardCount).toBe(5);
  });

  it('never creates shards smaller than the minimum useful size', () => {
    const plan = planProofShards({ ...base, reliableRowsPerCall: 2, minimumRowsPerShard: 8, resultCount: 20, averageResultChars: 10 });
    expect(plan.maxResultsPerShard).toBeGreaterThanOrEqual(8);
    expect(plan.shardCount).toBeLessThanOrEqual(3);
  });

  it('keeps every item exactly once, in order, across partitions', () => {
    const items = Array.from({ length: 55 }, (_, index) => `id-${index}`);
    const parts = balancedProofPartitions(items, 24);
    expect(parts.length).toBe(3);
    expect(parts.flat()).toEqual(items);
    expect(new Set(parts.flat()).size).toBe(items.length);
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(24);
  });

  it('returns the original order in one pass when sharding is unnecessary', () => {
    const items = ['a', 'b', 'c'];
    expect(balancedProofPartitions(items, 24)).toEqual([['a', 'b', 'c']]);
  });

  it('measures row complexity from result texts', () => {
    expect(averageResultChars([])).toBe(0);
    expect(averageResultChars(['abcd', 'abcdef'])).toBe(5);
  });
});
