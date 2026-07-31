import type { DatabaseSync } from 'node:sqlite';

/**
 * 037 - character_depth
 *
 * 角色模块深度增强。当前角色结构只有基础字段，对照"我在乱世召唤玩家"小说
 * 实际角色档案发现缺失：阵营归属、目标动机、弱点恐惧、伤口创伤、关键台词。
 *
 * 新增字段说明（从小说人物模板逐条对照补充）：
 * - faction: 阵营/立场（如"主角阵营""北狄诸部""玩家内部·拼命型"）
 * - goals: 目标/动机（外部想要什么+内部真正需要什么，如"活下去→证明自己"）
 * - weaknesses: 弱点/恐惧（如"怕死""对玩家死亡过度自责""怕被当疯子"）
 * - wound: 伤口/创伤（过去经历的创伤事件，塑造当前人格的核心伤口）
 * - keywords: 关键台词/场景标记（逗号分隔，如"身后就是家园""老大我没机会了"）
 */
export function up(db: DatabaseSync): void {
  db.exec(`
    ALTER TABLE characters ADD COLUMN faction TEXT DEFAULT '';
  `);
  db.exec(`
    ALTER TABLE characters ADD COLUMN goals TEXT DEFAULT '';
  `);
  db.exec(`
    ALTER TABLE characters ADD COLUMN weaknesses TEXT DEFAULT '';
  `);
  db.exec(`
    ALTER TABLE characters ADD COLUMN wound TEXT DEFAULT '';
  `);
  db.exec(`
    ALTER TABLE characters ADD COLUMN keywords TEXT DEFAULT '';
  `);
}

export function down(_db: DatabaseSync): void {
  // 新增字段不影响已有数据完整性，回滚时保留。
}
