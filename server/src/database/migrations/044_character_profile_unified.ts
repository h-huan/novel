import type { DatabaseSync } from 'node:sqlite';

/**
 * 044 - character_profile_unified
 *
 * 角色表与 character_extended_profiles 字段重叠混乱（goals/weaknesses/personality/abilities
 * 在两表各有不同维度的版本）。本迁移将 extended_profiles 的关键字段统一到 characters 表，
 * 作为一个结构化 JSON 列，同时保留旧表用于向后兼容。
 *
 * - profile_json: 统一角色详细档案 JSON，包含：
 *     motivation（短期目标/长期目标/核心欲望/核心恐惧/当前难题/失败代价）
 *     personality_detail（表层性格/深层性格/性格矛盾/价值系统）
 *     weaknesses_detail（身体弱点/性格弱点/情感弱点/道德边界）
 *     abilities_detail（能力来源/能力等级/特殊技能/能力限制/能力代价）
 *     background_detail（关键往事/创伤/执念/隐藏身份/秘密）
 *     dialogue_detail（口头禅/常用词/禁用词/危险反应/背叛反应）
 *     arc_detail（初始弧光/当前弧光/卷级弧光/结局弧光）
 *     writing_rules（必须遵守/可以变化/禁止写法/容易写崩的点/本章可用）
 */
export function up(db: DatabaseSync): void {
  db.exec(`ALTER TABLE characters ADD COLUMN profile_json TEXT DEFAULT '{}';`);
}

export function down(_db: DatabaseSync): void {
  // 新增字段不破坏已有数据
}
