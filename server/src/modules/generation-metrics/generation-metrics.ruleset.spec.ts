import { describe, expect, it } from 'vitest';
import { generationRulesetSnapshotIsCurrent } from './generation-metrics.service';

describe('generation ruleset staleness', () => {
  const digest = 'a'.repeat(64);

  it('accepts only a snapshot from the same ruleset version and registry digest', () => {
    expect(generationRulesetSnapshotIsCurrent(JSON.stringify({ rulesetVersion: 77, registryDigest: digest }), 77, digest)).toBe(true);
    expect(generationRulesetSnapshotIsCurrent(JSON.stringify({ rulesetVersion: 76, registryDigest: digest }), 77, digest)).toBe(false);
    expect(generationRulesetSnapshotIsCurrent(JSON.stringify({ rulesetVersion: 77, registryDigest: 'b'.repeat(64) }), 77, digest)).toBe(false);
  });

  it('treats legacy, absent and malformed snapshots as stale', () => {
    expect(generationRulesetSnapshotIsCurrent(JSON.stringify({ modules: [] }), 77, digest)).toBe(false);
    expect(generationRulesetSnapshotIsCurrent('', 77, digest)).toBe(false);
    expect(generationRulesetSnapshotIsCurrent('{bad json', 77, digest)).toBe(false);
    expect(generationRulesetSnapshotIsCurrent(null, 77, digest)).toBe(false);
  });
});
