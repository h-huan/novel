/**
 * 013_foreshadowing_state_review - 伏笔状态确稿标记
 *
 * 自动提取的伏笔提及/状态变化先进入待确稿状态，作者确认后才进入后续生成上下文。
 */
import type { DatabaseSync } from 'node:sqlite';

function addColumnIfMissing(db: DatabaseSync, table: string, column: string, definition: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some(col => col.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`[Migration 013] ${table}.${column} added`);
  } else {
    console.log(`[Migration 013] ${table}.${column} already exists`);
  }
}

export function up(db: DatabaseSync): void {
  addColumnIfMissing(db, 'foreshadowing_states', 'needs_review', 'INTEGER DEFAULT 0');
  addColumnIfMissing(db, 'foreshadowing_states', 'reviewed_by', 'TEXT');
  addColumnIfMissing(db, 'foreshadowing_states', 'reviewed_at', 'TEXT');

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_fss_review
    ON foreshadowing_states(project_id, needs_review);
  `);

  console.log('[Migration 013] Added foreshadowing_states review fields.');
}

export function down(db: DatabaseSync): void {
  db.exec('DROP INDEX IF EXISTS idx_fss_review;');
  console.log('[Migration 013] rollback: SQLite cannot DROP COLUMN, review fields remain.');
}
