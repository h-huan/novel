import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { compileContext } from './context-compiler';
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

function baseDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE chapters(
      id TEXT,project_id TEXT,outline_id TEXT,volume_index INTEGER,
      chapter_index INTEGER,title TEXT,content TEXT,status TEXT
    );
    CREATE TABLE outlines(
      id TEXT,project_id TEXT,level TEXT,"order" INTEGER,title TEXT,content TEXT,
      character_ids TEXT,foreshadowing_ids TEXT,detail_json TEXT,plan_json TEXT
    );
    INSERT INTO outlines VALUES ('o','p','chapter',500,'第五百章','进入当前任务','[]','[]','{}','{}');
    INSERT INTO chapters VALUES ('ch500','p','o',10,500,'第五百章','','draft');
  `);
  return db;
}

describe('dependency context late-project dependencies', () => {
  it('keeps a chapter-bound world rule even when its task is after the old first-64 window', () => {
    const db = baseDb();
    try {
      db.exec(`
        CREATE TABLE world_rule_chapter_tasks(id TEXT,project_id TEXT,chapter_id TEXT,rule_id TEXT);
        CREATE TABLE world_rules(
          id TEXT,project_id TEXT,title TEXT,content TEXT,scope TEXT,
          related_character_ids TEXT,related_foreshadowing_ids TEXT,related_timeline_event_ids TEXT
        );
      `);
      const insertTask = db.prepare('INSERT INTO world_rule_chapter_tasks VALUES (?,?,?,?)');
      for (let n = 0; n < 80; n += 1) {
        insertTask.run(`a${String(n).padStart(3, '0')}`, 'p', `old-chapter-${n}`, `old-rule-${n}`);
      }
      db.prepare('INSERT INTO world_rules VALUES (?,?,?,?,?,?,?,?)').run(
        'late-rule', 'p', '当前章硬规则', '第五百章中任何人都不能越过红门', 'chapter', '[]', '[]', '[]',
      );
      insertTask.run('z-current-task', 'p', 'ch500', 'late-rule');

      const result = compileContext(db, { projectId: 'p', stage: 'chapter', chapterIndex: 500, maxChars: 8000 });

      expect(result.snapshot).toContain('当前章硬规则');
      expect(result.snapshot).toContain('第五百章中任何人都不能越过红门');
    } finally {
      db.close();
    }
  });

  it('walks a relevant causal ancestor even when its link is after the old first-128 window', () => {
    const db = baseDb();
    try {
      db.exec(`
        CREATE TABLE timeline_three_line_events(
          id TEXT,project_id TEXT,title TEXT,summary TEXT,chapter_index INTEGER,
          location TEXT,participants_character_ids TEXT
        );
        CREATE TABLE timeline_causality_links(
          id TEXT,project_id TEXT,source_event_id TEXT,target_event_id TEXT
        );
        INSERT INTO timeline_three_line_events VALUES
          ('t-current','p','当前事件','主角发现密室',500,'旧宅','[]'),
          ('t-ancestor','p','远因事件','二百章前有人调换了钥匙',200,'仓库','[]');
      `);
      db.prepare('UPDATE outlines SET detail_json=? WHERE id=?').run(
        JSON.stringify({ timeline_event_ids: ['t-current'] }),
        'o',
      );
      const insertLink = db.prepare('INSERT INTO timeline_causality_links VALUES (?,?,?,?)');
      for (let n = 0; n < 150; n += 1) {
        insertLink.run(`a${String(n).padStart(3, '0')}`, 'p', `decoy-source-${n}`, `decoy-target-${n}`);
      }
      insertLink.run('z-current-link', 'p', 't-ancestor', 't-current');

      const result = compileContext(db, { projectId: 'p', stage: 'chapter', chapterIndex: 500, maxChars: 8000 });
      const data = JSON.parse(result.snapshot);

      expect(result.snapshot).toContain('二百章前有人调换了钥匙');
      expect(data.causality.some((link: any) => link.id === 'z-current-link')).toBe(true);
    } finally {
      db.close();
    }
  });
});
