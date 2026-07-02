/**
 * 012_plot_progress_review - 情节/时间线状态确稿标记
 *
 * 自动提取的 plot_progress 先进入待确稿状态，作者确认后才进入后续生成上下文。
 */
import type { DatabaseSync } from 'node:sqlite';

function addColumnIfMissing(db: DatabaseSync, table: string, column: string, definition: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some(col => col.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`[Migration 012] ${table}.${column} added`);
  } else {
    console.log(`[Migration 012] ${table}.${column} already exists`);
  }
}

export function up(db: DatabaseSync): void {
  addColumnIfMissing(db, 'plot_progress', 'needs_review', 'INTEGER DEFAULT 0');
  addColumnIfMissing(db, 'plot_progress', 'reviewed_by', 'TEXT');
  addColumnIfMissing(db, 'plot_progress', 'reviewed_at', 'TEXT');

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_pp_review
    ON plot_progress(project_id, needs_review);
  `);

  console.log('[Migration 012] Added plot_progress review fields.');
}

export function down(db: DatabaseSync): void {
  db.exec('DROP INDEX IF EXISTS idx_pp_review;');
  console.log('[Migration 012] rollback: SQLite cannot DROP COLUMN, review fields remain.');
}
