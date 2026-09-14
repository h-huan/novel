import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { compileContext } from './context-compiler';
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE chapters(id TEXT,project_id TEXT,outline_id TEXT,volume_index INTEGER,chapter_index INTEGER,title TEXT,content TEXT,status TEXT);
    CREATE TABLE outlines(id TEXT,project_id TEXT,level TEXT,parent_id TEXT,"order" INTEGER,title TEXT,content TEXT,chapter_function TEXT,goal_arc TEXT,target_words INTEGER,character_ids TEXT,foreshadowing_ids TEXT,plot_points TEXT,ending_hook TEXT,emotion_tone TEXT,detail_json TEXT,plan_json TEXT);
    CREATE TABLE characters(id TEXT,project_id TEXT,name TEXT,role TEXT,personality_traits TEXT,goals TEXT,weaknesses TEXT,relationships TEXT,profile_json TEXT);
    CREATE TABLE character_extended_profiles(character_id TEXT,speech_style TEXT,catchphrase TEXT,common_words TEXT,forbidden_words TEXT,tone_to_different_people TEXT,emotion_outburst_style TEXT,danger_reaction TEXT,betrayal_reaction TEXT,weak_person_reaction TEXT,strong_person_reaction TEXT,must_obey_rules TEXT,forbidden_writing TEXT);
    CREATE TABLE world_settings(id TEXT,project_id TEXT,name TEXT,era TEXT,rules TEXT,constraints TEXT,social_rules TEXT,special_settings TEXT,rule_system_json TEXT,atmosphere TEXT,story_premise TEXT);
    CREATE TABLE state_items(project_id TEXT,target_type TEXT,target_id TEXT,target_label TEXT,state_key TEXT,title TEXT,summary TEXT,content TEXT,authority TEXT,confidence REAL,status TEXT,updated_at TEXT,id TEXT);
    CREATE TABLE foreshadowings(id TEXT,project_id TEXT,content TEXT,status TEXT,type TEXT,importance INTEGER,buried_chapter_index INTEGER,planned_recovery_chapter_index INTEGER,recovery_condition TEXT,payoff_description TEXT,related_character_ids TEXT,risk_level TEXT);
    CREATE TABLE timeline_three_line_events(id TEXT,project_id TEXT,title TEXT,summary TEXT,line_type TEXT,volume_index INTEGER,chapter_index INTEGER,story_time_text TEXT,story_time_order REAL,narrative_order INTEGER,causality_order INTEGER,location TEXT,participants_character_ids TEXT,reader_known_state TEXT,character_known_state TEXT,status TEXT,risk_level TEXT,risk_reason TEXT);
  `);
  db.prepare("INSERT INTO world_settings VALUES ('w','p','城','现代','[\"夜间禁行\"]','','','','{}','','')").run();
  db.prepare("INSERT INTO characters VALUES ('c','p','林岚','protagonist','[]','','','','{}')").run();
  db.prepare("INSERT INTO character_extended_profiles VALUES ('c','短句','别怕','走','保证','','压低声音','先观察','','保护','警惕','不得说谎','禁止书面腔')").run();
  db.prepare("INSERT INTO outlines VALUES ('o','p','chapter',NULL,5,'第五章','进入禁区','turn','crisis',3500,'[\"c\"]','[]','[]','悬念','紧张','{}','{}')").run();
  for (let index = 1; index <= 8; index += 1) db.prepare('INSERT INTO chapters VALUES (?,?,?,?,?,?,?,?)')
    .run(`ch${index}`, 'p', index === 5 ? 'o' : null, 2, index, `第${index}章`, `${index === 5 ? '林岚' : '往事'}${'内容'.repeat(900)}`, 'draft');
  db.prepare("INSERT INTO state_items VALUES ('p','character','c','林岚','injury','伤势','左臂受伤','','hard_fact',1,'confirmed','2026-01-01','s')").run();
  db.prepare("INSERT INTO foreshadowings VALUES ('f','p','钥匙缺口','active','hint',3,2,6,'门前','开启禁区','[\"c\"]','high')").run();
  db.prepare("INSERT INTO timeline_three_line_events VALUES ('t','p','潜入','进入禁区','story_time',2,5,'午夜',5,5,5,'城门','[\"c\"]','known','known','planned','none','')").run();
  return db;
}

describe('Context Compiler', () => {
  it('selects chapter-relevant canonical facts and produces a stable bounded version', () => {
    const db = fixture();
    try {
      const first = compileContext(db, { projectId: 'p', stage: 'chapter', chapterIndex: 5, maxChars: 4000 });
      const second = compileContext(db, { projectId: 'p', stage: 'chapter', chapterIndex: 5, maxChars: 4000 });
      expect(first.version).toBe(second.version);
      expect(first.snapshot.length).toBeLessThanOrEqual(4000);
      expect(first.snapshot).toContain('speech_style');
      expect(first.snapshot).toContain('夜间禁行');
      expect(first.snapshot).toContain('钥匙缺口');
      expect(first.snapshot).toContain('左臂受伤');
      expect(first.snapshot).not.toContain('第6章');
      expect(first.truncated).toBe(true);
    } finally { db.close(); }
  });

  it('changes the version when selected current facts change', () => {
    const db = fixture();
    try {
      const before = compileContext(db, { projectId: 'p', stage: 'chapter', chapterIndex: 5 });
      db.prepare("UPDATE character_extended_profiles SET forbidden_words='永远' WHERE character_id='c'").run();
      const after = compileContext(db, { projectId: 'p', stage: 'chapter', chapterIndex: 5 });
      expect(after.version).not.toBe(before.version);
    } finally { db.close(); }
  });
});
