import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { compileContext } from './context-compiler';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE chapters(
      id TEXT,project_id TEXT,outline_id TEXT,volume_index INTEGER,
      chapter_index INTEGER,title TEXT,content TEXT,status TEXT
    );
    CREATE TABLE outlines(
      id TEXT,project_id TEXT,level TEXT,parent_id TEXT,"order" INTEGER,
      title TEXT,content TEXT,chapter_function TEXT,goal_arc TEXT,target_words INTEGER,
      character_ids TEXT,foreshadowing_ids TEXT,plot_points TEXT,ending_hook TEXT,
      emotion_tone TEXT,detail_json TEXT,plan_json TEXT
    );
    CREATE TABLE world_rules(
      id TEXT,project_id TEXT,title TEXT,content TEXT,scope TEXT,
      related_character_ids TEXT,related_foreshadowing_ids TEXT,related_timeline_event_ids TEXT
    );
    INSERT INTO chapters VALUES ('ch500','p','o500',1,500,'第五百章','','draft');
    INSERT INTO outlines VALUES (
      'o500','p','chapter',NULL,500,'第五百章','继续执行全书规则','development','advance',3500,
      '[]','[]','[]','章尾钩子','紧张','{}','{}'
    );
  `);
  return db;
}

function insertFullBookRules(db: any, count: number, contentSize = 1) {
  const insert = db.prepare('INSERT INTO world_rules VALUES (?,?,?,?,?,?,?,?)');
  for (let n = 1; n <= count; n += 1) {
    const id = `rule-${String(n).padStart(3, '0')}`;
    insert.run(
      id,
      'p',
      `全书规则${n}`,
      `规则正文${n}-` + '必须遵守'.repeat(contentSize),
      'full_book',
      '[]',
      '[]',
      '[]',
    );
  }
}

describe('full-book world rules in canonical context', () => {
  it('does not silently lose rule 65+ before the shared context budget is applied', () => {
    const db = fixture();
    try {
      insertFullBookRules(db, 80, 1);

      const result = compileContext(db, {
        projectId: 'p',
        stage: 'chapter',
        chapterIndex: 500,
        maxChars: 48000,
      });

      expect(result.snapshot).toContain('全书规则80');
      expect(result.snapshot).toContain('规则正文80');
    } finally {
      db.close();
    }
  });

  it('reports world-rule truncation when the shared context budget cannot hold every hard rule', () => {
    const db = fixture();
    try {
      insertFullBookRules(db, 80, 80);

      const result = compileContext(db, {
        projectId: 'p',
        stage: 'chapter',
        chapterIndex: 500,
        maxChars: 4000,
      });
      const data = JSON.parse(result.snapshot);

      expect(result.truncated).toBe(true);
      expect(data.meta.truncation).toContain('worldRules');
      expect(result.size).toBeLessThanOrEqual(4000);
    } finally {
      db.close();
    }
  });
});
