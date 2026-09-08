import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';
import { ConsistencyCheckService } from './consistency-check.service';
import { Migrator } from '../database/migrator';
import { up as applyCurrentSchema } from '../database/migrations/001_initial';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

describe('ConsistencyCheckService native SQLite acceptance', () => {
  let db: DatabaseSync | undefined;

  afterEach(() => db?.close());

  it('uses current schema and reports world, timeline, outline and overdue-foreshadowing problems', async () => {
    const localDb = new DatabaseSync(':memory:');
    db = localDb;
    await new Migrator(localDb).runMigrations();
    localDb.prepare("INSERT INTO projects(id,title,type,status,settings,created_at,updated_at) VALUES ('p1','测试','short_story','active','{}',datetime('now'),datetime('now'))").run();
    localDb.prepare("INSERT INTO outlines(id,project_id,level,title,created_at,updated_at) VALUES ('o1','p1','chapter','第一章',datetime('now'),datetime('now'))").run();
    localDb.prepare('INSERT INTO chapters(id,project_id,chapter_index,content,outline_id,title,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,datetime(\'now\'),datetime(\'now\'))').run('c1', 'p1', 1, '主角发现禁术痕迹', 'o1', '一', 'draft');
    localDb.prepare('INSERT INTO chapters(id,project_id,chapter_index,content,outline_id,title,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,datetime(\'now\'),datetime(\'now\'))').run('c3', 'p1', 3, '主角继续追查禁术', null, '三', 'draft');
    localDb.prepare('INSERT INTO world_settings(id,project_id,name,rules,created_at,updated_at) VALUES (?,?,?,?,datetime(\'now\'),datetime(\'now\'))').run('w1', 'p1', '世界', JSON.stringify([
      { name: '力量禁令', content: '禁止公开使用禁术', forbiddenWriting: ['禁术'], severity: 'high' },
    ]));
    localDb.prepare('INSERT INTO characters(id,project_id,name,personality,background,created_at,updated_at) VALUES (?,?,?,?,?,datetime(\'now\'),datetime(\'now\'))').run('hero', 'p1', '主角', '{}', '');
    localDb.prepare('INSERT INTO foreshadowings(id,project_id,content,status,buried_chapter_index,planned_recovery_chapter_index,created_at,updated_at) VALUES (?,?,?,?,?,?,datetime(\'now\'),datetime(\'now\'))').run('fs1', 'p1', '失踪的钥匙', 'active', 1, 2);

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
    expect((localDb.prepare("SELECT COUNT(*) AS count FROM writing_quality_issues WHERE issue_type LIKE 'consistency.%'").get() as any).count).toBe(result.length);
  });
});

it('migrates legacy contradiction rows into QualityIssue and removes old tables', async () => {
  const localDb = new DatabaseSync(':memory:');
  try {
    await new Migrator(localDb).runMigrations();
    localDb.prepare("INSERT INTO projects(id,title,type,status,settings,created_at,updated_at) VALUES ('p-old','旧项目','short_story','active','{}',datetime('now'),datetime('now'))").run();
    localDb.exec(`CREATE TABLE consistency_checks (
      id TEXT PRIMARY KEY,project_id TEXT,check_type TEXT,status TEXT,message TEXT,severity TEXT,
      detected_at TEXT,chapter_index INTEGER,details TEXT,resolved INTEGER,resolved_by TEXT,resolved_at TEXT,created_at TEXT,source TEXT
    ); CREATE TABLE conflict_logs (
      id TEXT PRIMARY KEY,project_id TEXT,chapter_id TEXT,type TEXT,priority INTEGER,description TEXT,
      source_entity_type TEXT,source_entity_id TEXT,conflict_entity_type TEXT,conflict_entity_id TEXT,
      resolution TEXT,resolution_by TEXT,resolved_at TEXT,created_at TEXT
    );`);
    localDb.prepare("INSERT INTO consistency_checks VALUES ('old-check','p-old','timeline','error','时间冲突','high',datetime('now'),NULL,'[]',0,NULL,NULL,datetime('now'),'deterministic')").run();
    localDb.prepare("INSERT INTO conflict_logs VALUES ('old-log','p-old',NULL,'plot',2,'情节冲突',NULL,NULL,NULL,NULL,NULL,NULL,NULL,datetime('now'))").run();
    applyCurrentSchema(localDb);
    expect(localDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('consistency_checks','conflict_logs')").all()).toHaveLength(0);
    expect(localDb.prepare("SELECT issue_type,severity FROM writing_quality_issues WHERE id='old-check'").get()).toMatchObject({ issue_type: 'consistency.timeline', severity: 'blocking' });
    expect(localDb.prepare("SELECT issue_type,severity FROM writing_quality_issues WHERE id='old-log'").get()).toMatchObject({ issue_type: 'consistency.plot', severity: 'high' });
  } finally { localDb.close(); }
});
