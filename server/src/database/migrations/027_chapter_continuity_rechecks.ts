import type { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chapter_derived_sync_states (
      chapter_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      content_checksum TEXT NOT NULL,
      summary_sync_status TEXT NOT NULL DEFAULT 'pending',
      vector_sync_status TEXT NOT NULL DEFAULT 'pending',
      needs_resync INTEGER NOT NULL DEFAULT 1,
      last_error TEXT,
      last_attempt_at TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chapter_continuity_reviews (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      content_checksum TEXT NOT NULL,
      review_type TEXT NOT NULL,
      issue_type TEXT NOT NULL,
      target_id TEXT NOT NULL DEFAULT '',
      requirement TEXT,
      old_evidence TEXT,
      new_evidence TEXT,
      change_type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'medium',
      blocks_lock INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      state_item_id TEXT,
      payload TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(chapter_id, content_checksum, review_type, issue_type, target_id)
    );
    CREATE INDEX IF NOT EXISTS idx_chapter_continuity_reviews_gate
      ON chapter_continuity_reviews(project_id, chapter_id, content_checksum, blocks_lock, status);
  `);
  addColumnIfMissing(db, 'chapter_derived_sync_states', 'foreshadowing_sync_status', "TEXT NOT NULL DEFAULT 'pending'");
  addColumnIfMissing(db, 'chapter_derived_sync_states', 'timeline_sync_status', "TEXT NOT NULL DEFAULT 'pending'");
  addColumnIfMissing(db, 'chapter_derived_sync_states', 'outline_sync_status', "TEXT NOT NULL DEFAULT 'pending'");
  addColumnIfMissing(db, 'chapter_derived_sync_states', 'needs_author_review', 'INTEGER NOT NULL DEFAULT 0');
}

export function down(db: DatabaseSync): void {
  // SQLite cannot safely remove the four added columns without rebuilding the
  // table. Preserve them and all existing sync-state data; only owned objects
  // that are safely reversible are removed.
  db.exec(`
    DROP INDEX IF EXISTS idx_chapter_continuity_reviews_gate;
    DROP TABLE IF EXISTS chapter_continuity_reviews;
  `);
}

function hasColumn(db: DatabaseSync, tableName: string, columnName: string): boolean {
  return (db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>)
    .some((column) => column.name === columnName);
}

function addColumnIfMissing(db: DatabaseSync, tableName: string, columnName: string, definition: string): void {
  if (!hasColumn(db, tableName, columnName)) db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}
