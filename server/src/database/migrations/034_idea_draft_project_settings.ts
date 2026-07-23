import type { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='idea_drafts'").get();
  if (!table) return;
  const columns = db.prepare('PRAGMA table_info(idea_drafts)').all() as Array<{ name: string }>;
  if (!columns.some(column => column.name === 'settings_json')) {
    db.exec("ALTER TABLE idea_drafts ADD COLUMN settings_json TEXT NOT NULL DEFAULT '{}'");
  }
}

export function down(_db: DatabaseSync): void {
  // SQLite compatibility: retain data-bearing column on rollback.
}
