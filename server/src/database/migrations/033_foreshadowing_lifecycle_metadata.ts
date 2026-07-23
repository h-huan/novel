import { DatabaseSync } from 'node:sqlite';

function addColumn(db: DatabaseSync, name: string, definition: string): void {
  const columns = db.prepare('PRAGMA table_info(foreshadowings)').all() as Array<{ name: string }>;
  if (!columns.some(column => column.name === name)) {
    db.exec(`ALTER TABLE foreshadowings ADD COLUMN ${name} ${definition}`);
  }
}

export function up(db: DatabaseSync): void {
  addColumn(db, 'recovery_window_start', 'INTEGER');
  addColumn(db, 'recovery_window_end', 'INTEGER');
  addColumn(db, 'evidence_text', "TEXT DEFAULT ''");
  addColumn(db, 'risk_level', "TEXT DEFAULT 'medium'");
}

export function down(_db: DatabaseSync): void {
  // SQLite requires a table rebuild to remove columns. These nullable fields
  // remain backward-compatible when rolling application code back.
}

export default { up, down };
