import type { DatabaseSync } from 'node:sqlite';

/**
 * 042 - worldsetting_character_depth
 *
 * 对照"01-核心设定.txt"和"两百万字小说创作全流程指南"补全缺失字段。
 *
 * 核心设定新增（对照创作指南"详细世界观设定"7个维度 + 核心设定.txt特有章节）：
 * - cultural_settings: 文化特色JSON（习俗/节日/价值观/信仰/语言）← 创作指南第5维度
 * - spoiler_settings: 核心剧透设定JSON（时间循环/守护者/系统来源等）← 核心设定.txt
 * - censorship_rules: 过审规则JSON（敏感词→替代词映射表）← 核心设定.txt
 *
 * 角色新增（对照人物模板+创作指南）：
 * - notes: 补充说明（自由文本，放任何模板里装不下的内容）
 * - growth_stages_json: 成长阶段JSON [{stage, chapterRange, description}]
 * - core_conflict_role: 在核心冲突中的角色（如"推动者/阻碍者/旁观者"）
 */
export function up(db: DatabaseSync): void {
  // 核心设定
  db.exec(`ALTER TABLE world_settings ADD COLUMN cultural_settings TEXT DEFAULT '{}';`);
  db.exec(`ALTER TABLE world_settings ADD COLUMN spoiler_settings TEXT DEFAULT '{}';`);
  db.exec(`ALTER TABLE world_settings ADD COLUMN censorship_rules TEXT DEFAULT '{}';`);

  // 角色
  db.exec(`ALTER TABLE characters ADD COLUMN notes TEXT DEFAULT '';`);
  db.exec(`ALTER TABLE characters ADD COLUMN growth_stages_json TEXT DEFAULT '[]';`);
  db.exec(`ALTER TABLE characters ADD COLUMN core_conflict_role TEXT DEFAULT '';`);
}

export function down(_db: DatabaseSync): void {
  // 新增字段不破坏已有数据
}
