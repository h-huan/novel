import { describe, expect, it, vi } from 'vitest';
import { GenerationMetricsController } from './generation-metrics.controller';

const controllerFor = (stepRows: any[], runRows: any[], project: any, persistedCounts: Record<string, number>) => {
  const db = {
    prepare: vi.fn((sql: string) => ({
      all: () => sql.includes('generation_step_metrics') ? stepRows : runRows,
      get: () => {
        if (sql.includes('FROM projects')) return project;
        const table = Object.keys(persistedCounts).find(name => sql.includes(`FROM ${name}`));
        return { c: table ? persistedCounts[table] : 0 };
      },
    })),
  };
  return new GenerationMetricsController({ getCockpit: () => ({ runs: [] }) } as any, { getDb: () => db } as any);
};

describe('generation metrics diagnostics', () => {
  it('surfaces retries, duplicate work and successful generation that was not persisted', () => {
    const stepRows = [
      { run_id: 'r1', chapter_index: 4, step_key: 'outline_fact_review', scenario: 'review', status: 'success', attempt: 0, duration_ms: 120000, total_tokens: 28000, internal_retries: 1, created_at: '2026-09-28T00:00:00Z' },
      { run_id: 'r2', chapter_index: 4, step_key: 'outline_fact_review', scenario: 'review', status: 'success', attempt: 0, duration_ms: 60000, total_tokens: 14000, internal_retries: 0, created_at: '2026-09-28T00:01:00Z' },
    ];
    const runRows = [
      { id: 'r1', stage: 'outline', scenario: 'review', status: 'success', chapter_index: 4, prompt_version: 'p', context_version: 'c', constitution_revision: 1, duration_ms: 120000, started_at: '2026-09-28T00:00:00Z', finished_at: '2026-09-28T00:02:00Z' },
      { id: 'r2', stage: 'outline', scenario: 'review', status: 'success', chapter_index: 4, prompt_version: 'p', context_version: 'c', constitution_revision: 1, duration_ms: 60000, started_at: '2026-09-28T00:01:00Z', finished_at: '2026-09-28T00:02:00Z' },
    ];
    const controller = controllerFor(stepRows, runRows, { status: 'generation_failed', updated_at: '2026-09-28T00:02:00Z' }, {
      world_settings: 1, characters: 0, outlines: 0, chapters: 0, timeline_events: 0,
    });

    const cockpit: any = controller.cockpit('project-1');
    expect(cockpit.diagnostics.projectStatus).toBe('generation_failed');
    expect(cockpit.diagnostics.internalRetryCount).toBe(1);
    expect(cockpit.diagnostics.callsWithInternalRetry).toBe(1);
    expect(cockpit.diagnostics.effectiveRetryCount).toBe(1);
    expect(cockpit.diagnostics.effectiveFirstPassCalls).toBe(1);
    expect(cockpit.diagnostics.effectiveFirstPassRate).toBe(0.5);
    expect(cockpit.diagnostics.totalDurationMs).toBe(180000);
    expect(cockpit.diagnostics.totalTokens).toBe(42000);
    expect(cockpit.diagnostics.slowestSteps[0]).toEqual(expect.objectContaining({ runId: 'r1', internalRetries: 1 }));
    expect(cockpit.diagnostics.exactDuplicateRunGroups).toBe(1);
    expect(cockpit.diagnostics.exactDuplicateRuns[0].runIds).toEqual(['r1', 'r2']);
    expect(cockpit.diagnostics.persistenceMismatch).toContain('outline_success_without_chapter_outline');
    expect(cockpit.diagnostics.pendingPersistenceMismatch).toEqual([]);
  });

  it('keeps a fresh creating project as an in-progress persistence window instead of a false failure', () => {
    const now = new Date().toISOString();
    const controller = controllerFor(
      [{ run_id: 'w1', step_key: 'world_building', scenario: 'world_building', status: 'success', attempt: 0, duration_ms: 5000, total_tokens: 5000, internal_retries: 0, created_at: now }],
      [{ id: 'w1', stage: 'world', scenario: 'world_building', status: 'success', prompt_version: 'p', context_version: 'c', constitution_revision: 1, duration_ms: 5000, started_at: now, finished_at: now }],
      { status: 'creating', updated_at: now },
      { world_settings: 0, characters: 0, outlines: 0, chapters: 0, timeline_events: 0 },
    );

    const cockpit: any = controller.cockpit('project-fresh');
    expect(cockpit.diagnostics.creationStalled).toBe(false);
    expect(cockpit.diagnostics.persistenceMismatch).toEqual([]);
    expect(cockpit.diagnostics.pendingPersistenceMismatch).toContain('world_success_without_world_setting');
  });

  it('promotes an idle creating project to a real stalled persistence failure', () => {
    const old = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const controller = controllerFor(
      [{ run_id: 'w1', step_key: 'world_building', scenario: 'world_building', status: 'success', attempt: 0, duration_ms: 5000, total_tokens: 5000, internal_retries: 0, created_at: old }],
      [{ id: 'w1', stage: 'world', scenario: 'world_building', status: 'success', prompt_version: 'p', context_version: 'c', constitution_revision: 1, duration_ms: 5000, started_at: old, finished_at: old }],
      { status: 'creating', updated_at: old },
      { world_settings: 0, characters: 0, outlines: 0, chapters: 0, timeline_events: 0 },
    );

    const cockpit: any = controller.cockpit('project-stalled');
    expect(cockpit.diagnostics.activeGenerationRuns).toBe(0);
    expect(cockpit.diagnostics.creationStalled).toBe(true);
    expect(cockpit.diagnostics.persistenceMismatch).toContain('world_success_without_world_setting');
    expect(cockpit.diagnostics.pendingPersistenceMismatch).toEqual([]);
  });

  it('exposes bounded, time-filtered per-step rows and redacts failure credentials', () => {
    const rows = [{
      id: 'metric-1', run_id: 'run-1', project_id: 'project-1', chapter_index: null,
      step_key: 'idea_premise_pool_generation', scenario: 'idea_generate', status: 'failed',
      attempt: 1, phase: 'pool', duration_ms: 1500, fail_reason: 'Authorization: Bearer secret-token',
      total_tokens: 1200, internal_retries: 2, created_at: '2026-10-22T07:00:01.000Z',
      model_version: 'deepseek-flash', stage: 'project', gate_status: 'failed',
      started_at: '2026-10-22T07:00:00.000Z', finished_at: '2026-10-22T07:00:01.000Z',
      prompt_version: 'prompt-hash', context_version: 'context-hash', constitution_revision: 2,
    }];
    const all = vi.fn(() => rows);
    const prepare = vi.fn(() => ({ all }));
    const controller = new GenerationMetricsController({ getCockpit: () => ({ runs: [] }) } as any,
      { getDb: () => ({ prepare }) } as any);
    const result: any = controller.steps(undefined, 'idea_generate', 'idea_premise_pool_generation',
      '2026-10-22T07:00:00.000Z', '2026-10-22T07:00:02.000Z', '700');
    expect(prepare.mock.calls[0][0]).toContain('LEFT JOIN generation_runs');
    expect(prepare.mock.calls[0][0]).toContain('julianday(m.created_at) >= julianday(?)');
    expect(all).toHaveBeenCalledWith('idea_generate', 'idea_premise_pool_generation'.length,
      'idea_premise_pool_generation', '2026-10-22T07:00:00.000Z', '2026-10-22T07:00:02.000Z', 500);
    expect(result.limit).toBe(500);
    expect(result.items[0].internal_retries).toBe(2);
    expect(result.items[0].fail_reason).not.toContain('secret-token');
    expect(result.filters.startAt).toBe('2026-10-22T07:00:00.000Z');
  });

  it('does not convert a failed persistence count query into a false zero-count mismatch', () => {
    const now = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const prepare = vi.fn((sql: string) => ({
      all: () => sql.includes('SELECT id,stage') ? [
        { id: 'run-outline', stage: 'outline', scenario: 'outline', status: 'success', started_at: now, finished_at: now },
      ] : [],
      get: () => {
        if (sql.includes('FROM projects')) return { id: 'p1', status: 'generation_failed', updated_at: now };
        if (sql.includes('FROM outlines')) throw new Error('no such column: level');
        return { c: 0 };
      },
    }));
    const controller = new GenerationMetricsController({ getCockpit: () => ({ runs: [] }) } as any,
      { getDb: () => ({ prepare }) } as any);
    const result: any = controller.cockpit('p1');
    expect(result.diagnostics.persisted.chapterOutlines).toBeNull();
    expect(result.diagnostics.persistenceUnknown).toContain('chapterOutlines');
    expect(result.diagnostics.persistenceQueryErrors.join(' ')).toContain('no such column: level');
    expect(result.diagnostics.persistenceMismatch).not.toContain('outline_success_without_chapter_outline');
    expect(result.diagnostics.persistenceStatus).toBe('unknown');
  });

});
