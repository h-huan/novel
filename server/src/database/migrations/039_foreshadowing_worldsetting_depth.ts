import type { DatabaseSync } from 'node:sqlite';

/**
 * 039 - foreshadowing_worldsetting_depth
 *
 * 伏笔+核心设定模块深度增强。
 *
 * 伏笔新增（对照小说伏笔揭示计划）：
 * - emotional_impact: 情绪冲击描述（如"震撼""恐惧""悲壮+温暖"）
 * - layered_reveal: 分层揭示计划JSON（多阶段揭示路径）
 *
 * 核心设定新增（对照小说01-核心设定.txt结构）：
 * - naming_rules: 命名规则JSON（地区/异族/部落命名体系）
 * - work_intro: 作品简介JSON（书名/作者/类型/状态/标签/核心卖点等）
 * - system_settings: 系统设定JSON（文明复兴系统/贡献点/科技树/复活机制等）
 * - data_planning: 全文数据规划JSON（人口/玩家/贡献点/粮食/军队数据规划表）
 */
export function up(db: DatabaseSync): void {
  // 伏笔
  db.exec(`ALTER TABLE foreshadowings ADD COLUMN emotional_impact TEXT DEFAULT '';`);
  db.exec(`ALTER TABLE foreshadowings ADD COLUMN layered_reveal TEXT DEFAULT '[]';`);

  // 核心设定
  db.exec(`ALTER TABLE world_settings ADD COLUMN naming_rules TEXT DEFAULT '{}';`);
  db.exec(`ALTER TABLE world_settings ADD COLUMN work_intro TEXT DEFAULT '{}';`);
  db.exec(`ALTER TABLE world_settings ADD COLUMN system_settings TEXT DEFAULT '{}';`);
  db.exec(`ALTER TABLE world_settings ADD COLUMN data_planning TEXT DEFAULT '{}';`);
}

export function down(_db: DatabaseSync): void {
  // 新增字段不破坏已有数据。
}
