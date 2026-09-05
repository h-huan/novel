import type { DatabaseSync } from 'node:sqlite';
export function up(db: DatabaseSync) {
  db.exec(`ALTER TABLE generation_runs ADD COLUMN context_snapshot TEXT;
    ALTER TABLE generation_runs ADD COLUMN chapter_index INTEGER;
    ALTER TABLE generation_step_metrics ADD COLUMN run_id TEXT REFERENCES generation_runs(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_generation_step_run ON generation_step_metrics(run_id);`);
}
export function down(db: DatabaseSync) {
  db.exec(`DROP INDEX IF EXISTS idx_generation_step_run;
    ALTER TABLE generation_step_metrics DROP COLUMN run_id;
    ALTER TABLE generation_runs DROP COLUMN context_snapshot;
    ALTER TABLE generation_runs DROP COLUMN chapter_index;`);
}
