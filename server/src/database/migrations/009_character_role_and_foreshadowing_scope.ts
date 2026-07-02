/**
 * Migration 009: 角色层级 + 伏笔作用范围
 * - characters 表增加 role 字段（protagonist/major/supporting/minor）
 * - foreshadowings 表增加 scope 字段（global/volume/chapter）
 * - foreshadowings 表增加 volume_index 字段
 */
import { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  // characters 表加 role 字段
  try {
    const cols = db.prepare("PRAGMA table_info(characters)").all() as any[];
    if (!cols.find((c: any) => c.name === 'role')) {
      db.exec(`ALTER TABLE characters ADD COLUMN role TEXT DEFAULT 'supporting'`);
      console.log('[Migration 009] characters.role added');
    }
  } catch (e) { console.warn('[Migration 009] characters alter failed', e); }

  // foreshadowings 表加 scope 和 volume_index 字段
  try {
    const cols = db.prepare("PRAGMA table_info(foreshadowings)").all() as any[];
    if (!cols.find((c: any) => c.name === 'scope')) {
      db.exec(`ALTER TABLE foreshadowings ADD COLUMN scope TEXT DEFAULT 'chapter'`);
      console.log('[Migration 009] foreshadowings.scope added');
    }
    if (!cols.find((c: any) => c.name === 'volume_index')) {
      db.exec(`ALTER TABLE foreshadowings ADD COLUMN volume_index INTEGER DEFAULT 0`);
      console.log('[Migration 009] foreshadowings.volume_index added');
    }
  } catch (e) { console.warn('[Migration 009] foreshadowings alter failed', e); }
}

export function down(db: DatabaseSync): void {
  console.log('[Migration 009] rollback: SQLite cannot DROP COLUMN, manual intervention required');
}
