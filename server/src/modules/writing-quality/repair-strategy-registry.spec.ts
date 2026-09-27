import { describe, expect, it } from 'vitest';
import { defaultRepairStrategy, repairPrompt } from './repair-strategy-registry';

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

  it('requires hardline local repair to clear selected rules and whole-chapter density within budget', () => {
    const prompt = repairPrompt('hardline_local_replacement');
    expect(prompt).toContain('本轮列出的每条命中规则');
    expect(prompt).toContain('严格减少该规则的命中窗');
    expect(prompt).toContain('最终全部硬红线清零前质量门绝不保存');
    expect(prompt).toContain('明确输出空 patches');
    expect(prompt).not.toContain('挑最有价值的缺陷下刀');
  });
});
