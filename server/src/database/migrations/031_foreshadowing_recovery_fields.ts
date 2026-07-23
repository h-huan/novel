import { DatabaseSync } from 'node:sqlite';

function addColumn(db: DatabaseSync, name: string, definition: string): void {
  const columns = db.prepare('PRAGMA table_info(foreshadowings)').all() as Array<{ name: string }>;
  if (!columns.some(column => column.name === name)) {
    db.exec(`ALTER TABLE foreshadowings ADD COLUMN ${name} ${definition}`);
  }
}

export function up(db: DatabaseSync): void {
  addColumn(db, 'recovery_condition', "TEXT DEFAULT ''");
  addColumn(db, 'payoff_description', "TEXT DEFAULT ''");
}

export function down(_db: DatabaseSync): void {
  // SQLite column removal would require rebuilding the table. These optional
  // fields are backward-compatible and safe to retain during rollback.
}

export default { up, down };
