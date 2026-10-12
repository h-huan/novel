import { createRequire } from 'node:module';
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
import { describe, expect, it } from 'vitest';
import { GenerationMetricsService } from '../modules/generation-metrics/generation-metrics.service';

describe('final patch rejection invalidates persisted proof', () => {
  it('removes PASS from its run and current artifact report without changing unrelated reports', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec('CREATE TABLE generation_runs (id TEXT,gate_status TEXT,quality_payload TEXT); CREATE TABLE writing_quality_reports (source_id TEXT,source_type TEXT,summary TEXT,overall_level TEXT,payload TEXT,updated_at TEXT)');
      const payload=JSON.stringify({stageScore:{overallScore:85},gate:{passed:true,status:'passed'}});
      db.prepare('INSERT INTO generation_runs VALUES (?,?,?)').run('r','passed',payload);
      db.prepare('INSERT INTO writing_quality_reports VALUES (?,?,?,?,?,?)').run('r','artifact_quality','passed','medium',payload,'old');
      db.prepare('INSERT INTO writing_quality_reports VALUES (?,?,?,?,?,?)').run('other','artifact_quality','passed','medium',payload,'old');
      const service=Object.create(GenerationMetricsService.prototype) as any;
      service.databaseService={getDb:()=>db};
      service.blockRunValidation('r','新版清样凭空消失');
      const run=db.prepare('SELECT * FROM generation_runs WHERE id=?').get('r') as any;
      expect(run.gate_status).toBe('blocked');
      expect(JSON.parse(run.quality_payload).gate.passed).toBe(false);
      const report=db.prepare('SELECT * FROM writing_quality_reports WHERE source_id=?').get('r') as any;
      expect(report.summary).toBe('blocked');
      expect(JSON.parse(report.payload).postRepairValidation.message).toBe('新版清样凭空消失');
      expect((db.prepare('SELECT * FROM writing_quality_reports WHERE source_id=?').get('other') as any).summary).toBe('passed');
    } finally { db.close(); }
  });
});
