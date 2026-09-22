import { describe, expect, it } from 'vitest';
import {
  buildNarrativeBeatPlan,
  validateChapterEndingBoundary,
  validateForeshadowingBoundary,
} from './adaptive-narrative';

describe('adaptive narrative beat planning', () => {
  it('treats a four chapter ending as resolution instead of a new build arc', () => {
    const plan = buildNarrativeBeatPlan([
      { title: '失踪', function: 'opening', responsibility: '建立失踪事件' },
      { title: '反锁', function: 'development', responsibility: '调查高权限记录' },
      { title: '追问', function: 'development', responsibility: '继续核对证据来源' },
      { title: '归还', function: 'ending', responsibility: '完成接管并收束人物关系' },
    ]);
    expect(plan.map(item => item.beatRole)).toEqual(['setup', 'discovery', 'development', 'resolution']);
    expect(plan[2].beatRole).not.toBe('payoff');
    expect(plan[3]).toMatchObject({ isFinalChapter: true, beatRole: 'resolution' });
  });

  it.each([7, 11])('does not manufacture payoff chapters from a %i chapter count', total => {
    const plan = buildNarrativeBeatPlan(Array.from({ length: total }, (_, index) => ({
      title: `第${index + 1}章`,
      function: index === 0 ? 'opening' : index === total - 1 ? 'ending' : 'development',
      responsibility: index === total - 1 ? '完成目标并收束' : '推进当前事件',
    })));
    expect(plan.filter(item => item.beatRole === 'payoff')).toHaveLength(0);
    expect(plan.at(-1)?.beatRole).toBe('resolution');
  });

  it('uses an explicit story responsibility as a payoff without a fixed interval', () => {
    const plan = buildNarrativeBeatPlan([
      { function: 'opening', responsibility: '建立困境' },
      { function: 'climax', responsibility: '兑现前文证据并完成反转' },
      { function: 'development', responsibility: '承接反转的关系后果' },
      { function: 'development', responsibility: '推进新的调查' },
      { function: 'ending', responsibility: '收束故事' },
    ]);
    expect(plan[1].beatRole).toBe('payoff');
  });
});

describe('chapter boundary validation', () => {
  it('allows a final chapter to have no new foreshadowing and no next chapter hook', () => {
    expect(validateForeshadowingBoundary([], 4, 4)).toEqual([]);
    expect(validateChapterEndingBoundary('', 4, 4)).toEqual([]);
    expect(validateChapterEndingBoundary('雨停后，她终于推开自己的门。', 4, 4)).toEqual([]);
  });

  it('rejects unresolved final foreshadowing and impossible recovery chapters', () => {
    expect(validateForeshadowingBoundary([{ content: '新谜团', plannedRecoveryChapter: 5 }], 4, 4)[0]).toContain('终章');
    expect(validateForeshadowingBoundary([{ content: '线索', plannedRecoveryChapter: 2 }], 2, 4)[0]).toContain('晚于第2章');
    expect(validateForeshadowingBoundary([{ content: '线索', plannedRecoveryChapter: 6 }], 2, 4)[0]).toContain('不超过全书第4章');
  });

  it('requires a hook only while another planned chapter exists', () => {
    expect(validateChapterEndingBoundary('', 2, 4)).toEqual(['非终章缺少hook']);
    expect(validateChapterEndingBoundary('下一章他会返回', 4, 4)[0]).toContain('终章');
  });
});
