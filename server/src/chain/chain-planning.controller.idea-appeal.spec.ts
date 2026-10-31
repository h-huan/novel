import { describe, expect, it, vi } from 'vitest';
import { ChainPlanningController } from './chain-planning.controller';
import { updateConstitution } from '../modules/project/creative-constitution';
import { GateRejectionError, classifyGateFailure } from '../modules/writing-quality/gate-failure';

it('returns the upstream outline review report and HTTP status instead of a generic server error', async () => {
  const report = classifyGateFailure({ evaluationStatus: 'not_evaluated', topic: 'quality_gate', gateStatus: 'not_evaluated', missing: ['platform：评审引文无法核对'] });
  const controller = new ChainPlanningController({ generateOutline: vi.fn().mockRejectedValue(new GateRejectionError(report)) } as any);
  let error: any;
  try { await controller.generateOutline({ projectId: 'p' }); } catch (value) { error = value; }
  expect(error.getStatus()).toBe(503);
  expect(error.getResponse()).toEqual({ message: report.message, error: 'QualityGateRejected', gateReport: report });
});

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

const preselectedPremises = Array.from({ length: 5 }, (_, index) => ({
  premiseId: `P${index + 1}`,
  workingTitle: `胚子${index + 1}`,
  protagonistSituation: '普通人的具体生活处境与明确愿望',
  openingEvent: '迫使主角行动的具体起始事件',
  coreConflict: '主角目标与现实阻力持续对撞',
  activeChoice: '主角必须亲自做出关键选择',
  escalation: '选择带来连续升级与不可逆后果',
  reversalEffect: '反转改变目标关系或代价',
  payoff: '中后段兑现主要阅读承诺',
  irreplaceableCarrier: '职业关系与冲突彼此绑定不可替换',
  secondOrderConsequence: '额外受益受损者迫使关系与目标改变',
  readerQuestion: '主角最终如何承担这个选择的后果',
  differentiation: '与历史题材的核心机制和关系结构不同',
}));

const audit = {
  schemaVersion: 7,
  mode: 'premise_preselection_then_final_gate_bounded_repair',
  structuringProtocol: 'one_selected_premise_per_call_server_owned_identity',
  repairProtocol: 'ordered_local_patch_server_owned_identity',
  premisePoolSize: 15,
  premiseSelected: 5,
  generated: 5,
  qualified: 5,
  returned: 5,
  rejected: 0,
  reasons: [],
  preselectedPremises,
  candidateAssessments: [],
  acceptedEvidence: [],
};

const finalGateFailure = '创建前筛选已完成，但完整题材卡最终验收没有任何一项通过；系统已停止展示，不会通过增加补生次数或另换题材掩盖。请重新发现。';

const acceptedIdea = (index: number) => ({
  sourcePremiseId: `P${index + 1}`,
  title: `通过${index}`,
  hook: `钩子${index}`,
  description: `描述${index}`,
  coreConflict: `冲突${index}`,
  storyType: 'short_story',
  targetPlatform: 'fanqie',
  ideaAppealGate: { passed: true, distinctivenessScore: 8 - index },
  readerExperienceProfile: profile,
  ideaDiscoveryAudit: audit,
});

describe('ChainPlanningController discovery cancellation identity', () => {
  it('preserves the exact renderer request ID for model execution and diagnostics', async () => {
    const clientId = '2c6275cc-b11d-4c0d-bbe5-1d5015bca639';
    const ideaDiscover = vi.fn().mockResolvedValue({ success: false, ideas: [], error: '模拟终止' });
    const dualWrite = vi.fn().mockResolvedValue(undefined);
    const controller = new ChainPlanningController({ ideaDiscover } as any, { dualWrite } as any);
    await controller.ideaDiscover({ ...dto, count: 5, discoveryRequestId: clientId } as any);
    expect(ideaDiscover).toHaveBeenCalledWith(expect.objectContaining({ discoveryRequestId: clientId, count: 5 }));
    expect(dualWrite).toHaveBeenCalledWith('latest_idea_discovery_audit',
      expect.objectContaining({ discoveryRequestId: clientId }));
  });

  it('creates a safe server ID only when legacy input has no valid request ID', async () => {
    const ideaDiscover = vi.fn().mockResolvedValue({ success: false, ideas: [] });
    const controller = new ChainPlanningController({ ideaDiscover } as any);
    await controller.ideaDiscover({ ...dto, discoveryRequestId: '../wrong/request', count: 5 } as any);
    const actual = ideaDiscover.mock.calls[0][0].discoveryRequestId;
    expect(actual).toMatch(/^[0-9a-f-]{36}$/i);
    expect(actual).not.toBe('../wrong/request');
  });
});

