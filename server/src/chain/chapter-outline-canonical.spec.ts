import { describe, expect, it } from 'vitest';
import { canonicalizeChapterOutline } from './chapter-outline-canonical';

const plan = {
  scenes: [
    { location: '值班室', goal: '抽页', conflict: '老周随时回来', outcome: '三页到手' },
    { location: '宿舍', goal: '试听', conflict: '每听一次丢一段', outcome: '三次听完' },
  ],
  characterActions: [
    { character: '我', action: '抽出三页', result: '三页到了我身上' },
    { character: '老周', action: '去民警室', result: '值班室空出来' },
  ],
  conflicts: [
    { name: '听一次丢一段', trigger: '戴上耳机', escalation: '又听两次', resolution: '三次后不再听' },
  ],
  highlights: [
    { type: '开篇钩子', point: '谁让你看见', trigger: '塞进右耳' },
  ],
  hook: '我站在门口敲门。',
  emotionalTone: '冷、湿、压着。',
};

describe('canonicalizeChapterOutline', () => {
  it('removes duplicated structured sections from content and projects derived fields', () => {
    const content = [
      '核心内容：1) 抽三页；2) 回宿舍试听三次；3) 比对签字。',
      '主要场景：值班室 → 宿舍',
      '人物行动：{"character":"我","action":"抽出三页","result":"三页到了我身上"}',
      '冲突设计：听一次丢一段',
      '爽点设置：谁让你看见',
      '结尾设置：我站在门口敲门。',
      '情绪基调：冷。',
    ].join('\n');
    const result = canonicalizeChapterOutline({
      content,
      scenes: JSON.stringify(plan),
      chapter_function: 'conflict',
    });
    expect(result.conflicts).toEqual([]);
    expect(result.content).toBe('核心内容：1) 抽三页；2) 回宿舍试听三次；3) 比对签字。');
    expect(result.changes.length).toBeGreaterThanOrEqual(4);
    expect(result.derived.location_summary).toBe('值班室 → 宿舍');
    expect(result.derived.ending_setup).toBe(plan.hook);
    expect(result.derived.conflict_design).toContain('听一次丢一段');
    expect(result.derived.chapter_type).toBe('conflict');
  });

  it('keeps a section when the structured field is missing instead of dropping content', () => {
    const result = canonicalizeChapterOutline({
      content: '核心内容：只做一件事。\n人物行动：我→走→到了。',
      scenes: JSON.stringify({ scenes: [{ location: '走廊' }] }),
      chapter_function: 'opening',
    });
    expect(result.conflicts).toEqual([]);
    expect(result.content).toContain('人物行动：我→走→到了。');
    expect(result.derived.location_summary).toBe('走廊');
  });

  it('blocks when scenes cannot be parsed', () => {
    const result = canonicalizeChapterOutline({ content: '核心内容：x', scenes: 'not json' });
    expect(result.conflicts.length).toBe(1);
    expect(result.conflicts[0].field).toBe('scenes');
    expect(result.changed).toBe(false);
  });

  it('is idempotent once content is canonical', () => {
    const first = canonicalizeChapterOutline({
      content: '核心内容：1) 抽三页；2) 试听。\n人物行动：旧 JSON',
      scenes: JSON.stringify(plan),
      chapter_function: 'conflict',
    });
    const second = canonicalizeChapterOutline({
      content: first.content,
      scenes: first.scenes,
      chapter_function: 'conflict',
      ...first.derived,
      canonical_hash: first.canonicalHash,
    });
    expect(second.changes).toEqual([]);
    expect(second.content).toBe(first.content);
    expect(second.changed).toBe(false);
  });
});
