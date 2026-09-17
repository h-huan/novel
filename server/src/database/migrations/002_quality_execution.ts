import type { DatabaseSync } from 'node:sqlite';
export function up(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS quality_benchmark_runs (
    id TEXT PRIMARY KEY, project_id TEXT, status TEXT NOT NULL,
    repair_requested INTEGER NOT NULL DEFAULT 0, sample_count INTEGER NOT NULL DEFAULT 0,
    completed_count INTEGER NOT NULL DEFAULT 0, failed_count INTEGER NOT NULL DEFAULT 0,
    results_json TEXT NOT NULL DEFAULT '[]', started_at TEXT NOT NULL, finished_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_benchmark_runs_project ON quality_benchmark_runs(project_id,started_at);
  CREATE TABLE IF NOT EXISTS quality_execution_schema (version INTEGER PRIMARY KEY, description TEXT NOT NULL);
  INSERT OR IGNORE INTO quality_execution_schema VALUES (2,'Versioned contracts, dependency context, narrative trace and executable benchmark');`);
  const columns = db.prepare('PRAGMA table_info(quality_benchmark_samples)').all() as any[];
  if (!columns.some(c => c.name === 'chapter_index')) db.exec('ALTER TABLE quality_benchmark_samples ADD COLUMN chapter_index INTEGER');
}
export function down(_db: DatabaseSync) { throw new Error('质量评测记录需保留；请备份后使用显式数据迁移回退'); }
export default { up, down };
