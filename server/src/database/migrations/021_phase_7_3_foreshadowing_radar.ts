/**
 * 021_phase_7_3_foreshadowing_radar
 *
 * Adds structured foreshadowing radar tables while preserving legacy
 * foreshadowings data for read-only compatibility.
 */
import type { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS foreshadowing_threads (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      legacy_foreshadowing_id TEXT,
      title TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'chapter',
      volume_index INTEGER,
      status TEXT NOT NULL DEFAULT 'planned',
      summary TEXT,
      reader_understanding TEXT,
      true_meaning TEXT,
      reveal_strategy TEXT,
      risk_level TEXT NOT NULL DEFAULT 'none',
      risk_reason TEXT,
      planned_bury_chapter_id TEXT,
      actual_bury_chapter_id TEXT,
      planned_deepen_chapter_ids TEXT DEFAULT '[]',
      planned_misdirect_chapter_ids TEXT DEFAULT '[]',
      recovery_window_start_chapter_id TEXT,
      recovery_window_end_chapter_id TEXT,
      actual_recovery_chapter_id TEXT,
      related_character_ids TEXT DEFAULT '[]',
      related_relationship_ids TEXT DEFAULT '[]',
      related_timeline_event_ids TEXT DEFAULT '[]',
      related_world_rule_ids TEXT DEFAULT '[]',
      review_status TEXT NOT NULL DEFAULT 'pending',
      locked INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'manual',
      confidence REAL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_foreshadowing_threads_project
      ON foreshadowing_threads(project_id);
    CREATE INDEX IF NOT EXISTS idx_foreshadowing_threads_status
      ON foreshadowing_threads(project_id, status);
    CREATE INDEX IF NOT EXISTS idx_foreshadowing_threads_review
      ON foreshadowing_threads(project_id, review_status);

    CREATE TABLE IF NOT EXISTS foreshadowing_lifecycle_events (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      chapter_id TEXT,
      event_type TEXT NOT NULL DEFAULT 'other',
      summary TEXT,
      reader_effect TEXT,
      true_effect TEXT,
      evidence TEXT,
      impact TEXT,
      before_state_json TEXT DEFAULT '{}',
      after_state_json TEXT DEFAULT '{}',
      review_status TEXT NOT NULL DEFAULT 'pending',
      source TEXT NOT NULL DEFAULT 'manual',
      confidence REAL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_foreshadowing_events_thread
      ON foreshadowing_lifecycle_events(project_id, thread_id);
    CREATE INDEX IF NOT EXISTS idx_foreshadowing_events_chapter
      ON foreshadowing_lifecycle_events(project_id, chapter_id);

    CREATE TABLE IF NOT EXISTS foreshadowing_chapter_tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      task_type TEXT NOT NULL DEFAULT 'check',
      priority TEXT NOT NULL DEFAULT 'medium',
      instruction TEXT,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'todo',
      review_status TEXT NOT NULL DEFAULT 'pending',
      source TEXT NOT NULL DEFAULT 'manual',
      locked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_foreshadowing_tasks_thread
      ON foreshadowing_chapter_tasks(project_id, thread_id);
    CREATE INDEX IF NOT EXISTS idx_foreshadowing_tasks_chapter
      ON foreshadowing_chapter_tasks(project_id, chapter_id);
    CREATE INDEX IF NOT EXISTS idx_foreshadowing_tasks_review
      ON foreshadowing_chapter_tasks(project_id, review_status);
  `);

  console.log('[Migration 021] Added Phase 7.3 foreshadowing radar tables.');
}

export function down(_db: DatabaseSync): void {
  console.log('[Migration 021] Down migration intentionally preserves foreshadowing radar tables.');
}
