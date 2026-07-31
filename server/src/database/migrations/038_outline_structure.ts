import type { DatabaseSync } from 'node:sqlite';

/**
 * 038 - outline_structure
 *
 * 大纲模块结构增强。当前大纲只有通用 content 字段，但"我在乱世召唤玩家"小说
 * 每章大纲有非常结构化的子字段（细化大纲模板包含14个维度）。
 *
 * 新增字段：
 * - chapter_type: 章节类型（标准章/高潮章/波折章/过渡章/结局章）
 * - pov_ratio: 视角比例（如"主角100%""玩家≥50%"）
 * - hot_scenes: 热血镜头/爽点场景描述
 * - setback_scenes: 波折镜头/挫折场景描述
 * - ending_setup: 结尾设置（钩子/悬念/下一章预告）
 * - data_tracking: 数据追踪JSON（人口/玩家数/贡献点/粮食等关键数据）
 */
export function up(db: DatabaseSync): void {
  db.exec(`ALTER TABLE outlines ADD COLUMN chapter_type TEXT DEFAULT '';`);
  db.exec(`ALTER TABLE outlines ADD COLUMN pov_ratio TEXT DEFAULT '';`);
  db.exec(`ALTER TABLE outlines ADD COLUMN hot_scenes TEXT DEFAULT '';`);
  db.exec(`ALTER TABLE outlines ADD COLUMN setback_scenes TEXT DEFAULT '';`);
  db.exec(`ALTER TABLE outlines ADD COLUMN ending_setup TEXT DEFAULT '';`);
  db.exec(`ALTER TABLE outlines ADD COLUMN data_tracking TEXT DEFAULT '{}';`);
}

export function down(_db: DatabaseSync): void {
  // 新增字段不破坏已有数据。
}
