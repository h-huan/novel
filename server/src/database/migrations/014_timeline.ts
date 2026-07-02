/**
 * 014_timeline - 创建时间线相关表
 */
import type { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  // 创建时间线表
  db.exec(`
    CREATE TABLE IF NOT EXISTS timelines (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      start_date TEXT,
      end_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // 创建时间线事件表
  db.exec(`
    CREATE TABLE IF NOT EXISTS timeline_events (
      id TEXT PRIMARY KEY,
      timeline_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      event_date TEXT,
      event_type TEXT DEFAULT 'story',
      importance INTEGER DEFAULT 1,
      related_character_ids TEXT,
      related_chapter_ids TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (timeline_id) REFERENCES timelines(id) ON DELETE CASCADE
    )
  `);

  // 创建索引
  db.exec(`CREATE INDEX IF NOT EXISTS idx_timelines_project ON timelines(project_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_timeline_events_timeline ON timeline_events(timeline_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_timeline_events_date ON timeline_events(event_date)`);
}

export function down(db: DatabaseSync): void {
  db.exec(`DROP TABLE IF EXISTS timeline_events`);
  db.exec(`DROP TABLE IF EXISTS timelines`);
}
