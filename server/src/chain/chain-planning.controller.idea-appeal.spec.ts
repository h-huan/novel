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

const assessment = (passed: boolean, issues: string[] = []) => ({
  passed,
  issues,
  warnings: passed ? ['刀点需要先建立人物关系再兑现'] : [],
  readerExperienceProfile: {
    version: 1,
    storyType: 'short_story',
    densityMode: '短篇集中兑现',
    pace: '偏快但保留呼吸段',
    evidence: {
      lifeAnchor: true,
      aspiration: true,
      socialFriction: true,
      struggleAgency: true,
      painPotential: true,
      catharsisPotential: true,
      sustainedSuspense: true,
      emotionalContrastGroups: 3,
      stackingRisk: false,
    },
  },
});

describe('ChainPlanningController idea appeal adapter', () => {
  it('oversamples once, filters locally and exposes adaptive experience evidence', async () => {
    const ideaDiscover = vi.fn().mockResolvedValue({ success: true, ideas: Array.from({ length: 8 }, (_, i) => ({ title: `候选${i}` })) });
    const select = vi.fn().mockReturnValue({
      accepted: Array.from({ length: 5 }, (_, i) => ({ title: `通过${i}`, readerExperienceProfile: assessment(true).readerExperienceProfile })),
      assessed: Array.from({ length: 8 }, (_, i) => ({ idea: { title: `候选${i}` }, assessment: assessment(i < 5, i < 5 ? [] : ['弱题材']) })),
    });
    const controller = new ChainPlanningController({ ideaDiscover } as any, { select } as any);

    const result: any = await controller.ideaDiscover(dto as any);
    expect(ideaDiscover).toHaveBeenCalledTimes(1);
    expect(ideaDiscover).toHaveBeenCalledWith(expect.objectContaining({ count: 8 }));
    expect(select).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledWith(expect.any(Array), 'short_story', 5);
    expect(result.ideas).toHaveLength(5);
    expect(result.appealGate).toEqual(expect.objectContaining({
      schemaVersion: 2,
      mode: 'adaptive_reader_experience',
      generated: 8,
      passed: 5,
      rejected: 3,
    }));
    expect(result.appealGate.acceptedEvidence[0]).toEqual(expect.objectContaining({
      densityMode: '短篇集中兑现',
      pace: '偏快但保留呼吸段',
    }));
    expect(JSON.stringify(result.appealGate)).not.toMatch(/\d+%/);
  });

  it('returns no weak placeholders when every generated premise fails the appeal gate', async () => {
    const ideaDiscover = vi.fn().mockResolvedValue({ success: true, ideas: [{ title: '弱题材' }] });
    const select = vi.fn().mockReturnValue({
      accepted: [],
      assessed: [{ idea: { title: '弱题材' }, assessment: assessment(false, ['钩子缺少具体代价、时限或失去风险']) }],
    });
    const controller = new ChainPlanningController({ ideaDiscover } as any, { select } as any);

    const result: any = await controller.ideaDiscover({ ...dto, count: 1 } as any);
    expect(ideaDiscover).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.ideas).toEqual([]);
    expect(result.error).toContain('点击/留存前置 Gate');
  });
});
