import type { DatabaseSync } from 'node:sqlite';
export function up(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS generation_runs (
    id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    stage TEXT NOT NULL, scenario TEXT NOT NULL, status TEXT NOT NULL,
    constitution_revision INTEGER, constitution_json TEXT,
    prompt_version TEXT NOT NULL, context_version TEXT NOT NULL,
    model TEXT, output_text TEXT, error TEXT,
    started_at TEXT NOT NULL, finished_at TEXT, duration_ms INTEGER,
    gate_status TEXT NOT NULL DEFAULT 'not_evaluated'
  );
  CREATE INDEX IF NOT EXISTS idx_generation_runs_project ON generation_runs(project_id, started_at);`);
}
export function down(db: DatabaseSync) { db.exec('DROP TABLE IF EXISTS generation_runs'); }
