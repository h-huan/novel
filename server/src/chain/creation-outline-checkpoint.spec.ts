import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CreationOutlineCheckpoint, hasProvenOutlineCheckpointConflict, outlineConflictChapterOrders } from './creation-outline-checkpoint';
import { classifyGateFailure, GateRejectionError } from '../modules/writing-quality/gate-failure';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

describe('fact-based outline checkpoint invalidation',()=>{
  it('reuses vetted chapters after transport or reviewer protocol failures',()=>{
    expect(hasProvenOutlineCheckpointConflict({outlineFactFailureKind:'review_unavailable'})).toBe(false);
    expect(hasProvenOutlineCheckpointConflict({outlineFactFailureKind:'review_contract_invalid'})).toBe(false);
    expect(hasProvenOutlineCheckpointConflict(new Error('DeepSeek 500'))).toBe(false);
  });
  it('preserves previously reviewed chapters when a structured 503 Gate reports an incomplete review',()=>{
    const unavailable = new GateRejectionError(classifyGateFailure({
      topic:'outline_alignment', evaluationStatus:'not_evaluated',
      buckets:{review_incomplete:['独立行动复核服务超时']},
    }));
    expect(unavailable.report.status).toBe(503);
    expect(hasProvenOutlineCheckpointConflict(unavailable)).toBe(false);
    // The real planning-action reviewer uses GeneratedQualityGateError.
    expect(hasProvenOutlineCheckpointConflict({
      name:'GeneratedQualityGateError', gateRejection:true, report:unavailable.report,
    })).toBe(false);
  });
  it('still clears checkpoints for a structured, evidenced 422 Gate rejection',()=>{
    const conflict = new GateRejectionError(classifyGateFailure({
      topic:'outline_alignment', evaluationStatus:'evaluated',
      buckets:{outline_alignment:['第3章实际行动缺少独立结果条件']},
    }));
    expect(conflict.report.status).toBe(422);
    expect(hasProvenOutlineCheckpointConflict(conflict)).toBe(true);
    expect(hasProvenOutlineCheckpointConflict({
      name:'GeneratedQualityGateError', gateRejection:true, report:conflict.report,
    })).toBe(true);
  });
  it('invalidates confirmed contradictory facts even though they are not prose Gate rejections',()=>{
    expect(hasProvenOutlineCheckpointConflict({outlineFactFailureKind:'fact_conflict'})).toBe(true);
    expect(hasProvenOutlineCheckpointConflict(new Error('aggregate repair failed'),true)).toBe(true);
  });
});

