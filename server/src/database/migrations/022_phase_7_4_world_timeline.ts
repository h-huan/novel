/**
 * 022_phase_7_4_world_timeline
 *
 * Adds structured world-rule and timeline-three-line tables while preserving
 * legacy timeline / world / state data for read-only compatibility.
 */
import type { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_rules (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      rule_type TEXT NOT NULL DEFAULT 'law',
      scope TEXT NOT NULL DEFAULT 'full_book',
      volume_index INTEGER,
      content TEXT,
      explanation TEXT,
      limitation TEXT,
      contradiction_risk TEXT,
      status TEXT NOT NULL DEFAULT 'planned',
      risk_level TEXT NOT NULL DEFAULT 'none',
      first_established_chapter_id TEXT,
      last_verified_chapter_id TEXT,
      related_character_ids TEXT DEFAULT '[]',
      related_relationship_ids TEXT DEFAULT '[]',
      related_foreshadowing_ids TEXT DEFAULT '[]',
      related_timeline_event_ids TEXT DEFAULT '[]',
      review_status TEXT NOT NULL DEFAULT 'pending',
      locked INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'manual',
      confidence REAL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_world_rules_project
      ON world_rules(project_id);
    CREATE INDEX IF NOT EXISTS idx_world_rules_type
      ON world_rules(project_id, rule_type);
    CREATE INDEX IF NOT EXISTS idx_world_rules_status
      ON world_rules(project_id, status);
    CREATE INDEX IF NOT EXISTS idx_world_rules_review
      ON world_rules(project_id, review_status);

    CREATE TABLE IF NOT EXISTS world_rule_events (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      rule_id TEXT NOT NULL,
      chapter_id TEXT,
      event_type TEXT NOT NULL DEFAULT 'other',
      summary TEXT,
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

    CREATE INDEX IF NOT EXISTS idx_world_rule_events_rule
      ON world_rule_events(project_id, rule_id);
    CREATE INDEX IF NOT EXISTS idx_world_rule_events_chapter
      ON world_rule_events(project_id, chapter_id);

    CREATE TABLE IF NOT EXISTS world_rule_chapter_tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      rule_id TEXT NOT NULL,
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

    CREATE INDEX IF NOT EXISTS idx_world_rule_tasks_rule
      ON world_rule_chapter_tasks(project_id, rule_id);
    CREATE INDEX IF NOT EXISTS idx_world_rule_tasks_chapter
      ON world_rule_chapter_tasks(project_id, chapter_id);
    CREATE INDEX IF NOT EXISTS idx_world_rule_tasks_review
      ON world_rule_chapter_tasks(project_id, review_status);

    CREATE TABLE IF NOT EXISTS timeline_three_line_events (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      legacy_timeline_event_id TEXT,
      title TEXT NOT NULL,
      summary TEXT,
      line_type TEXT NOT NULL DEFAULT 'story_time',
      chapter_id TEXT,
      volume_index INTEGER,
      chapter_index INTEGER,
      story_time_text TEXT,
      story_time_order REAL,
      narrative_order INTEGER,
      causality_order INTEGER,
      location TEXT,
      participants_character_ids TEXT DEFAULT '[]',
      related_relationship_ids TEXT DEFAULT '[]',
      related_foreshadowing_ids TEXT DEFAULT '[]',
      related_world_rule_ids TEXT DEFAULT '[]',
      reader_known_state TEXT NOT NULL DEFAULT 'unknown',
      character_known_state TEXT NOT NULL DEFAULT 'unknown',
      status TEXT NOT NULL DEFAULT 'planned',
      risk_level TEXT NOT NULL DEFAULT 'none',
      risk_reason TEXT,
      review_status TEXT NOT NULL DEFAULT 'pending',
      locked INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'manual',
      confidence REAL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_timeline_events_project
      ON timeline_three_line_events(project_id);
    CREATE INDEX IF NOT EXISTS idx_timeline_events_line_type
      ON timeline_three_line_events(project_id, line_type);
    CREATE INDEX IF NOT EXISTS idx_timeline_events_chapter
      ON timeline_three_line_events(project_id, chapter_id);
    CREATE INDEX IF NOT EXISTS idx_timeline_events_review
      ON timeline_three_line_events(project_id, review_status);

    CREATE TABLE IF NOT EXISTS timeline_causality_links (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      source_event_id TEXT NOT NULL,
      target_event_id TEXT NOT NULL,
      link_type TEXT NOT NULL DEFAULT 'cause',
      summary TEXT,
      evidence TEXT,
      risk_level TEXT NOT NULL DEFAULT 'none',
      risk_reason TEXT,
      review_status TEXT NOT NULL DEFAULT 'pending',
      locked INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'manual',
      confidence REAL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_timeline_causality_source
      ON timeline_causality_links(project_id, source_event_id);
    CREATE INDEX IF NOT EXISTS idx_timeline_causality_target
      ON timeline_causality_links(project_id, target_event_id);

    CREATE TABLE IF NOT EXISTS timeline_chapter_tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      task_type TEXT NOT NULL DEFAULT 'check_order',
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

    CREATE INDEX IF NOT EXISTS idx_timeline_tasks_event
      ON timeline_chapter_tasks(project_id, event_id);
    CREATE INDEX IF NOT EXISTS idx_timeline_tasks_chapter
      ON timeline_chapter_tasks(project_id, chapter_id);
    CREATE INDEX IF NOT EXISTS idx_timeline_tasks_review
      ON timeline_chapter_tasks(project_id, review_status);
  `);

  console.log('[Migration 022] Added Phase 7.4 world rule and timeline three-line tables.');
}

export function down(_db: DatabaseSync): void {
  console.log('[Migration 022] Down migration intentionally preserves Phase 7.4 tables.');
}
