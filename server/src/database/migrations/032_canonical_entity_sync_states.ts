import { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS canonical_entity_sync_states (
      project_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      index_status TEXT NOT NULL DEFAULT 'pending',
      needs_resync INTEGER NOT NULL DEFAULT 1,
      last_error TEXT,
      last_attempt_at TEXT,
      synced_at TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, entity_type, entity_id)
    );
    CREATE INDEX IF NOT EXISTS idx_canonical_sync_project_status
      ON canonical_entity_sync_states(project_id, needs_resync, index_status);
  `);
}

export function down(db: DatabaseSync): void {
  db.exec(`
    DROP INDEX IF EXISTS idx_canonical_sync_project_status;
    DROP TABLE IF EXISTS canonical_entity_sync_states;
  `);
}

export default { up, down };
