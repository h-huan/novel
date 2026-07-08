/**
 * 019_phase_6_9_creative_core
 *
 * Phase 6.9 adds creative-core density fields without breaking existing data.
 * All additions are nullable/JSON extension columns so old rows remain valid.
 */
import type { DatabaseSync } from 'node:sqlite';

function hasColumn(db: DatabaseSync, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some(row => row.name === column);
}

function addColumn(db: DatabaseSync, table: string, column: string, definition: string): void {
  if (!hasColumn(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function up(db: DatabaseSync): void {
  addColumn(db, 'writing_quality_reports', 'attention_json', "TEXT DEFAULT '{}'");
  addColumn(db, 'writing_quality_reports', 'view_state_json', "TEXT DEFAULT '{}'");

  addColumn(db, 'writing_quality_issues', 'latest_revision_id', 'TEXT');
  addColumn(db, 'writing_quality_issues', 'recheck_result_json', "TEXT DEFAULT '{}'");
  addColumn(db, 'writing_quality_issues', 'navigation_json', "TEXT DEFAULT '{}'");
  addColumn(db, 'writing_quality_issues', 'status_history_json', "TEXT DEFAULT '[]'");

  addColumn(db, 'writing_revision_records', 'recheck_result_json', "TEXT DEFAULT '{}'");
  addColumn(db, 'writing_revision_records', 'can_apply', 'INTEGER DEFAULT 1');

  addColumn(db, 'outlines', 'detail_json', "TEXT DEFAULT '{}'");
  addColumn(db, 'outlines', 'attention_json', "TEXT DEFAULT '{}'");
  addColumn(db, 'outlines', 'plan_json', "TEXT DEFAULT '{}'");

  addColumn(db, 'characters', 'density_profile_json', "TEXT DEFAULT '{}'");
  addColumn(db, 'world_settings', 'rule_system_json', "TEXT DEFAULT '{}'");
  addColumn(db, 'foreshadowings', 'chain_json', "TEXT DEFAULT '{}'");
  addColumn(db, 'foreshadowings', 'recovery_window_json', "TEXT DEFAULT '{}'");
  addColumn(db, 'foreshadowings', 'density_json', "TEXT DEFAULT '{}'");
  addColumn(db, 'timeline_events', 'time_model_json', "TEXT DEFAULT '{}'");
  addColumn(db, 'timeline_events', 'causality_json', "TEXT DEFAULT '{}'");
  addColumn(db, 'timeline_events', 'visibility_json', "TEXT DEFAULT '{}'");

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_wqi_latest_revision
      ON writing_quality_issues(latest_revision_id);
    CREATE INDEX IF NOT EXISTS idx_wqi_project_status
      ON writing_quality_issues(project_id, status);
  `);

  console.log('[Migration 019] Added Phase 6.9 creative core extension columns.');
}

export function down(_db: DatabaseSync): void {
  console.log('[Migration 019] Down migration intentionally preserves extension columns.');
}
