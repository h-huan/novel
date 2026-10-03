import { describe, expect, it, vi } from 'vitest';
import { readConstitution } from '../project/creative-constitution';
import { GeneratedCanonGuardService } from './generated-canon-guard.service';

describe('GeneratedCanonGuardService', () => {
  const projectRow = {
    id: 'project-1',
    type: 'long_novel',
    status: 'active',
    target_words: 120000,
    target_platform: 'fanqie',
    writing_style: JSON.stringify(['白描']),
    settings: JSON.stringify({
      creativeConstitution: {
        schemaVersion: 1,
        revision: 1,
        projectType: 'long_novel',
        targetPlatform: 'fanqie',
        targetWords: 120000,
        platformRules: {},
        category: '悬疑',
        storyTone: ['紧张'],
        writingStyle: ['白描'],
        webNovelGenre: ['悬疑'],
        submissionTags: ['悬疑'],
        plotTags: ['调查'],
        genreFitNote: '与悬疑分类和调查主线一致',
        pov: '第三人称',
        targetAudience: '',
        confirmedStory: { title: '旧站', hook: '消失的站台' },
        chapterWordRange: { min: 3000, max: 5000 },
      },
    }),
  };

  const passedRun = {
    id: 'run-1',
    project_id: 'project-1',
    stage: 'world',
    scenario: 'world_building',
    status: 'success',
    gate_status: 'passed',
    output_text: '{"world":"ok"}',
    constitution_json: JSON.stringify(readConstitution(projectRow as any)),
  };

  const createSubject = (row: any = passedRun, current = true, project: any = projectRow) => {
    const prepare = vi.fn().mockImplementation((sql: string) => ({
      get: vi.fn().mockReturnValue(sql.includes('FROM generation_runs') ? row : project),
    }));
    const databaseService = { getDb: vi.fn().mockReturnValue({ prepare }) } as any;
    const generationMetrics = { runIsCurrent: vi.fn().mockReturnValue(current) } as any;
    return {
      service: new GeneratedCanonGuardService(databaseService, generationMetrics),
      generationMetrics,
    };
  };

  it('accepts chapter-like exact text only from a passed current project run', () => {
    const { service, generationMetrics } = createSubject();
    expect(service.assertCanCommit({
      projectId: 'project-1',
      runId: 'run-1',
      outputText: '{"world":"ok"}',
      expectedStages: ['world'],
      expectedScenarios: ['world_building'],
    })).toEqual({
      runId: 'run-1',
      projectId: 'project-1',
      stage: 'world',
      scenario: 'world_building',
      outputText: '{"world":"ok"}',
    });
    expect(generationMetrics.runIsCurrent).toHaveBeenCalledWith('run-1', 'project-1');
  });

  it('accepts structured provenance from a successful current deferred-Gate run', () => {
    const { service, generationMetrics } = createSubject({ ...passedRun, gate_status: 'not_evaluated' });
    expect(service.assertStructuredCanCommit({
      projectId: 'project-1',
      runId: 'run-1',
      expectedStages: ['world'],
      expectedScenarios: ['world_building'],
    })).toEqual(expect.objectContaining({ runId: 'run-1', projectId: 'project-1' }));
    expect(generationMetrics.runIsCurrent).toHaveBeenCalledWith('run-1', 'project-1');
  });

  it('keeps same-constitution structured runs valid while their own creation batch changes dependency context', () => {
    const creatingProject = { ...projectRow, status: 'creating' };
    const sameConstitutionRun = {
      ...passedRun,
      gate_status: 'not_evaluated',
      constitution_json: JSON.stringify(readConstitution(creatingProject as any)),
    };
    const { service } = createSubject(sameConstitutionRun, false, creatingProject);
    expect(service.assertStructuredCanCommit({
      projectId: 'project-1',
      runId: 'run-1',
      expectedStages: ['world'],
      expectedScenarios: ['world_building'],
    })).toEqual(expect.objectContaining({ runId: 'run-1' }));
  });

  it('still rejects a creating-batch run when the Creative Constitution changed', () => {
    const creatingProject = {
      ...projectRow,
      status: 'creating',
      settings: JSON.stringify({
        creativeConstitution: {
          ...(JSON.parse(projectRow.settings) as any).creativeConstitution,
          revision: 2,
          pov: '第一人称',
        },
      }),
    };
    const { service } = createSubject({ ...passedRun, gate_status: 'not_evaluated' }, false, creatingProject);
    expect(() => service.assertStructuredCanCommit({ projectId: 'project-1', runId: 'run-1' })).toThrow('凭证已过期');
  });

  it('rejects a missing generation-run credential on both boundaries', () => {
    const { service } = createSubject();
    expect(() => service.assertCanCommit({ projectId: 'project-1', outputText: '{"world":"ok"}' })).toThrow('缺少 generation run 凭证');
    expect(() => service.assertStructuredCanCommit({ projectId: 'project-1' })).toThrow('缺少 generation run 凭证');
  });

  it('never treats success without an explicit Gate PASS as chapter-ready', () => {
    const { service } = createSubject({ ...passedRun, gate_status: 'not_evaluated' });
    expect(() => service.assertCanCommit({
      projectId: 'project-1', runId: 'run-1', outputText: '{"world":"ok"}',
    })).toThrow('必须来自已通过质量 Gate 的运行');
  });

  it('rejects structured provenance when the generation itself failed', () => {
    const { service } = createSubject({ ...passedRun, status: 'failed', gate_status: 'not_evaluated' });
    expect(() => service.assertStructuredCanCommit({ projectId: 'project-1', runId: 'run-1' })).toThrow('未成功完成');
  });

  it('rejects exact text that differs from the output that passed Gate', () => {
    const { service } = createSubject();
    expect(() => service.assertCanCommit({
      projectId: 'project-1', runId: 'run-1', outputText: '{"world":"changed-after-review"}',
    })).toThrow('与通过 Gate 的最终输出不一致');
  });

  it('rejects stale active-project runs on both boundaries', () => {
    const { service } = createSubject(passedRun, false, { ...projectRow, status: 'active' });
    expect(() => service.assertCanCommit({
      projectId: 'project-1', runId: 'run-1', outputText: '{"world":"ok"}',
    })).toThrow('凭证已过期');
    expect(() => service.assertStructuredCanCommit({ projectId: 'project-1', runId: 'run-1' })).toThrow('凭证已过期');
  });

  it('rejects a run from the wrong structural stage', () => {
    const { service } = createSubject({ ...passedRun, stage: 'chapter' });
    expect(() => service.assertStructuredCanCommit({
      projectId: 'project-1', runId: 'run-1', expectedStages: ['world'],
    })).toThrow('阶段不匹配');
  });
});
