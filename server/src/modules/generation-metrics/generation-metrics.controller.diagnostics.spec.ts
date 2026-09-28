import { describe, expect, it, vi } from 'vitest';
import { GenerationMetricsController } from './generation-metrics.controller';

describe('generation metrics diagnostics', () => {
  it('surfaces retries, duplicate work and successful generation that was not persisted', () => {
    const stepRows = [
      { run_id: 'r1', chapter_index: 4, step_key: 'outline_fact_review', scenario: 'review', status: 'success', duration_ms: 120000, total_tokens: 28000, internal_retries: 1, created_at: '2026-09-28T00:00:00Z' },
      { run_id: 'r2', chapter_index: 4, step_key: 'outline_fact_review', scenario: 'review', status: 'success', duration_ms: 60000, total_tokens: 14000, internal_retries: 0, created_at: '2026-09-28T00:01:00Z' },
    ];
    const runRows = [
      { id: 'r1', stage: 'outline', scenario: 'review', status: 'success', chapter_index: 4, prompt_version: 'p', context_version: 'c', constitution_revision: 1, duration_ms: 120000, started_at: '2026-09-28T00:00:00Z' },
      { id: 'r2', stage: 'outline', scenario: 'review', status: 'success', chapter_index: 4, prompt_version: 'p', context_version: 'c', constitution_revision: 1, duration_ms: 60000, started_at: '2026-09-28T00:01:00Z' },
    ];
    const persistedCounts: Record<string, number> = {
      world_settings: 1,
      characters: 0,
      outlines: 0,
      chapters: 0,
      timeline_events: 0,
    };
    const db = {
      prepare: vi.fn((sql: string) => ({
        all: () => sql.includes('generation_step_metrics') ? stepRows : runRows,
        get: () => {
          if (sql.includes('FROM projects')) return { status: 'generation_failed' };
          const table = Object.keys(persistedCounts).find(name => sql.includes(`FROM ${name}`));
          return { c: table ? persistedCounts[table] : 0 };
        },
      })),
    };
    const metrics = { getCockpit: () => ({ runs: [] }) } as any;
    const controller = new GenerationMetricsController(metrics, { getDb: () => db } as any);

    const cockpit: any = controller.cockpit('project-1');
    expect(cockpit.diagnostics.projectStatus).toBe('generation_failed');
    expect(cockpit.diagnostics.internalRetryCount).toBe(1);
    expect(cockpit.diagnostics.callsWithInternalRetry).toBe(1);
    expect(cockpit.diagnostics.totalDurationMs).toBe(180000);
    expect(cockpit.diagnostics.totalTokens).toBe(42000);
    expect(cockpit.diagnostics.slowestSteps[0]).toEqual(expect.objectContaining({ runId: 'r1', internalRetries: 1 }));
    expect(cockpit.diagnostics.exactDuplicateRunGroups).toBe(1);
    expect(cockpit.diagnostics.exactDuplicateRuns[0].runIds).toEqual(['r1', 'r2']);
    expect(cockpit.diagnostics.persistenceMismatch).toContain('outline_success_without_chapter_outline');
  });
});