describe('creation outline checkpoints (noncanonical)', () => {
  let db: InstanceType<typeof DatabaseSync>;
  let work: CreationOutlineCheckpoint;
  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys=ON; CREATE TABLE projects(id TEXT PRIMARY KEY); INSERT INTO projects VALUES (\'p1\'); INSERT INTO projects VALUES (\'p2\');');
    work = new CreationOutlineCheckpoint(db as any);
  });
  afterEach(() => db.close());

  it('reuses only an identical verified input fingerprint in the same project and stage', () => {
    const original = { story: 'A', world: ['only A'], previous: [{ result: 'known' }] };
    const changed = { ...original, previous: [{ result: 'different' }] };
    const key = CreationOutlineCheckpoint.fingerprint(original);
    work.save('p1', 'chapter_0', key, { chapter: 1 });
    expect(work.load('p1', 'chapter_0', key)).toEqual({ chapter: 1 });
    expect(work.load('p2', 'chapter_0', key)).toBeNull();
    expect(work.load('p1', 'chapter_1', key)).toBeNull();
    expect(work.load('p1', 'chapter_0', CreationOutlineCheckpoint.fingerprint(changed))).toBeNull();
  });

  it('rejects damaged stage payload instead of allowing it into canonical outlines', () => {
    const key = CreationOutlineCheckpoint.fingerprint('known');
    work.save('p1', 'chapter_plan', key, { chapters: [1, 2] });
    db.prepare('UPDATE creation_outline_checkpoints SET payload=? WHERE project_id=?').run('{broken', 'p1');
    expect(work.load('p1', 'chapter_plan', key)).toBeNull();
  });

  it('updates same-stage work without duplicating rows and clears only completed project', () => {
    const key = CreationOutlineCheckpoint.fingerprint({ chapter: 3 });
    work.save('p1', 'chapter_2', key, { valid: true });
    work.save('p1', 'chapter_2', key, { valid: false });
    work.save('p2', 'chapter_2', key, { valid: true });
    expect(work.load('p1', 'chapter_2', key)).toEqual({ valid: false });
    expect((db.prepare('SELECT COUNT(*) AS n FROM creation_outline_checkpoints WHERE project_id=\'p1\'').get() as any).n).toBe(1);
    work.clear('p1');
    expect(work.load('p1', 'chapter_2', key)).toBeNull();
    expect(work.load('p2', 'chapter_2', key)).toEqual({ valid: true });
  });

  it('invalidates chapters changed by final fact reconciliation but retains the canonical plan fingerprint', () => {
    const key=CreationOutlineCheckpoint.fingerprint({world:'frozen'});
    work.save('p1','chapter_plan',key,{chapters:[{order:0}]});
    work.save('p1','chapter_0',key,{outcome:'original'});
    work.save('p1','chapter_1',key,{outcome:'original'});
    work.save('p2','chapter_0',key,{outcome:'other project'});
    work.invalidateChapters('p1');
    expect(work.load('p1','chapter_plan',key)).toEqual({chapters:[{order:0}]});
    expect(work.load('p1','chapter_0',key)).toBeNull();
    expect(work.load('p1','chapter_1',key)).toBeNull();
    expect(work.load('p2','chapter_0',key)).toEqual({outcome:'other project'});
  });

  it('replays a same-source pending chapter only until reviewed or proven defective', () => {
    const source=CreationOutlineCheckpoint.fingerprint({story:'locked',chapter:1,prior:'A'});
    const changed=CreationOutlineCheckpoint.fingerprint({story:'locked',chapter:1,prior:'B'});
    work.save('p1','chapter_draft_0',source,{chapter:{content:'draft',scenes:[1],characterActions:[1]},runId:'run-1'});
    expect(work.load('p1','chapter_draft_0',source)).toEqual({
      chapter:{content:'draft',scenes:[1],characterActions:[1]},runId:'run-1',
    });
    expect(work.load('p1','chapter_draft_0',changed)).toBeNull();
    work.save('p1','chapter_0',source,{chapter:'independently reviewed'});
    work.discard('p1','chapter_draft_0');
    expect(work.load('p1','chapter_draft_0',source)).toBeNull();
    expect(work.load('p1','chapter_0',source)).toEqual({chapter:'independently reviewed'});
    work.save('p1','chapter_draft_1',source,{chapter:'stale'});
    work.invalidateChapters('p1');
    expect(work.load('p1','chapter_draft_1',source)).toBeNull();
    expect(work.load('p1','chapter_0',source)).toBeNull();
  });

  it('extracts only explicitly named conflict chapters and never guesses', () => {
    expect(outlineConflictChapterOrders([
      { location1: '本批·第4章.content', location2: '确认故事.json.confirmedStory.setting' },
      { location1: '第2章.content', location2: '第2章.scenes' },
      '第5章.content 与 第1章.setting 无法同时成立',
    ])).toEqual([0, 1, 3, 4]);
    expect(outlineConflictChapterOrders([])).toEqual([]);
    expect(outlineConflictChapterOrders([{ location1: '确认故事', location2: '世界规则' }])).toEqual([]);
    expect(outlineConflictChapterOrders([{ location1: '本批·条目0.content' }])).toEqual([]);
  });

  it('does not keep orphaned checkpoints after project removal', () => {
    const key = CreationOutlineCheckpoint.fingerprint('stage');
    work.save('p1', 'chapter_0', key, { valid: true });
    db.prepare('DELETE FROM projects WHERE id=?').run('p1');
    expect(work.load('p1', 'chapter_0', key)).toBeNull();
  });
});