describe('ChainPlanningController idea-discovery transport adapter', () => {
  it('does not oversample or rescreen a complete batch already accepted by the final gate', async () => {
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

  it('retains a partial final-gate batch without starting another selection or failing accepted cards', async () => {
    const upstream = {
      success: true,
      ideas: Array.from({ length: 4 }, (_, index) => acceptedIdea(index)),
      totalIdeas: 4,
      qualityWarning: '创建前已筛选 5 个题材，最终 Gate 通过 4 个；缺少 1 个',
      appealGate: { ...audit, requested: 5, generated: 5, qualified: 4, returned: 4, shortfall: 1, rejected: 1 },
    };
    const ideaDiscover = vi.fn().mockResolvedValue(upstream);
    let persisted: any;
    const database = {
      dualWrite: vi.fn(async (_key: string, value: any) => { persisted = value; }),
      getDb: () => ({ prepare: (sql: string) => ({ get: () => sql.includes('sqlite_master')
        ? { name: 'dual_write_store' }
        : { data_value: JSON.stringify(persisted), updated_at: '2026-10-06' } }) }),
    };
    const controller = new ChainPlanningController({ ideaDiscover } as any, database as any);

    const result: any = await controller.ideaDiscover({ ...dto, count: 5 } as any);

    expect(ideaDiscover).toHaveBeenCalledTimes(1);
    expect(result).toBe(upstream);
    expect(result.success).toBe(true);
    expect(result.ideas).toHaveLength(4);
    expect(result.qualityWarning).toContain('缺少 1 个');
    expect(result.error).toBeUndefined();
    const diagnostics: any = controller.getLatestIdeaDiscoveryDiagnostics();
    expect(diagnostics.audit.success).toBe(true);
    expect(diagnostics.audit.acceptedIdeas).toHaveLength(4);
    expect(diagnostics.audit.appealGate).toEqual(upstream.appealGate);
    expect(diagnostics.audit.request.requestedCount).toBe(5);
    expect(diagnostics.audit.qualityWarning).toBe(upstream.qualityWarning);
  });

  it('returns the orchestrator payload unchanged instead of becoming a second quality gate when cardinality is already complete', async () => {
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

  it('passes through a zero-result final-gate pipeline failure without triggering another selection layer', async () => {
    const upstream = {
      success: false,
      ideas: [],
      totalIdeas: 0,
      error: finalGateFailure,
      appealGate: { ...audit, qualified: 0, returned: 0, rejected: 5 },
    };
    const ideaDiscover = vi.fn().mockResolvedValue(upstream);
    const controller = new ChainPlanningController({ ideaDiscover } as any);

    const result: any = await controller.ideaDiscover({ ...dto, count: 5 } as any);

    expect(result).toBe(upstream);
    expect(result.success).toBe(false);
    expect(result.ideas).toEqual([]);
    expect(result.error).toContain('不会通过增加补生次数或另换题材掩盖');
    expect(result.appealGate).toEqual(expect.objectContaining({
      mode: 'premise_preselection_then_final_gate_bounded_repair',
      premiseSelected: 5,
      returned: 0,
    }));
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
      ideaDiscoveryAudit: expect.objectContaining({
        mode: 'premise_preselection_then_final_gate_bounded_repair',
        premisePoolSize: 15,
        premiseSelected: 5,
        generated: 5,
        qualified: 5,
        returned: 5,
      }),
    }));
  });

  it('persists the latest idea batch before any project exists so local verification can diagnose final-gate failure', async () => {
    const ideaDiscover = vi.fn().mockResolvedValue({
      success: false,
      ideas: [],
      totalIdeas: 0,
      error: finalGateFailure,
      appealGate: { ...audit, qualified: 0, returned: 0, rejected: 5 },
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
        request: expect.objectContaining({ storyType: 'short_story', platform: 'fanqie', requestedCount: 5,
          webNovelGenre: dto.webNovelGenre, plotTags: dto.plotTags, writingStyle: dto.writingStyle, pov: dto.pov }),
        appealGate: expect.objectContaining({
          mode: 'premise_preselection_then_final_gate_bounded_repair',
          premisePoolSize: 15,
          premiseSelected: 5,
          returned: 0,
        }),
      }),
    );
  });

  it('exposes the persisted pre-project idea audit for verify-local without requiring a project id', () => {
    const persisted = {
      schemaVersion: 1,
      generatedAt: '2026-09-30T01:00:00.000Z',
      success: false,
      totalIdeas: 0,
      appealGate: { ...audit, qualified: 0, returned: 0, rejected: 5 },
    };
    const database = {
      getDb: () => ({
        prepare: (sql: string) => ({
          get: (...args: any[]) => {
            if (sql.includes('sqlite_master')) return { name: 'dual_write_store' };
            if (sql.includes('dual_write_store')) {
              expect(args[0]).toBe('latest_idea_discovery_audit');
              return { data_value: JSON.stringify(persisted), updated_at: '2026-09-30T01:00:01.000Z' };
            }
            return undefined;
          },
        }),
      }),
    };
    const controller = new ChainPlanningController({} as any, database as any);

    const result: any = controller.getLatestIdeaDiscoveryDiagnostics();

    expect(result.available).toBe(true);
    expect(result.updatedAt).toBe('2026-09-30T01:00:01.000Z');
    expect(result.audit).toEqual(expect.objectContaining({ success: false, totalIdeas: 0 }));
    expect(result.audit.appealGate).toEqual(expect.objectContaining({
      mode: 'premise_preselection_then_final_gate_bounded_repair',
      returned: 0,
      rejected: 5,
    }));
  });
});

