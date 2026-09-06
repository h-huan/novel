import type { DatabaseSync } from 'node:sqlite';
export function up(db: DatabaseSync) {
  db.exec('ALTER TABLE generation_runs ADD COLUMN standards_snapshot TEXT');
}
export function down(db: DatabaseSync) {
  db.exec('ALTER TABLE generation_runs DROP COLUMN standards_snapshot');
}
