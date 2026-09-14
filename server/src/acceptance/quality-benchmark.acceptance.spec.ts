import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import { Migrator } from '../database/migrator';
import { GenerationMetricsService } from '../modules/generation-metrics/generation-metrics.service';
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

it('keeps benchmark results pending until real samples and human labels exist', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await new Migrator(db).runMigrations();
    const metrics = new GenerationMetricsService({ getDb: () => db } as any);
    const empty = metrics.getBenchmarkFramework();
    expect(empty.available).toBe(false);
    expect(empty.groups).toHaveLength(5);
    expect(empty.groups.every(group => group.precision === null && group.status === 'waiting_for_samples')).toBe(true);

    const sample = metrics.addBenchmarkSample({ storyType: 'short_story', platform: 'fanqie', content: '真实人工样本正文' });
    expect(metrics.getBenchmarkFramework().groups.find(group => group.platform === 'fanqie' && group.storyType === 'short_story')?.status)
      .toBe('pending_annotation');
    metrics.annotateBenchmarkSample(sample.id, ['ai_trace.abstract_summary']);
    metrics.recordBenchmarkEvaluation({ sampleId: sample.id,
      predictedLabels: ['ai_trace.abstract_summary', 'platform.ending_hook'], repairAttempted: true,
      repairAccepted: true, introducedIssue: false, beforeScore: 60, afterScore: 78 });
    const group = metrics.getBenchmarkFramework().groups.find(item => item.platform === 'fanqie' && item.storyType === 'short_story')!;
    expect(group.precision).toBe(0.5);
    expect(group.recall).toBe(1);
    expect(group.falsePositives).toBe(1);
    expect(group.falseNegatives).toBe(0);
    expect(group.repairSuccessRate).toBe(1);
    expect(group.destructionRate).toBe(0);
  } finally { db.close(); }
});
