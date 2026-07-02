/**
 * 011_state_confirmations - 统一状态确稿队列
 *
 * AI生成正文后，世界观、角色、组织、时间线/状态、大纲、伏笔等变更
 * 先进入待确稿队列。作者确认后，才允许这些状态进入后续RAG上下文。
 */
import type { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS state_confirmations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      source_chapter_id TEXT,
      target_type TEXT NOT NULL,
      target_id TEXT,
      target_label TEXT NOT NULL,
      summary TEXT NOT NULL,
      payload TEXT DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      created_by TEXT NOT NULL DEFAULT 'auto_extract',
      confirmed_by TEXT,
      confirmed_at TEXT,
      rejected_by TEXT,
      rejected_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sc_project_status ON state_confirmations(project_id, status);
    CREATE INDEX IF NOT EXISTS idx_sc_target ON state_confirmations(project_id, target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_sc_chapter ON state_confirmations(project_id, source_chapter_id);
  `);
  console.log('[Migration 011] Created state_confirmations table.');
}

export function down(db: DatabaseSync): void {
  db.exec(`DROP TABLE IF EXISTS state_confirmations;`);
  console.log('[Migration 011] Dropped state_confirmations table.');
}
