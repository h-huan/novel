import { describe, expect, it } from 'vitest';
import { defaultRepairStrategy } from './repair-strategy-registry';

describe('repair strategy selection', () => {
  it.each([
    'constitution.context',
    'constitution.logic',
    'constitution.world_rules',
    'constitution.timeline',
    'timeline.repetition',
  ])('uses a structure-aware repair for %s', rule => {
    expect(defaultRepairStrategy([rule])).toBe('scene_structure_patch');
  });

  it('keeps character and platform-specific executors ahead of the generic fallback', () => {
    expect(defaultRepairStrategy(['character_voice.forbiddenVocabulary'])).toBe('character_voice_contract_patch');
    expect(defaultRepairStrategy(['platform.paragraph_length'])).toBe('platform_metric_patch');
    expect(defaultRepairStrategy(['punctuation.spacing'])).toBe('unique_local_replacement');
  });
});
