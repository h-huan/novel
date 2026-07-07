/**
 * 017_state_items_and_evolution - state confirmation center and character evolution engine
 */
import type { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS state_items (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'ai',
      source_id TEXT,
      source_chapter_id TEXT,
      target_type TEXT NOT NULL,
      target_id TEXT,
      target_label TEXT,
      state_key TEXT,
      title TEXT,
      summary TEXT NOT NULL,
      content TEXT,
      payload TEXT DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      authority TEXT NOT NULL DEFAULT 'soft_candidate',
      source TEXT NOT NULL DEFAULT 'ai_extracted',
      confidence REAL DEFAULT 0.6,
      tags TEXT DEFAULT '[]',
      impact_scope TEXT DEFAULT '[]',
      summary_hash TEXT NOT NULL,
      created_by TEXT DEFAULT 'system',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      confirmed_by TEXT,
      confirmed_at TEXT,
      rejected_by TEXT,
      rejected_at TEXT,
      archived_at TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_state_items_dedupe
      ON state_items(project_id, target_type, IFNULL(target_id, ''), summary_hash);
    CREATE INDEX IF NOT EXISTS idx_state_items_project_status
      ON state_items(project_id, status, updated_at);
    CREATE INDEX IF NOT EXISTS idx_state_items_target
      ON state_items(project_id, target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_state_items_source_chapter
      ON state_items(project_id, source_chapter_id);

    CREATE TABLE IF NOT EXISTS character_evolution_events (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      character_id TEXT,
      character_name TEXT,
      source_state_item_id TEXT,
      source_chapter_id TEXT,
      chapter_index INTEGER,
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      before_state TEXT DEFAULT '{}',
      after_state TEXT DEFAULT '{}',
      delta TEXT DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      confirmed_at TEXT,
      FOREIGN KEY (source_state_item_id) REFERENCES state_items(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_character_evolution_project_character
      ON character_evolution_events(project_id, character_id, chapter_index);
    CREATE INDEX IF NOT EXISTS idx_character_evolution_state_item
      ON character_evolution_events(source_state_item_id);

    CREATE TABLE IF NOT EXISTS state_impact_reports (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      source_state_item_id TEXT,
      source_type TEXT NOT NULL DEFAULT 'manual_edit',
      summary TEXT NOT NULL,
      risk_level TEXT NOT NULL DEFAULT 'low',
      status TEXT NOT NULL DEFAULT 'open',
      created_by TEXT DEFAULT 'author',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      payload TEXT DEFAULT '{}',
      FOREIGN KEY (source_state_item_id) REFERENCES state_items(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS state_impact_items (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      impact_type TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      target_label TEXT,
      summary TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'pending',
      action_hint TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      applied_at TEXT,
      payload TEXT DEFAULT '{}',
      FOREIGN KEY (report_id) REFERENCES state_impact_reports(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_state_impact_reports_project
      ON state_impact_reports(project_id, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_state_impact_items_report
      ON state_impact_items(report_id, status);
  `);

  console.log('[Migration 017] Created state_items, character_evolution_events, state_impact_reports, state_impact_items.');
}

export function down(db: DatabaseSync) {
  db.exec(`
    DROP TABLE IF EXISTS state_impact_items;
    DROP TABLE IF EXISTS state_impact_reports;
    DROP TABLE IF EXISTS character_evolution_events;
    DROP TABLE IF EXISTS state_items;
  `);
  console.log('[Migration 017] Dropped state confirmation center tables.');
}
