import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
// Vitest aliases node:sqlite to a no-op database. Read the actual built-in
// through Node's require for persistence/migration assertions.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
import { reconcileSchema } from '../../database/schema-reconciler';
import { GenerationMetricsService, generationRulesetSnapshotIsCurrent } from './generation-metrics.service';

describe('generation ruleset staleness', () => {
  const digest = 'a'.repeat(64);

  it('accepts only a snapshot from the same ruleset version and registry digest', () => {
    expect(generationRulesetSnapshotIsCurrent(JSON.stringify({ rulesetVersion: 77, registryDigest: digest }), 77, digest)).toBe(true);
    expect(generationRulesetSnapshotIsCurrent(JSON.stringify({ rulesetVersion: 76, registryDigest: digest }), 77, digest)).toBe(false);
    expect(generationRulesetSnapshotIsCurrent(JSON.stringify({ rulesetVersion: 77, registryDigest: 'b'.repeat(64) }), 77, digest)).toBe(false);
  });

  it('treats legacy, absent and malformed snapshots as stale', () => {
    expect(generationRulesetSnapshotIsCurrent(JSON.stringify({ modules: [] }), 77, digest)).toBe(false);
    expect(generationRulesetSnapshotIsCurrent('', 77, digest)).toBe(false);
    expect(generationRulesetSnapshotIsCurrent('{bad json', 77, digest)).toBe(false);
    expect(generationRulesetSnapshotIsCurrent(null, 77, digest)).toBe(false);
  });
});

describe('generation run request identity at model-call start', () => {
 it('persists exact discoveryRequestId before any finished step metric exists', () => {
  const db = new DatabaseSync(':memory:');
  try {
   db.exec(`CREATE TABLE generation_runs (
    id TEXT PRIMARY KEY, project_id TEXT, discovery_request_id TEXT, stage TEXT, scenario TEXT,
    status TEXT, constitution_revision INTEGER, constitution_json TEXT, prompt_version TEXT,
    context_version TEXT, context_snapshot TEXT, chapter_index INTEGER, standards_snapshot TEXT,
    started_at TEXT)`);
   const service = new GenerationMetricsService({ getDb: () => db } as any);
   const idea = service.beginRun(undefined, 'idea_generate', 'a factual premise', undefined,
    'idea_premise_pool_generation', undefined, true, 'request-123');
   const actual = db.prepare('SELECT discovery_request_id,status FROM generation_runs WHERE id=?')
    .get(idea.id) as { discovery_request_id:string|null; status:string };
   expect(actual).toEqual({ discovery_request_id:'request-123',status:'running' });
   const daily = service.beginRun(undefined, 'daily', 'unrelated work', undefined,
    undefined, undefined, true, 'request-123');
   const unrelated = db.prepare('SELECT discovery_request_id FROM generation_runs WHERE id=?')
    .get(daily.id) as { discovery_request_id:string|null };
   expect(unrelated.discovery_request_id).toBeNull();
  } finally {
   db.close();
  }
 });
});

describe('legacy database discovery-run identity upgrade',()=>{
 it('adds the new attribution column idempotently without discarding historical rows',()=>{
  const db=new DatabaseSync(':memory:');
  try{
   db.exec(`CREATE TABLE quality_benchmark_samples(id TEXT PRIMARY KEY);
    CREATE TABLE generation_runs(
     id TEXT PRIMARY KEY,stage TEXT,scenario TEXT,status TEXT,
     gate_status TEXT DEFAULT 'not_evaluated',started_at TEXT
    );
    INSERT INTO generation_runs(id,stage,scenario,status,started_at)
    VALUES('historic','project','idea_generate','success','2026-10-26T23:00:00Z');`);
   const initial=reconcileSchema(db);
   expect(initial.actions).toContain('generation_runs.discovery_request_id');
   const row=db.prepare('SELECT discovery_request_id,status FROM generation_runs WHERE id=?')
    .get('historic') as {discovery_request_id:string|null;status:string};
   expect(row).toEqual({discovery_request_id:null,status:'success'});
   const next=reconcileSchema(db);
   expect(next.actions).not.toContain('generation_runs.discovery_request_id');
  }finally{db.close();}
 });
});
