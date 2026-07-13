import type { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  const columns = db.prepare('PRAGMA table_info(aggregate_summary_states)').all() as Array<{ name: string }>;
  const add = (name: string, definition: string) => {
    if (!columns.some((column) => column.name === name)) db.exec(`ALTER TABLE aggregate_summary_states ADD COLUMN ${definition}`);
  };
  add('scope_key', 'scope_key TEXT');
  add('summary', 'summary TEXT');
  add('source_fingerprint', 'source_fingerprint TEXT');
  add('source_count', 'source_count INTEGER NOT NULL DEFAULT 0');
  add('source', "source TEXT NOT NULL DEFAULT 'ai'");
  add('status', "status TEXT NOT NULL DEFAULT 'stale'");
  add('generated_at', 'generated_at TEXT');
  add('last_error', 'last_error TEXT');
  db.exec(`UPDATE aggregate_summary_states
    SET scope_key = CASE WHEN scope = 'novel' THEN 'novel' ELSE 'volume:' || volume_index END
    WHERE scope_key IS NULL OR scope_key = ''`);
  // Keep one canonical novel row before enforcing the project/scope identity.
  db.exec(`DELETE FROM aggregate_summary_states WHERE scope = 'novel' AND id NOT IN (
    SELECT MIN(id) FROM aggregate_summary_states WHERE scope = 'novel' GROUP BY project_id
  )`);
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_aggregate_summary_states_project_scope_key ON aggregate_summary_states(project_id, scope_key)');
}

export function down(db: DatabaseSync): void {
  db.exec('DROP INDEX IF EXISTS idx_aggregate_summary_states_project_scope_key');
}
