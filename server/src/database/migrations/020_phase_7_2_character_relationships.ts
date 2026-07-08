/**
 * 020_phase_7_2_character_relationships
 *
 * Adds Phase 7.2 continuity tables for character state snapshots and
 * relationship continuity without changing existing project data.
 */
import type { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS character_state_snapshots (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      chapter_id TEXT,
      volume_index INTEGER,
      state_type TEXT NOT NULL,
      current_state TEXT,
      evidence TEXT,
      cause TEXT,
      action_impact TEXT,
      relation_impact TEXT,
      goal_impact TEXT,
      foreshadowing_impact TEXT,
      future_change TEXT,
      conflict_risk TEXT,
      review_status TEXT NOT NULL DEFAULT 'pending',
      source TEXT NOT NULL DEFAULT 'manual',
      confidence REAL DEFAULT 1,
      locked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_character_state_project_character
      ON character_state_snapshots(project_id, character_id);
    CREATE INDEX IF NOT EXISTS idx_character_state_project_chapter
      ON character_state_snapshots(project_id, chapter_id);
    CREATE INDEX IF NOT EXISTS idx_character_state_review
      ON character_state_snapshots(project_id, review_status);

    CREATE TABLE IF NOT EXISTS character_relationships (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      source_character_id TEXT NOT NULL,
      target_character_id TEXT NOT NULL,
      relation_type TEXT NOT NULL DEFAULT 'unknown',
      public_relation TEXT,
      hidden_relation TEXT,
      trust_score INTEGER DEFAULT 50,
      conflict_score INTEGER DEFAULT 0,
      emotional_tendency TEXT,
      interest_binding TEXT,
      first_chapter_id TEXT,
      latest_chapter_id TEXT,
      current_phase TEXT,
      reader_known_state TEXT NOT NULL DEFAULT 'unknown',
      source_known_state TEXT NOT NULL DEFAULT 'unknown',
      target_known_state TEXT NOT NULL DEFAULT 'unknown',
      change_summary TEXT,
      change_history_json TEXT DEFAULT '[]',
      related_foreshadowing_ids TEXT DEFAULT '[]',
      related_timeline_event_ids TEXT DEFAULT '[]',
      review_status TEXT NOT NULL DEFAULT 'pending',
      locked INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'manual',
      confidence REAL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_character_relationship_project
      ON character_relationships(project_id);
    CREATE INDEX IF NOT EXISTS idx_character_relationship_source
      ON character_relationships(project_id, source_character_id);
    CREATE INDEX IF NOT EXISTS idx_character_relationship_target
      ON character_relationships(project_id, target_character_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_character_relationship_unique
      ON character_relationships(project_id, source_character_id, target_character_id, relation_type);

    CREATE TABLE IF NOT EXISTS character_relationship_events (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      relationship_id TEXT NOT NULL,
      chapter_id TEXT,
      event_type TEXT NOT NULL DEFAULT 'other',
      summary TEXT,
      before_state_json TEXT DEFAULT '{}',
      after_state_json TEXT DEFAULT '{}',
      evidence TEXT,
      impact TEXT,
      review_status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_character_relationship_events_relationship
      ON character_relationship_events(project_id, relationship_id);
    CREATE INDEX IF NOT EXISTS idx_character_relationship_events_chapter
      ON character_relationship_events(project_id, chapter_id);
  `);

  console.log('[Migration 020] Added Phase 7.2 character continuity tables.');
}

export function down(_db: DatabaseSync): void {
  console.log('[Migration 020] Down migration intentionally preserves Phase 7.2 continuity tables.');
}
