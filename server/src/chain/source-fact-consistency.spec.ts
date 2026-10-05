import { describe, expect, it } from 'vitest';
import { detectStructuredFactConflicts } from './source-fact-consistency';

describe('CTX-005 structured fact consistency', () => {
  it('blocks contradictory values only after the caller provides the same stable fact identity', () => {
    const conflicts = detectStructuredFactConflicts([
      { identity: 'deadline:permit', kind: 'duration_hours', value: 24, source: 'canon', certainty: 'explicit' },
      { identity: 'deadline:permit', kind: 'duration_hours', value: 72, source: 'chapter-plan', certainty: 'derived' },
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].ruleId).toBe('CTX-005');
  });

  it('does not invent a conflict for different fact identities or incompatible units', () => {
    expect(detectStructuredFactConflicts([
      { identity: 'inventory:a', kind: 'number', value: 3, unit: 'box', source: 'canon' },
      { identity: 'inventory:b', kind: 'number', value: 4, unit: 'box', source: 'plan' },
    ])).toEqual([]);
    expect(detectStructuredFactConflicts([
      { identity: 'inventory:a', kind: 'number', value: 3, unit: 'box', source: 'canon' },
      { identity: 'inventory:a', kind: 'number', value: 3, unit: 'item', source: 'plan' },
    ])).toEqual([]);
  });

  it('works for location/state without story-specific vocabulary', () => {
    expect(detectStructuredFactConflicts([
      { identity: 'character:lead:location', kind: 'location', value: 'A地', source: 'accepted-canon' },
      { identity: 'character:lead:location', kind: 'location', value: 'B地', source: 'chapter-plan' },
    ])).toHaveLength(1);
  });
});
