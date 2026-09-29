import { describe, expect, it, vi } from 'vitest';
import { ChainPlanningController } from './chain-planning.controller';
import { updateConstitution } from '../modules/project/creative-constitution';

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

const profile = {
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
};

const audit = {
  schemaVersion: 3,
  mode: 'single_recoverable_reader_experience_gate',
  generated: 7,
  qualified: 5,
  returned: 5,
  rejected: 2,
  reasons: ['弱题材'],
  candidateAssessments: [],
  acceptedEvidence: [],
};

const acceptedIdea = (index: number) => ({
  title: `通过${index}`,
  storyType: 'short_story',
  targetPlatform: 'fanqie',
  ideaAppealGate: { passed: true, distinctivenessScore: 8 - index },
  readerExperienceProfile: profile,
  ideaDiscoveryAudit: audit,
});

describe('ChainPlanningController single idea gate adapter', () => {
  it('does not oversample or rescreen ideas that already passed the recoverable discovery gate', async () => {
    const upstream = {
      success: true,
      ideas: Array.from({ length: 5 }, (_, index) => acceptedIdea(index)),
      totalIdeas: 5,
      appealGate: audit,
    };
    const ideaDiscover = vi.fn().mockResolvedValue(upstream);
    const controller = new ChainPlanningController({ ideaDiscover } as any);

    const result: any = await controller.ideaDiscover(dto as any);

    expect(ideaDiscover).toHaveBeenCalledTimes(1);
    expect(ideaDiscover).toHaveBeenCalledWith(expect.objectContaining({ count: 5 }));
    expect(result).toBe(upstream);
    expect(result.ideas).toHaveLength(5);
    expect(result.appealGate).toEqual(audit);
    expect(result.ideas[0].ideaDiscoveryAudit).toEqual(audit);
  });

  it('returns the orchestrator payload unchanged instead of becoming a second gate', async () => {
    const upstream = {
      success: true,
      ideas: [
        acceptedIdea(0),
        { title: '旧格式未验收题材' },
        { title: '明确未通过题材', ideaAppealGate: { passed: false, distinctivenessScore: 9 } },
      ],
      totalIdeas: 3,
      appealGate: { ...audit, qualified: 1, returned: 1 },
    };
    const ideaDiscover = vi.fn().mockResolvedValue(upstream);
    const controller = new ChainPlanningController({ ideaDiscover } as any);

    const result: any = await controller.ideaDiscover({ ...dto, count: 3 } as any);

    expect(ideaDiscover).toHaveBeenCalledTimes(1);
    expect(result).toBe(upstream);
    expect(result.ideas.map((idea: any) => idea.title)).toEqual(['通过0', '旧格式未验收题材', '明确未通过题材']);
  });

  it('passes through the inner generic failure instead of exposing internal rejection rules', async () => {
    const upstream = {
      success: false,
      ideas: [],
      totalIdeas: 0,
      error: '本轮候选均未达到展示标准，系统已按失败原因自动补生一次；未通过内容不会展示，请重新发现。',
      appealGate: { ...audit, qualified: 0, returned: 0, rejected: 7 },
    };
    const ideaDiscover = vi.fn().mockResolvedValue(upstream);
    const controller = new ChainPlanningController({ ideaDiscover } as any);

    const result: any = await controller.ideaDiscover({ ...dto, count: 5 } as any);

    expect(result).toBe(upstream);
    expect(result.success).toBe(false);
    expect(result.ideas).toEqual([]);
    expect(result.error).not.toContain('点击/留存前置 Gate');
    expect(result.appealGate).toEqual(expect.objectContaining({ returned: 0 }));
  });

  it('returns confirmed story, experience profile and discovery audit through the recovery payload consumed by latest.json', async () => {
    const constitution: any = updateConstitution({}, {
      type: 'short_story',
      targetPlatform: 'fanqie',
      category: '男频·悬疑脑洞',
      pov: '第一人称',
    });
    constitution.confirmedStory = {
      title: '遗嘱写着我家的门牌号',
      hook: '父亲葬礼后，我在遗嘱里看见自家门牌号。',
      coreConflict: '守住母亲和房子并查清债务真相',
      mainReversal: '父亲其实替同事承担了被公司转嫁的责任',
      readerExperienceProfile: profile,
      ideaDiscoveryAudit: audit,
    };
    const projectRow = { settings: JSON.stringify({ creativeConstitution: constitution }) };
    const getGenerationRecovery = vi.fn().mockResolvedValue({ projectId: 'p1', status: 'creating' });
    const database = {
      getDb: () => ({ prepare: () => ({ get: () => projectRow }) }),
    };
    const controller = new ChainPlanningController(
      { getGenerationRecovery } as any,
      database as any,
    );

    const result: any = await controller.getGenerationRecovery('p1');
    expect(result.diagnosticSchemaVersion).toBe(2);
    expect(result.readerExperienceProfilePresent).toBe(true);
    expect(result.ideaDiscoveryAuditPresent).toBe(true);
    expect(result.storySelection).toEqual(expect.objectContaining({
      title: '遗嘱写着我家的门牌号',
      readerExperienceProfile: expect.objectContaining({
        densityMode: '短篇集中兑现',
        pace: '偏快但保留呼吸段',
      }),
      ideaDiscoveryAudit: expect.objectContaining({ generated: 7, qualified: 5, returned: 5, rejected: 2 }),
    }));
  });

  it('persists the latest idea batch before any project exists so local verification can diagnose discovery failure', async () => {
    const ideaDiscover = vi.fn().mockResolvedValue({
      success: false,
      ideas: [],
      totalIdeas: 0,
      error: '本轮候选均未达到展示标准，系统已按失败原因自动补生一次；未通过内容不会展示，请重新发现。',
      appealGate: { ...audit, qualified: 0, returned: 0, rejected: 7 },
    });
    const dualWrite = vi.fn().mockResolvedValue(undefined);
    const controller = new ChainPlanningController(
      { ideaDiscover } as any,
      { dualWrite } as any,
    );

    const result: any = await controller.ideaDiscover({ ...dto, count: 5 } as any);

    expect(result.success).toBe(false);
    expect(dualWrite).toHaveBeenCalledTimes(1);
    expect(dualWrite).toHaveBeenCalledWith(
      'latest_idea_discovery_audit',
      expect.objectContaining({
        schemaVersion: 1,
        success: false,
        totalIdeas: 0,
        request: expect.objectContaining({ storyType: 'short_story', platform: 'fanqie', requestedCount: 5 }),
        appealGate: expect.objectContaining({ mode: 'single_recoverable_reader_experience_gate', returned: 0 }),
      }),
    );
  });

  it('exposes the persisted pre-project idea audit for verify-local without requiring a project id', () => {
    const persisted = {
      schemaVersion: 1,
      generatedAt: '2026-09-29T09:00:00.000Z',
      success: false,
      totalIdeas: 0,
      appealGate: { ...audit, qualified: 0, returned: 0, rejected: 7 },
    };
    const database = {
      getDb: () => ({
        prepare: (sql: string) => ({
          get: (...args: any[]) => {
            if (sql.includes('sqlite_master')) return { name: 'dual_write_store' };
            if (sql.includes('dual_write_store')) {
              expect(args[0]).toBe('latest_idea_discovery_audit');
              return { data_value: JSON.stringify(persisted), updated_at: '2026-09-29T09:00:01.000Z' };
            }
            return undefined;
          },
        }),
      }),
    };
    const controller = new ChainPlanningController({} as any, database as any);

    const result: any = controller.getLatestIdeaDiscoveryDiagnostics();

    expect(result.available).toBe(true);
    expect(result.updatedAt).toBe('2026-09-29T09:00:01.000Z');
    expect(result.audit).toEqual(expect.objectContaining({ success: false, totalIdeas: 0 }));
    expect(result.audit.appealGate).toEqual(expect.objectContaining({ returned: 0, rejected: 7 }));
  });

});
