import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CreationOutlineCheckpoint } from './creation-outline-checkpoint';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

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

  it('does not keep orphaned checkpoints after project removal', () => {
    const key = CreationOutlineCheckpoint.fingerprint('stage');
    work.save('p1', 'chapter_0', key, { valid: true });
    db.prepare('DELETE FROM projects WHERE id=?').run('p1');
    expect(work.load('p1', 'chapter_0', key)).toBeNull();
  });
});
