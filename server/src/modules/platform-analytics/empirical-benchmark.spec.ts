import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { empiricalPlatformBenchmark } from './empirical-benchmark';
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

function fixture(count: number) {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE projects(id TEXT PRIMARY KEY,type TEXT,target_platform TEXT,settings TEXT);
    CREATE TABLE chapters(id TEXT,project_id TEXT,chapter_index INTEGER,word_count INTEGER,content TEXT,status TEXT);
    CREATE TABLE writing_quality_reports(id TEXT,chapter_id TEXT,overall_score REAL,created_at TEXT);
    CREATE TABLE writing_revision_records(id TEXT,chapter_id TEXT);
  `);
  const settings = JSON.stringify({ creativeConstitution: { category: '悬疑' } });
  db.prepare("INSERT INTO projects VALUES ('p','short_story','fanqie',?)").run(settings);
  for (let i = 1; i <= count; i += 1) {
    const content = `门外突然响起第三次敲门声。\n“谁？”林岚问。\n没有人回答。\n她把名单翻到最后一页，发现自己的名字刚刚出现。\n这一次，她决定主动开门查清真相。` + '推进线索。'.repeat(550);
    db.prepare('INSERT INTO chapters VALUES (?,?,?,?,?,?)').run(`c${i}`, 'p', i, 3300, content, 'completed');
    db.prepare('INSERT INTO writing_quality_reports VALUES (?,?,?,?)').run(`r${i}`, `c${i}`, 90, `2026-09-${String(i).padStart(2, '0')}`);
    db.prepare('INSERT INTO writing_revision_records VALUES (?,?)').run(`v${i}`, `c${i}`);
  }
  return db;
}

describe('empiricalPlatformBenchmark', () => {
  it('uses a local high-quality cohort only after five qualified chapters', () => {
    const db = fixture(5);
    try {
      const result = empiricalPlatformBenchmark(db, { platform: 'fanqie', storyType: 'short_story' });
      expect(result.available).toBe(true);
      expect(result.groups).toHaveLength(1);
      expect(result.groups[0].source).toBe('local_high_quality_cohort');
      expect(result.groups[0].empirical.sampleCount).toBe(5);
      expect(result.groups[0].sourceNote).toContain('不等同于商业爆款销量数据');
    } finally { db.close(); }
  });

  it('falls back to the industry baseline when evidence is insufficient', () => {
    const db = fixture(4);
    try {
      const result = empiricalPlatformBenchmark(db);
      expect(result.groups[0].source).toBe('industry_baseline');
      expect(result.groups[0].empirical).toBeNull();
      expect(result.groups[0].sourceNote).toContain('不得称为实时爆款实测');
    } finally { db.close(); }
  });
});
