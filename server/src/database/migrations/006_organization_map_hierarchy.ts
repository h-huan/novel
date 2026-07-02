/**
 * 006_organization_map_hierarchy - 为 organizations / map_points 增加层级与关联字段
 *
 * - organizations: parent_id, level
 * - map_points: parent_id, level, coordinates, linked_chapter_ids, linked_character_ids
 *
 * SQLite 的 ALTER TABLE ADD COLUMN 不支持 IF NOT EXISTS，
 * 因此用 PRAGMA table_info 检查列是否已存在，避免重复执行报错。
 */
import type { DatabaseSync } from 'node:sqlite';

/** 检查表中是否已存在指定列 */
function columnExists(db: DatabaseSync, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some((r) => r.name === column);
}

/** 安全添加列（已存在则跳过） */
function addColumnIfMissing(
  db: DatabaseSync,
  table: string,
  column: string,
  definition: string,
): void {
  if (!columnExists(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
    console.log(`[Migration 006] Added column ${table}.${column}`);
  } else {
    console.log(`[Migration 006] Column ${table}.${column} already exists, skipped.`);
  }
}

export function up(db: DatabaseSync): void {
  // ═══════════════════════════════════════════
  // organizations 表加列
  // ═══════════════════════════════════════════
  addColumnIfMissing(db, 'organizations', 'parent_id', 'TEXT');
  addColumnIfMissing(db, 'organizations', 'level', "TEXT DEFAULT ''");

  // ═══════════════════════════════════════════
  // map_points 表加列
  // ═══════════════════════════════════════════
  addColumnIfMissing(db, 'map_points', 'parent_id', 'TEXT');
  addColumnIfMissing(db, 'map_points', 'level', "TEXT DEFAULT 'location'");
  addColumnIfMissing(db, 'map_points', 'coordinates', 'TEXT');
  addColumnIfMissing(db, 'map_points', 'linked_chapter_ids', "TEXT DEFAULT '[]'");
  addColumnIfMissing(db, 'map_points', 'linked_character_ids', "TEXT DEFAULT '[]'");

  // ═══════════════════════════════════════════
  // 索引
  // ═══════════════════════════════════════════
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_org_parent ON organizations(parent_id);
    CREATE INDEX IF NOT EXISTS idx_map_parent ON map_points(parent_id);
    CREATE INDEX IF NOT EXISTS idx_map_level ON map_points(level);
  `);

  console.log('[Migration 006] Added hierarchy columns & indexes to organizations & map_points.');
}

export function down(db: DatabaseSync): void {
  // SQLite 不支持 DROP COLUMN（旧版本），仅删除索引
  db.exec(`
    DROP INDEX IF EXISTS idx_map_level;
    DROP INDEX IF EXISTS idx_map_parent;
    DROP INDEX IF EXISTS idx_org_parent;
  `);
  console.log('[Migration 006] Dropped hierarchy indexes (columns remain — SQLite cannot DROP COLUMN).');
}
