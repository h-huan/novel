import { DatabaseSync } from 'node:sqlite';

// 048 — 角色字段级变动历史（手动 + 自动记录）。
export function up(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS character_profile_changes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    character_id TEXT NOT NULL,
    field_key TEXT NOT NULL,
    field_label TEXT NOT NULL DEFAULT '',
    before_value TEXT NOT NULL DEFAULT '',
    after_value TEXT NOT NULL DEFAULT '',
    chapter_index INTEGER,
    reason TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'manual',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_character_profile_changes_char ON character_profile_changes(project_id, character_id);`);
}

export function down(db: DatabaseSync): void {
  db.exec(`DROP TABLE IF EXISTS character_profile_changes;`);
}

export default { up, down };
