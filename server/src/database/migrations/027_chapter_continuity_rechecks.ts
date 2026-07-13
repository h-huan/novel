import type { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  db.exec(`
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
    ALTER TABLE chapter_derived_sync_states ADD COLUMN foreshadowing_sync_status TEXT NOT NULL DEFAULT 'pending';
    ALTER TABLE chapter_derived_sync_states ADD COLUMN timeline_sync_status TEXT NOT NULL DEFAULT 'pending';
    ALTER TABLE chapter_derived_sync_states ADD COLUMN outline_sync_status TEXT NOT NULL DEFAULT 'pending';
  `);
}

export function down(db: DatabaseSync): void {
  db.exec(`
    DROP INDEX IF EXISTS idx_chapter_continuity_reviews_gate;
    DROP TABLE IF EXISTS chapter_continuity_reviews;
  `);
}
