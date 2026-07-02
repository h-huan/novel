/**
 * 003_inspirations - 灵感表
 */
import type { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS inspirations (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      title TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'generic',
      hook TEXT DEFAULT '',
      description TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      characters TEXT DEFAULT '[]',
      setting TEXT DEFAULT '',
      estimated_words INTEGER DEFAULT 3000,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_insp_status ON inspirations(status);
    CREATE INDEX IF NOT EXISTS idx_insp_project ON inspirations(project_id);
    CREATE INDEX IF NOT EXISTS idx_insp_platform ON inspirations(platform);
  `);

  console.log('[Migration 003] Created inspirations table.');
}

export function down(db: DatabaseSync): void {
  db.exec(`DROP TABLE IF EXISTS inspirations`);
  console.log('[Migration 003] Dropped inspirations table.');
}
