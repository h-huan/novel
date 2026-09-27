import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';
import { GenerationRecoveryService } from './generation-recovery.service';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

function fixture(type: 'long_novel' | 'short_story', targetWords: number) {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,type TEXT,status TEXT,target_words INTEGER,
      confirmed_idea TEXT,idea_seed TEXT,updated_at TEXT
    );
    CREATE TABLE outlines (
      id TEXT PRIMARY KEY,project_id TEXT,level TEXT,target_words INTEGER,
      status TEXT,"order" INTEGER,volumes TEXT
    );
    CREATE TABLE chapters (
      id TEXT PRIMARY KEY,project_id TEXT,outline_id TEXT,
      content TEXT,locked_at TEXT,status TEXT
    );
    CREATE TABLE characters (id TEXT PRIMARY KEY,project_id TEXT);
    CREATE TABLE world_settings (id TEXT PRIMARY KEY,project_id TEXT);
    CREATE TABLE organizations (id TEXT PRIMARY KEY,project_id TEXT);
    CREATE TABLE map_points (id TEXT PRIMARY KEY,project_id TEXT);
    CREATE TABLE foreshadowings (
      id TEXT PRIMARY KEY,project_id TEXT,
      buried_chapter_index INTEGER,planned_recovery_chapter_index INTEGER
    );
    CREATE TABLE timelines (id TEXT PRIMARY KEY,project_id TEXT);
    CREATE TABLE timeline_events (id TEXT PRIMARY KEY,timeline_id TEXT);
    CREATE TABLE version_history (id TEXT PRIMARY KEY,entity_id TEXT,created_by TEXT);
  `);
  db.prepare('INSERT INTO projects VALUES (?,?,?,?,?,?,?)').run(
    'p', type, 'creating', targetWords, JSON.stringify({ title: '已确认题材' }), null, new Date().toISOString(),
  );
  db.prepare("INSERT INTO characters VALUES ('char','p')").run();
  db.prepare("INSERT INTO world_settings VALUES ('world','p')").run();
  db.prepare("INSERT INTO timelines VALUES ('timeline','p')").run();
  db.prepare("INSERT INTO timeline_events VALUES ('event','timeline')").run();
  const service = new GenerationRecoveryService({ getDb: () => db } as any, {} as any);
  return { db, service };
}

function insertDetailedChapters(db: InstanceType<typeof DatabaseSync>, count: number, words = 4000) {
  const outline = db.prepare('INSERT INTO outlines VALUES (?,?,?,?,?,?,?)');
  const chapter = db.prepare('INSERT INTO chapters VALUES (?,?,?,?,?,?)');
  for (let index = 1; index <= count; index += 1) {
    outline.run(`o${index}`, 'p', 'chapter', words, 'planned', index, null);
    chapter.run(`c${index}`, 'p', `o${index}`, '', null, 'draft');
  }
}

describe('GenerationRecoveryService progressive planning audit', () => {
  let db: InstanceType<typeof DatabaseSync> | null = null;

  afterEach(() => {
    db?.close();
    db = null;
  });

  it('allows a 501-chapter long novel to activate with only the first 20 detailed chapter plans', async () => {
    const f = fixture('long_novel', 2_000_000);
    db = f.db;
    insertDetailedChapters(db, 20, 4000);
    db.prepare('INSERT INTO outlines VALUES (?,?,?,?,?,?,?)').run(
      'v1', 'p', 'volume', 0, 'planned', 1, JSON.stringify({ estimatedChapters: 251 }),
    );
    db.prepare('INSERT INTO outlines VALUES (?,?,?,?,?,?,?)').run(
      'v2', 'p', 'volume', 0, 'planned', 2, JSON.stringify({ estimatedChapters: 250 }),
    );
    db.prepare("INSERT INTO foreshadowings VALUES ('f','p',1,501)").run();

    const audit = await f.service.audit('p');

    expect(audit.plannedChapterWords).toBe(80_000);
    expect(audit.consistencyIssues).not.toEqual(expect.arrayContaining([
      expect.stringContaining('章节目标合计'),
      expect.stringContaining('伏笔章节引用无效'),
    ]));
    await expect(f.service.assertActivationReady('p')).resolves.toMatchObject({ projectId: 'p' });
  });

  it('keeps exact detailed-word accounting for short stories', async () => {
    const f = fixture('short_story', 12_000);
    db = f.db;
    insertDetailedChapters(db, 2, 4000);

    const audit = await f.service.audit('p');

    expect(audit.consistencyIssues).toContain('章节目标合计8000字，与项目目标12000字不一致');
    await expect(f.service.assertActivationReady('p')).rejects.toThrow('章节目标合计8000字');
  });

  it('rejects a long-novel volume plan whose estimated chapter count cannot carry the target words', async () => {
    const f = fixture('long_novel', 2_000_000);
    db = f.db;
    insertDetailedChapters(db, 20, 4000);
    db.prepare('INSERT INTO outlines VALUES (?,?,?,?,?,?,?)').run(
      'v1', 'p', 'volume', 0, 'planned', 1, JSON.stringify({ estimatedChapters: 100 }),
    );

    const audit = await f.service.audit('p');

    expect(audit.consistencyIssues).toEqual(expect.arrayContaining([
      expect.stringContaining('长篇卷规划100章'),
      expect.stringContaining('无法承载项目目标2000000字'),
    ]));
    await expect(f.service.assertActivationReady('p')).rejects.toThrow('无法承载项目目标2000000字');
  });
});