it('keeps the current response and audit without persisting cross-batch recovery cards',async()=>{
 const db={dualWrite:vi.fn().mockResolvedValue(undefined)};
 const result={success:false,status:'incomplete',ideas:[],qualifiedIdeas:[{title:'本批合格卡',ideaAppealGate:{passed:true}}]};
 const c=new ChainPlanningController({ideaDiscover:vi.fn().mockResolvedValue(result)} as any,db as any);
 expect(await c.ideaDiscover({...dto,count:5} as any)).toBe(result);
 expect(db.dualWrite.mock.calls.map(call=>call[0])).toEqual(['latest_idea_discovery_audit']);
});

it('persists a timestamped, redacted failed audit before rethrowing an orchestration exception', async () => {
  const failure = Object.assign(new Error('Authorization: Bearer secret-token'), {
    appealGate: { stopReason: 'candidate_pool_below_minimum', note: 'token=hidden-token' },
  });
  const ideaDiscover = vi.fn().mockRejectedValue(failure);
  const dualWrite = vi.fn().mockResolvedValue(undefined);
  const controller = new ChainPlanningController({ ideaDiscover } as any, { dualWrite } as any);

  await expect(controller.ideaDiscover({ ...dto, count: 2 } as any)).rejects.toBe(failure);
  expect(dualWrite).toHaveBeenCalledTimes(1);
  const stored = dualWrite.mock.calls[0][1] as any;
  expect(stored.discoveryRequestId).toEqual(expect.any(String));
  expect(Date.parse(stored.startedAt)).toBeLessThanOrEqual(Date.parse(stored.finishedAt));
  expect(stored.success).toBe(false);
  expect(stored.totalIdeas).toBe(0);
  expect(stored.error).not.toContain('secret-token');
  expect(JSON.stringify(stored.appealGate)).not.toContain('hidden-token');
});
