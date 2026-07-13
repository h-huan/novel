import type { DatabaseSync } from 'node:sqlite';
export function up(db: DatabaseSync): void {
  const columns = db.prepare('PRAGMA table_info(aggregate_summary_states)').all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === 'diagnostics')) db.exec('ALTER TABLE aggregate_summary_states ADD COLUMN diagnostics TEXT');
}
export function down(_db: DatabaseSync): void {}
