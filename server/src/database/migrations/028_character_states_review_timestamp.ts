import type { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  const columns = db.prepare('PRAGMA table_info(character_states)').all() as Array<{ name: string }>;
  if (!columns.some(column => column.name === 'updated_at')) {
    db.exec("ALTER TABLE character_states ADD COLUMN updated_at TEXT");
    db.exec("UPDATE character_states SET updated_at = COALESCE(reviewed_at, created_at, datetime('now')) WHERE updated_at IS NULL");
  }
}

export function down(_db: DatabaseSync): void {
  // SQLite cannot remove a column without rebuilding the table.
}
