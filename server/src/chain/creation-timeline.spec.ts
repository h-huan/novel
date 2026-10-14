import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureCreationTimelineWithEvents } from './creation-timeline';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
const openDbs: Array<InstanceType<typeof DatabaseSync>> = [];
const fixture = () => {
  const db = new DatabaseSync(':memory:');
  openDbs.push(db);
  db.exec(`
    CREATE TABLE projects(id TEXT PRIMARY KEY);
    INSERT INTO projects(id) VALUES ('project');
    CREATE TABLE timelines(id TEXT PRIMARY KEY, project_id TEXT NOT NULL,
      name TEXT NOT NULL, description TEXT, start_date TEXT, end_date TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id));
    CREATE TABLE timeline_events(id TEXT PRIMARY KEY, timeline_id TEXT NOT NULL,
      title TEXT NOT NULL, description TEXT, event_date TEXT, event_type TEXT,
      importance INTEGER, related_character_ids TEXT, related_chapter_ids TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY(timeline_id) REFERENCES timelines(id));
  `);
  db.exec('PRAGMA foreign_keys=ON');
  let nextId = 0;
  const options = (fallbackChapters: any[] = [{title: '冲突起点',chapterReference: 1},{title: '选择后果',chapterReference: 2}]) => ({
    projectId: 'project', title: '已确认作品', timelineItems: [], fallbackChapters,
    makeId: () => `new-${++nextId}`, timestamp: () => '2026-10-14',
    serialize: (value: unknown, fallback = '') => String(value || fallback),
  });
  return {db, options};
};
afterEach(() => { for (const db of openDbs.splice(0)) db.close(); });

describe('creation timeline finalization', () => {
  it('creates evidence-derived events once and never duplicates them on recovery', () => {
    const {db,options}=fixture();
    expect(ensureCreationTimelineWithEvents(db,options())).toBe(2);
    expect(ensureCreationTimelineWithEvents(db,options())).toBe(2);
    expect((db.prepare('SELECT COUNT(*) n FROM timelines').get() as any).n).toBe(1);
    expect((db.prepare('SELECT COUNT(*) n FROM timeline_events').get() as any).n).toBe(2);
    expect((db.prepare('SELECT related_chapter_ids FROM timeline_events ORDER BY id LIMIT 1').get() as any)
      .related_chapter_ids).toBe('["1"]');
  });

  it('recovers existing empty timeline without deleting or replacing it', () => {
    const {db,options}=fixture();
    db.prepare(`INSERT INTO timelines VALUES(?,?,?,?,?,?,?,?)`).run('kept','project','existing','saved',null,null,'2026-10-10','2026-10-10');
    expect(ensureCreationTimelineWithEvents(db,options())).toBe(2);
    expect((db.prepare('SELECT id FROM timelines').get() as any).id).toBe('kept');
  });

  it('rolls back a failed event insert and preserves earlier author work', () => {
    const {db,options}=fixture();
    db.exec(`CREATE TRIGGER reject_event BEFORE INSERT ON timeline_events
      WHEN NEW.title='BLOCKED' BEGIN SELECT RAISE(ABORT,'event rejected'); END;`);
    expect(() => ensureCreationTimelineWithEvents(db,options([
      {title:'普通节点',chapterReference:1},{title:'BLOCKED',chapterReference:2},
    ]))).toThrow('event rejected');
    expect((db.prepare('SELECT COUNT(*) n FROM timelines').get() as any).n).toBe(0);
    expect((db.prepare('SELECT COUNT(*) n FROM timeline_events').get() as any).n).toBe(0);
    expect(ensureCreationTimelineWithEvents(db,options())).toBe(2);
  });

  it('refuses to silently accept partially persisted historical events', () => {
    const {db,options}=fixture();
    db.prepare('INSERT INTO timelines VALUES(?,?,?,?,?,?,?,?)').run(
      'kept','project','original','author saved',null,null,'2026-10-10','2026-10-10');
    db.prepare('INSERT INTO timeline_events VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(
      'event1','kept','author event','',null,'plot',3,'[]','["1"]','2026-10-10','2026-10-10');
    expect(() => ensureCreationTimelineWithEvents(db,options())).toThrow('已有时间线事件 1/2');
    expect((db.prepare('SELECT COUNT(*) n FROM timeline_events').get() as any).n).toBe(1);
    expect((db.prepare('SELECT title FROM timeline_events').get() as any).title).toBe('author event');
  });

  it('never fabricates events without a source chapter or explicit timeline', () => {
    const {db,options}=fixture();
    expect(ensureCreationTimelineWithEvents(db,options([]))).toBe(0);
    expect((db.prepare('SELECT COUNT(*) n FROM timelines').get() as any).n).toBe(0);
  });
});
