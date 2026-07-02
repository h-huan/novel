/**
 * Migration 010: 修复 migration 009 的 bug + 确保所有必需字段存在
 * - 修复 009 中 foreshadowings → foreshadowings 的拼写错误
 * - 确保 characters 表有 role 字段
 * - 确保 foreshadowings 表有 scope 和 volume_index 字段
 */
import { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  // characters 表确保 role 字段存在
  try {
    const cols = db.prepare("PRAGMA table_info(characters)").all() as any[];
    if (!cols.find((c: any) => c.name === 'role')) {
      db.exec(`ALTER TABLE characters ADD COLUMN role TEXT DEFAULT 'supporting'`);
      console.log('[Migration 010] characters.role added');
    } else {
      console.log('[Migration 010] characters.role already exists');
    }
  } catch (e) { console.warn('[Migration 010] characters alter failed', e); }

  // foreshadowings 表确保 scope 字段存在
  try {
    const cols = db.prepare("PRAGMA table_info(foreshadowings)").all() as any[];
    
    if (!cols.find((c: any) => c.name === 'scope')) {
      db.exec(`ALTER TABLE foreshadowings ADD COLUMN scope TEXT DEFAULT 'chapter'`);
      console.log('[Migration 010] foreshadowings.scope added');
    } else {
      console.log('[Migration 010] foreshadowings.scope already exists');
    }
    
    if (!cols.find((c: any) => c.name === 'volume_index')) {
      db.exec(`ALTER TABLE foreshadowings ADD COLUMN volume_index INTEGER DEFAULT 0`);
      console.log('[Migration 010] foreshadowings.volume_index added');
    } else {
      console.log('[Migration 010] foreshadowings.volume_index already exists');
    }
  } catch (e) { console.warn('[Migration 010] foreshadowings alter failed', e); }
}

export function down(db: DatabaseSync): void {
  console.log('[Migration 010] rollback: SQLite cannot DROP COLUMN, manual intervention required');
}
