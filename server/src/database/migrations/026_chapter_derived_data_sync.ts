import type { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chapter_summaries (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL UNIQUE,
      content_checksum TEXT NOT NULL,
      summary TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'ai',
      status TEXT NOT NULL DEFAULT 'current',
      generated_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chapter_summaries_project
      ON chapter_summaries(project_id, status);

    CREATE TABLE IF NOT EXISTS aggregate_summary_states (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      volume_index INTEGER,
      stale INTEGER NOT NULL DEFAULT 1,
      stale_reason TEXT,
      source_chapter_id TEXT,
      source_chapter_checksum TEXT,
      stale_at TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE(project_id, scope, volume_index)
    );
    CREATE INDEX IF NOT EXISTS idx_aggregate_summary_states_project
      ON aggregate_summary_states(project_id, scope, stale);

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
    CREATE INDEX IF NOT EXISTS idx_chapter_derived_sync_pending
      ON chapter_derived_sync_states(project_id, needs_resync);
  `);
}

export function down(db: DatabaseSync): void {
  db.exec(`
    DROP INDEX IF EXISTS idx_chapter_derived_sync_pending;
    DROP TABLE IF EXISTS chapter_derived_sync_states;
    DROP INDEX IF EXISTS idx_aggregate_summary_states_project;
    DROP TABLE IF EXISTS aggregate_summary_states;
    DROP INDEX IF EXISTS idx_chapter_summaries_project;
    DROP TABLE IF EXISTS chapter_summaries;
  `);
}
