import { describe, expect, it, vi } from 'vitest';
import { GeneratedCanonGuardService } from './generated-canon-guard.service';

describe('GeneratedCanonGuardService', () => {
  const passedRun = {
    id: 'run-1',
    project_id: 'project-1',
    stage: 'world',
    scenario: 'world_building',
    status: 'success',
    gate_status: 'passed',
    output_text: '{"world":"ok"}',
  };

  const createSubject = (row: any = passedRun, current = true) => {
    const get = vi.fn().mockReturnValue(row);
    const prepare = vi.fn().mockReturnValue({ get });
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
    })).toEqual({
      runId: 'run-1',
      projectId: 'project-1',
      stage: 'world',
      scenario: 'world_building',
      outputText: '{"world":"ok"}',
    });
    expect(generationMetrics.runIsCurrent).toHaveBeenCalledWith('run-1', 'project-1');
  });

  it('rejects a missing generation-run credential on both boundaries', () => {
    const { service } = createSubject();
    expect(() => service.assertCanCommit({
      projectId: 'project-1',
      outputText: '{"world":"ok"}',
    })).toThrow('缺少 generation run 凭证');
    expect(() => service.assertStructuredCanCommit({
      projectId: 'project-1',
    })).toThrow('缺少 generation run 凭证');
  });

  it('never treats success without an explicit Gate PASS as chapter-ready', () => {
    const { service } = createSubject({ ...passedRun, gate_status: 'not_evaluated' });
    expect(() => service.assertCanCommit({
      projectId: 'project-1',
      runId: 'run-1',
      outputText: '{"world":"ok"}',
    })).toThrow('必须来自已通过质量 Gate 的运行');
  });

  it('rejects structured provenance when the generation itself failed', () => {
    const { service } = createSubject({ ...passedRun, status: 'failed', gate_status: 'not_evaluated' });
    expect(() => service.assertStructuredCanCommit({
      projectId: 'project-1',
      runId: 'run-1',
    })).toThrow('未成功完成');
  });

  it('rejects exact text that differs from the output that passed Gate', () => {
    const { service } = createSubject();
    expect(() => service.assertCanCommit({
      projectId: 'project-1',
      runId: 'run-1',
      outputText: '{"world":"changed-after-review"}',
    })).toThrow('与通过 Gate 的最终输出不一致');
  });

  it('rejects a stale run on both boundaries', () => {
    const { service } = createSubject(passedRun, false);
    expect(() => service.assertCanCommit({
      projectId: 'project-1',
      runId: 'run-1',
      outputText: '{"world":"ok"}',
    })).toThrow('凭证已过期');
    expect(() => service.assertStructuredCanCommit({
      projectId: 'project-1',
      runId: 'run-1',
    })).toThrow('凭证已过期');
  });

  it('rejects a run from the wrong structural stage', () => {
    const { service } = createSubject({ ...passedRun, stage: 'chapter' });
    expect(() => service.assertStructuredCanCommit({
      projectId: 'project-1',
      runId: 'run-1',
      expectedStages: ['world'],
    })).toThrow('阶段不匹配');
  });
});
