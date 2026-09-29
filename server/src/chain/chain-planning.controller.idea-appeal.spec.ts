import { describe, expect, it, vi } from 'vitest';
import { ChainPlanningController } from './chain-planning.controller';

const dto = {
  storyType: 'short_story' as const,
  platform: 'fanqie',
  storyCategory: '悬疑',
  storyTone: ['紧张'],
  writingStyle: ['简洁'],
  webNovelGenre: ['悬疑推理'],
  submissionTags: ['悬疑'],
  plotTags: ['调查'],
  genreFitNote: '悬疑分类与调查标签直接匹配',
  pov: '第一人称',
};

describe('ChainPlanningController idea appeal adapter', () => {
  it('oversamples in the same discovery call instead of starting an extra model retry loop', async () => {
    const ideaDiscover = vi.fn().mockResolvedValue({ success: true, ideas: Array.from({ length: 8 }, (_, i) => ({ title: `候选${i}` })) });
    const select = vi.fn().mockReturnValue({
      accepted: Array.from({ length: 5 }, (_, i) => ({ title: `通过${i}` })),
      assessed: Array.from({ length: 8 }, (_, i) => ({ idea: { title: `候选${i}` }, assessment: { passed: i < 5, issues: i < 5 ? [] : ['弱题材'] } })),
    });
    const controller = new ChainPlanningController({ ideaDiscover } as any, { select } as any);

    const result: any = await controller.ideaDiscover(dto as any);
    expect(ideaDiscover).toHaveBeenCalledTimes(1);
    expect(ideaDiscover).toHaveBeenCalledWith(expect.objectContaining({ count: 8 }));
    expect(select).toHaveBeenCalledTimes(1);
    expect(result.ideas).toHaveLength(5);
    expect(result.appealGate).toEqual(expect.objectContaining({ generated: 8, passed: 5, rejected: 3 }));
  });

  it('returns no weak placeholders when every generated premise fails the appeal gate', async () => {
    const ideaDiscover = vi.fn().mockResolvedValue({ success: true, ideas: [{ title: '弱题材' }] });
    const select = vi.fn().mockReturnValue({
      accepted: [],
      assessed: [{ idea: { title: '弱题材' }, assessment: { passed: false, issues: ['钩子缺少具体代价、时限或失去风险'] } }],
    });
    const controller = new ChainPlanningController({ ideaDiscover } as any, { select } as any);

    const result: any = await controller.ideaDiscover({ ...dto, count: 1 } as any);
    expect(ideaDiscover).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.ideas).toEqual([]);
    expect(result.error).toContain('点击/留存前置 Gate');
  });
});
