import { describe, expect, it } from 'vitest';
import { defaultRepairStrategy, repairPrompt, executeRepair } from './repair-strategy-registry';

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

describe('scene patch boundaries', () => {
  it('allows a bounded multi-paragraph replacement without treating blank lines as scene cuts', () => {
    const original='他把名单递过去。\n\n她看了一眼，没签。';
    const content='前面的事件不变。'.repeat(80)+original+'后面的事件不变。'.repeat(80);
    expect(executeRepair('scene_structure_patch',{content,issues:[]},[{original,replacement:'他递出名单，她核对后拒签。'}])).toContain('她核对后拒签。');
  });
  it.each(['***','---','———'])('rejects a replacement crossing explicit %s boundary', (cut) => {
    const original='他把名单递过去。\n'+cut+'\n她看了一眼，没签。';
    const content='其他事件。'.repeat(80)+original;
    expect(()=>executeRepair('scene_structure_patch',{content,issues:[]},[{original,replacement:'改写。'}])).toThrow('场景边界');
  });
  it('preserves ASCII dialogue against platform removal', () => {
    const content='其他叙述。'.repeat(80)+'"不能签。"';
    expect(()=>executeRepair('platform_metric_patch',{content,issues:[]},[{original:'"不能签。"',replacement:'她没签。'}])).toThrow('移除全部对白');
  });
});

it('gives the model the exact executor budget for this draft', () => {
  const prompt=repairPrompt('platform_metric_patch','正文。'.repeat(100));
  expect(prompt).toContain('300字符');
  expect(prompt).toContain('最多60字符');
  expect(prompt).toContain('较大值计费');
  expect(prompt).toContain('相邻空行');
});
