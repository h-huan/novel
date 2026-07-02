/**
 * 008_simple_world_settings - 添加短篇世界观字段
 *
 * 为 world_settings 表添加支持短篇模式的字段：
 * - story_premise: 故事前提
 * - locations: 核心地点（JSON数组）
 * - social_rules: 社会规则
 * - special_settings: 特殊设定
 * - setting_type: 设置类型（short/full）
 */
import type { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  // 添加 story_premise 字段
  try {
    db.exec(`ALTER TABLE world_settings ADD COLUMN story_premise TEXT DEFAULT ''`);
    console.log('[Migration 008] Added world_settings.story_premise.');
  } catch {
    console.log('[Migration 008] world_settings.story_premise already exists, skipped.');
  }

  // 添加 locations 字段（JSON数组）
  try {
    db.exec(`ALTER TABLE world_settings ADD COLUMN locations TEXT DEFAULT '[]'`);
    console.log('[Migration 008] Added world_settings.locations.');
  } catch {
    console.log('[Migration 008] world_settings.locations already exists, skipped.');
  }

  // 添加 social_rules 字段
  try {
    db.exec(`ALTER TABLE world_settings ADD COLUMN social_rules TEXT DEFAULT ''`);
    console.log('[Migration 008] Added world_settings.social_rules.');
  } catch {
    console.log('[Migration 008] world_settings.social_rules already exists, skipped.');
  }

  // 添加 special_settings 字段
  try {
    db.exec(`ALTER TABLE world_settings ADD COLUMN special_settings TEXT DEFAULT ''`);
    console.log('[Migration 008] Added world_settings.special_settings.');
  } catch {
    console.log('[Migration 008] world_settings.special_settings already exists, skipped.');
  }

  // 添加 setting_type 字段（short/full）
  try {
    db.exec(`ALTER TABLE world_settings ADD COLUMN setting_type TEXT DEFAULT 'full'`);
    console.log('[Migration 008] Added world_settings.setting_type.');
  } catch {
    console.log('[Migration 008] world_settings.setting_type already exists, skipped.');
  }

  console.log('[Migration 008] Simple world settings fields added successfully.');
}

export function down(db: DatabaseSync): void {
  // SQLite 不支持 DROP COLUMN（除非编译时启用），所以这里只输出日志
  console.log('[Migration 008] Cannot rollback: SQLite does not support DROP COLUMN by default.');
}
