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

  it('keeps a current-chapter timeline event even when it is after the old first-96 event window', () => {
    const db = baseDb();
    try {
      db.exec(`CREATE TABLE timeline_three_line_events(
        id TEXT,project_id TEXT,title TEXT,summary TEXT,chapter_index INTEGER,
        location TEXT,participants_character_ids TEXT
      );`);
      const insert = db.prepare('INSERT INTO timeline_three_line_events VALUES (?,?,?,?,?,?,?)');
      for (let n = 0; n < 110; n += 1) {
        insert.run(`a${String(n).padStart(3, '0')}`, 'p', `旧事件${n}`, '无关历史事件', n, '旧地', '[]');
      }
      insert.run('z-current-event', 'p', '当前章关键事件', '第五百章必须处理这次停电', 500, '主楼', '[]');

      const result = compileContext(db, { projectId: 'p', stage: 'chapter', chapterIndex: 500, maxChars: 8000 });

      expect(result.snapshot).toContain('当前章关键事件');
      expect(result.snapshot).toContain('第五百章必须处理这次停电');
    } finally {
      db.close();
    }
  });

  it('keeps a full-book hard rule even when it is after the old first-64 rule window', () => {
    const db = baseDb();
    try {
      db.exec(`CREATE TABLE world_rules(
        id TEXT,project_id TEXT,title TEXT,content TEXT,scope TEXT,
        related_character_ids TEXT,related_foreshadowing_ids TEXT,related_timeline_event_ids TEXT
      );`);
      const insert = db.prepare('INSERT INTO world_rules VALUES (?,?,?,?,?,?,?,?)');
      for (let n = 0; n < 80; n += 1) {
        insert.run(`a${String(n).padStart(3, '0')}`, 'p', `局部规则${n}`, '只影响旧章节', 'chapter', '[]', '[]', '[]');
      }
      insert.run('z-full-book-rule', 'p', '全书硬规则', '任何角色都不能凭空知道尚未发生的未来事实', 'full_book', '[]', '[]', '[]');

      const result = compileContext(db, { projectId: 'p', stage: 'chapter', chapterIndex: 500, maxChars: 8000 });

      expect(result.snapshot).toContain('全书硬规则');
      expect(result.snapshot).toContain('任何角色都不能凭空知道尚未发生的未来事实');
    } finally {
      db.close();
    }
  });

  it('keeps an involved character confirmed state even when 64 newer unrelated states exist', () => {
    const db = baseDb();
    try {
      db.exec(`
        CREATE TABLE characters(
          id TEXT,project_id TEXT,name TEXT,role TEXT,personality_traits TEXT,
          goals TEXT,weaknesses TEXT,relationships TEXT,profile_json TEXT
        );
        CREATE TABLE state_items(
          id TEXT,project_id TEXT,target_type TEXT,target_id TEXT,target_label TEXT,
          state_key TEXT,title TEXT,summary TEXT,content TEXT,authority TEXT,
          confidence REAL,status TEXT,updated_at TEXT
        );
        INSERT INTO characters VALUES ('c-target','p','顾舟','protagonist','[]','','','','{}');
      `);
      db.prepare('UPDATE outlines SET character_ids=? WHERE id=?').run(JSON.stringify(['c-target']), 'o');
      const insert = db.prepare('INSERT INTO state_items VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
      insert.run(
        's-target', 'p', 'character', 'c-target', '顾舟', 'injury', '旧伤',
        '顾舟左手仍无法用力，这是当前章必须延续的已确认状态', '', 'hard_fact', 1, 'confirmed', '2026-01-01T00:00:00Z',
      );
      for (let n = 0; n < 70; n += 1) {
        insert.run(
          `s-new-${String(n).padStart(3, '0')}`, 'p', 'character', `other-${n}`, `路人${n}`,
          'mood', '无关状态', `无关角色状态${n}`, '', 'hard_fact', 1, 'confirmed',
          `2026-02-${String((n % 27) + 1).padStart(2, '0')}T12:00:${String(n % 60).padStart(2, '0')}Z`,
        );
      }

      const result = compileContext(db, { projectId: 'p', stage: 'chapter', chapterIndex: 500, maxChars: 8000 });

      expect(result.snapshot).toContain('顾舟左手仍无法用力');
    } finally {
      db.close();
    }
  });

  it('keeps a late active foreshadowing instead of selecting only the earliest 64 rows', () => {
    const db = baseDb();
    try {
      db.exec(`CREATE TABLE foreshadowings(
        id TEXT,project_id TEXT,content TEXT,status TEXT,type TEXT,importance INTEGER,
        buried_chapter_index INTEGER,planned_recovery_chapter_index INTEGER,
        recovery_condition TEXT,payoff_description TEXT,related_character_ids TEXT,risk_level TEXT
      );`);
      const insert = db.prepare('INSERT INTO foreshadowings VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
      for (let n = 0; n < 80; n += 1) {
        insert.run(
          `a${String(n).padStart(3, '0')}`, 'p', `低优先级旧伏笔${n}`, 'active', 'hint', 1,
          n + 1, null, '', '', '[]', 'low',
        );
      }
      insert.run(
        'z-late-active', 'p', '第四百九十章留下的黑色门卡必须继续保留', 'active', 'hint', 10,
        490, 510, '进入主楼后', '门卡将在后续打开核心区域', '[]', 'high',
      );

      const result = compileContext(db, { projectId: 'p', stage: 'chapter', chapterIndex: 500, maxChars: 8000 });

      expect(result.snapshot).toContain('第四百九十章留下的黑色门卡必须继续保留');
    } finally {
      db.close();
    }
  });
});
