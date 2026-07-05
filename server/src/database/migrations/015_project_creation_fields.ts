/**
 * 015_project_creation_fields - 项目表新增创作流程字段
 *
 * 新增：
 * - creation_source     创建来源 (inspiration/idea/import/blank)
 * - target_platform     目标平台 (zhihu/fanqie/qidian/douyin/xiaohongshu/custom/generic)
 * - current_workflow_stage 当前创作阶段
 * - idea_status         想法孵化状态 (none/draft/refining/confirmed/converted)
 * - idea_seed           用户原始想法
 * - confirmed_idea      确认后的成熟想法
 */
import type { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  // 逐列安全添加，忽略已存在的情况
  const addColumnSafe = (table: string, col: string, def: string) => {
    try {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
      if (!cols.find((c: any) => c.name === col)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
        console.log(`[Migration 015] ${table}.${col} added`);
      } else {
        console.log(`[Migration 015] ${table}.${col} already exists`);
      }
    } catch (e) {
      console.warn(`[Migration 015] ${table}.${col} alter failed`, e);
    }
  };

  // 新旧多读兼容：target_platform 存独立值，platform_style 可能存旧值。
  // 读取时：target_platform || platform_style || 'generic'
  addColumnSafe('projects', 'creation_source', "TEXT DEFAULT 'blank'");
  addColumnSafe('projects', 'target_platform', "TEXT DEFAULT 'generic'");
  addColumnSafe('projects', 'current_workflow_stage', 'TEXT');
  addColumnSafe('projects', 'idea_status', "TEXT DEFAULT 'none'");
  addColumnSafe('projects', 'idea_seed', 'TEXT');
  addColumnSafe('projects', 'confirmed_idea', 'TEXT');

  // 修复旧数据：如果旧项目没有 creation_source，设为 blank
  try {
    db.prepare(
      `UPDATE projects SET creation_source = 'blank' WHERE creation_source IS NULL`
    ).run();
    console.log('[Migration 015] Backfilled creation_source for old projects');
  } catch (e) {
    console.warn('[Migration 015] Backfill creation_source failed', e);
  }

  // 修复旧数据：target_platform 为空时回退到 platform_style
  try {
    db.prepare(
      `UPDATE projects SET target_platform = COALESCE(NULLIF(platform_style, ''), 'generic') WHERE target_platform IS NULL OR target_platform = ''`
    ).run();
    console.log('[Migration 015] Backfilled target_platform from platform_style');
  } catch (e) {
    console.warn('[Migration 015] Backfill target_platform failed', e);
  }

  // 修复旧数据：current_workflow_stage 根据 type 推断
  try {
    db.prepare(
      `UPDATE projects SET current_workflow_stage = 'topic' WHERE type = 'short_story' AND (current_workflow_stage IS NULL OR current_workflow_stage = '')`
    ).run();
    db.prepare(
      `UPDATE projects SET current_workflow_stage = 'idea_or_inspiration' WHERE type = 'long_novel' AND (current_workflow_stage IS NULL OR current_workflow_stage = '')`
    ).run();
    db.prepare(
      `UPDATE projects SET current_workflow_stage = 'idea_or_inspiration' WHERE type NOT IN ('short_story', 'long_novel') AND (current_workflow_stage IS NULL OR current_workflow_stage = '')`
    ).run();
    console.log('[Migration 015] Backfilled current_workflow_stage by type');
  } catch (e) {
    console.warn('[Migration 015] Backfill current_workflow_stage failed', e);
  }

  // 修复旧数据：idea_status 为 null 时设为 none
  try {
    db.prepare(
      `UPDATE projects SET idea_status = 'none' WHERE idea_status IS NULL`
    ).run();
    console.log('[Migration 015] Backfilled idea_status for old projects');
  } catch (e) {
    console.warn('[Migration 015] Backfill idea_status failed', e);
  }
}

export function down(db: DatabaseSync): void {
  // SQLite 不支持 DROP COLUMN，回滚仅记录
  console.log('[Migration 015] rollback: SQLite cannot DROP COLUMN, manual intervention required');
}
