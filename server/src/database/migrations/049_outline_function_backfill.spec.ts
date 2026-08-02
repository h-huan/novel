import type { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';
import { up } from './049_outline_function_backfill';

const buildDb = (): DatabaseSync => {
  const { DatabaseSync: RealDatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
  const db: DatabaseSync = new RealDatabaseSync(':memory:');
  db.exec(`CREATE TABLE outlines (id TEXT PRIMARY KEY, project_id TEXT, level TEXT, "order" INTEGER, chapter_function TEXT);`);
  db.prepare(`INSERT INTO outlines VALUES (?,?,?,?,?)`).run('v1', 'p1', 'volume', 0, '');
  for (let i = 1; i <= 9; i++) db.prepare(`INSERT INTO outlines VALUES (?,?,?,?,?)`).run(`c${i}`, 'p1', 'chapter', i, 'paving');
  return db;
};

describe('049 backfill outline function', () => {
  it('把全 paving 的章节按短篇节奏回填', () => {
    const db = buildDb();
    up(db);
    const rows = db.prepare(`SELECT "order", chapter_function FROM outlines WHERE level='chapter' ORDER BY "order"`).all() as any[];
    expect(rows.map(r => r.chapter_function)).toEqual(['opening', 'exposition', 'rising_action', 'conflict', 'climax', 'transition', 'climax', 'cliffhanger', 'resolution']);
    expect(db.prepare(`SELECT count(*) c FROM outlines WHERE chapter_function='paving'`).get().c).toBe(0);
  });
});
