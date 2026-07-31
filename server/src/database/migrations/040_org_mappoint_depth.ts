import type { DatabaseSync } from 'node:sqlite';

/**
 * 040 - org_mappoint_depth
 *
 * 组织/势力模块深度增强（对照小说势力表：部落名/特点/标志装备/势力关系等）：
 * - leader: 领袖名称
 * - strength_level: 实力等级（1-100）
 * - territory: 控制区域描述
 * - characteristics: 特点描述（如"骑兵精锐，善于冲锋"）
 * - relationships_json: 与其他势力的关系JSON数组 [{target, type}]
 * - signature_equipment: 标志装备（如"铁甲、长矛""弯刀、重甲"）
 *
 * 地点/地图模块深度增强（对照小说地理描述）：
 * - climate: 气候描述
 * - resources: 资源列表JSON
 * - significance: 战略/剧情意义
 * - sensory_detail: 感官细节（气味/声音/触感描述，增强沉浸感）
 */
export function up(db: DatabaseSync): void {
  // 组织/势力
  db.exec(`ALTER TABLE organizations ADD COLUMN leader TEXT DEFAULT '';`);
  db.exec(`ALTER TABLE organizations ADD COLUMN strength_level INTEGER DEFAULT 0;`);
  db.exec(`ALTER TABLE organizations ADD COLUMN territory TEXT DEFAULT '';`);
  db.exec(`ALTER TABLE organizations ADD COLUMN characteristics TEXT DEFAULT '';`);
  db.exec(`ALTER TABLE organizations ADD COLUMN relationships_json TEXT DEFAULT '[]';`);
  db.exec(`ALTER TABLE organizations ADD COLUMN signature_equipment TEXT DEFAULT '';`);

  // 地点/地图
  db.exec(`ALTER TABLE map_points ADD COLUMN climate TEXT DEFAULT '';`);
  db.exec(`ALTER TABLE map_points ADD COLUMN resources TEXT DEFAULT '[]';`);
  db.exec(`ALTER TABLE map_points ADD COLUMN significance TEXT DEFAULT '';`);
  db.exec(`ALTER TABLE map_points ADD COLUMN sensory_detail TEXT DEFAULT '';`);
}

export function down(_db: DatabaseSync): void {
  // 新增字段不破坏已有数据。
}
