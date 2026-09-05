import type { DatabaseSync } from 'node:sqlite';
export function up(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS generation_repairs (
    id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES generation_runs(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    stage TEXT NOT NULL, status TEXT NOT NULL, strategy TEXT NOT NULL,
    before_text TEXT NOT NULL, after_text TEXT, before_score INTEGER, after_score INTEGER,
    before_report TEXT NOT NULL, after_report TEXT, reason TEXT NOT NULL, created_at TEXT NOT NULL
  ); CREATE INDEX IF NOT EXISTS idx_generation_repairs_project ON generation_repairs(project_id,created_at);`);
}
export function down(db: DatabaseSync) { db.exec('DROP TABLE IF EXISTS generation_repairs'); }
