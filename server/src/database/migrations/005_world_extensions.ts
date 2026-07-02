/**
 * 005_world_extensions - 补充 world_settings 缺失列 + 创建 organizations/map_points 表
 *
 * 修复项目创建写入失败的问题：
 * 1. world_settings 缺少 rules 和 atmosphere 列
 * 2. organizations 和 map_points 表不存在
 */
import type { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  db.exec(`

    -- ═══════════════════════════════════════════
    -- 补充 world_settings 缺失列
    -- ═══════════════════════════════════════════
    ALTER TABLE world_settings ADD COLUMN rules TEXT DEFAULT '[]';
    ALTER TABLE world_settings ADD COLUMN atmosphere TEXT DEFAULT '';

    -- ═══════════════════════════════════════════
    -- 组织/势力表
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT DEFAULT '',
      description TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_org_project ON organizations(project_id);

    -- ═══════════════════════════════════════════
    -- 地图地点表
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS map_points (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT DEFAULT '',
      description TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_map_project ON map_points(project_id);

  `);

  console.log('[Migration 005] Added world_settings columns, created organizations & map_points tables.');
}

export function down(db: DatabaseSync): void {
  // SQLite 不支持 DROP COLUMN，只删除表
  db.exec(`
    DROP TABLE IF EXISTS map_points;
    DROP TABLE IF EXISTS organizations;
  `);
  console.log('[Migration 005] Dropped organizations & map_points tables.');
}
