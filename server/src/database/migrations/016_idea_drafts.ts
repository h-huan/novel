/**
 * 016_idea_drafts - 新增想法草稿表
 *
 * 新增表：
 * - idea_drafts        想法孵化草稿
 *
 * 用于 Idea Lab 流程：用户输入原始想法 → AI 追问 → 用户回答 → AI 完善 → 确认 → 转项目
 */
import type { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  // 检查表是否已存在
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='idea_drafts'"
  ).all() as { name: string }[];

  if (tables.length > 0) {
    console.log('[Migration 016] idea_drafts table already exists, skipping');
    return;
  }

  db.exec(`
    CREATE TABLE idea_drafts (
      id TEXT PRIMARY KEY,
      raw_idea TEXT NOT NULL,
      title TEXT DEFAULT '',
      project_type TEXT NOT NULL DEFAULT 'long_novel',
      target_platform TEXT DEFAULT 'generic',
      target_words INTEGER DEFAULT 0,
      description TEXT DEFAULT '',
      status TEXT DEFAULT 'draft',
      questions_json TEXT DEFAULT '[]',
      answers_json TEXT DEFAULT '[]',
      refined_idea_json TEXT DEFAULT '{}',
      maturity_score INTEGER DEFAULT 0,
      maturity_report_json TEXT DEFAULT '{}',
      confirmed_idea TEXT DEFAULT '',
      converted_project_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  console.log('[Migration 016] Created idea_drafts table');

  // 创建索引
  try {
    db.exec(`CREATE INDEX idx_idea_drafts_status ON idea_drafts(status)`);
    db.exec(`CREATE INDEX idx_idea_drafts_converted ON idea_drafts(converted_project_id)`);
    console.log('[Migration 016] Created indexes on idea_drafts');
  } catch (e) {
    console.warn('[Migration 016] Index creation failed (non-fatal)', e);
  }
}

export function down(db: DatabaseSync): void {
  try {
    db.exec(`DROP TABLE IF EXISTS idea_drafts`);
    console.log('[Migration 016] Dropped idea_drafts table');
  } catch (e) {
    console.warn('[Migration 016] Drop table failed', e);
  }
}
