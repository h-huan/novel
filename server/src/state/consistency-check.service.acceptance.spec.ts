import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';
import { ConsistencyCheckService } from './consistency-check.service';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

describe('ConsistencyCheckService native SQLite acceptance', () => {
  let db: DatabaseSync | undefined;

  afterEach(() => db?.close());

  it('uses current schema and reports world, timeline, outline and overdue-foreshadowing problems', async () => {
    const localDb = new DatabaseSync(':memory:');
    db = localDb;
    localDb.exec(`
      CREATE TABLE chapters (id TEXT PRIMARY KEY, project_id TEXT, chapter_index INTEGER, content TEXT, outline_id TEXT);
      CREATE TABLE world_settings (id TEXT PRIMARY KEY, project_id TEXT, rules TEXT);
      CREATE TABLE characters (id TEXT PRIMARY KEY, project_id TEXT, name TEXT, personality TEXT, background TEXT);
      CREATE TABLE foreshadowings (id TEXT PRIMARY KEY, project_id TEXT, content TEXT, status TEXT, planned_recovery_chapter_index INTEGER);
      CREATE TABLE consistency_checks (
        id TEXT PRIMARY KEY, project_id TEXT, check_type TEXT, status TEXT, message TEXT,
        severity TEXT, detected_at TEXT, chapter_index INTEGER, details TEXT, resolved INTEGER DEFAULT 0,
        resolved_by TEXT, resolved_at TEXT, created_at TEXT
      );
    `);
    localDb.prepare('INSERT INTO chapters VALUES (?,?,?,?,?)').run('c1', 'p1', 1, '主角发现禁术痕迹', 'o1');
    localDb.prepare('INSERT INTO chapters VALUES (?,?,?,?,?)').run('c3', 'p1', 3, '主角继续追查禁术', null);
    localDb.prepare('INSERT INTO world_settings VALUES (?,?,?)').run('w1', 'p1', JSON.stringify([
      { name: '力量禁令', content: '禁止公开使用禁术', forbiddenWriting: ['禁术'], severity: 'high' },
    ]));
    localDb.prepare('INSERT INTO characters VALUES (?,?,?,?,?)').run('hero', 'p1', '主角', '{}', '');
    localDb.prepare('INSERT INTO foreshadowings VALUES (?,?,?,?,?)').run('fs1', 'p1', '失踪的钥匙', 'active', 2);

    const service = new ConsistencyCheckService({ getDb: () => localDb } as any);
    expect(localDb.prepare('SELECT * FROM chapters').all()).toHaveLength(2);
    expect(localDb.prepare('SELECT id, chapter_index AS `index`, content FROM chapters WHERE project_id = ? ORDER BY chapter_index').all('p1')).toHaveLength(2);
    expect(await (service as any).checkTimelineConsistency(
      { id: 'c3', index: 3, content: '' },
      [{ id: 'c1', index: 1, content: '' }, { id: 'c3', index: 3, content: '' }],
    )).toHaveLength(1);
    const result = await service.checkConsistency('p1', {
      checkTypes: ['world_setting', 'timeline', 'plot_logic'],
    });

    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ checkType: 'world_setting', status: 'error', chapterIndex: 1 }),
      expect.objectContaining({ checkType: 'timeline', status: 'warning', chapterIndex: 3 }),
      expect.objectContaining({ checkType: 'plot_logic', status: 'error', chapterIndex: 3 }),
      expect.objectContaining({ checkType: 'plot_logic', status: 'warning', chapterIndex: 3 }),
    ]));
    expect((localDb.prepare('SELECT COUNT(*) AS count FROM consistency_checks').get() as any).count).toBe(result.length);
  });
});
