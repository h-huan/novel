import type { DatabaseSync } from 'node:sqlite';

/**
 * 045 — 按外部文档模板（《世界观模板》《人物模板》《大纲模板》）重建
 * 核心设定 / 角色 / 地点 三个模块的详细档案字段。
 *
 * 策略：以「新增文档对齐字段列」的方式扩展，旧列保留为休眠列（不被新代码读写），
 * 既让模块结构直接对齐文档模板，又不破坏已有数据与现有测试（state-item.service.spec 直接 INSERT 旧列）。
 * 全新项目将只填充新列；存量项目重新触发 enrich 后会写入新列。
 */
export function up(db: DatabaseSync): void {
  const addColumns = (table: string, cols: Array<[string, string]>) => {
    const existing = new Set((db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name));
    for (const [col, def] of cols) {
      if (existing.has(col)) continue; // 旧表已存在同名列则跳过，保证幂等
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def};`);
    }
  };

  // ===== 核心设定 world_system_profiles —— 对齐《世界观模板》8 类 =====
  addColumns('world_system_profiles', [
    ['era', 'TEXT DEFAULT \'\''],
    ['locations', 'TEXT DEFAULT \'\''],
    ['atmosphere_tone', 'TEXT DEFAULT \'\''],
    ['rules', 'TEXT DEFAULT \'\''],
    ['social_structure', 'TEXT DEFAULT \'\''],
    ['tech_supernatural', 'TEXT DEFAULT \'\''],
    ['culture_customs', 'TEXT DEFAULT \'\''],
    ['supplementary', 'TEXT DEFAULT \'\''],
  ]);

  // ===== 角色 character_extended_profiles —— 对齐《人物模板》14 项（姓名为主表列，此处 13 项）=====
  addColumns('character_extended_profiles', [
    ['alias_title', 'TEXT DEFAULT \'\''],
    ['identity_occupation', 'TEXT DEFAULT \'\''],
    ['faction_stance', 'TEXT DEFAULT \'\''],
    ['role_type', 'TEXT DEFAULT \'\''],
    ['appearance', 'TEXT DEFAULT \'\''],
    ['personality_traits', 'TEXT DEFAULT \'\''],
    ['abilities_skills', 'TEXT DEFAULT \'\''],
    ['backstory', 'TEXT DEFAULT \'\''],
    ['relationships', 'TEXT DEFAULT \'\''],
    ['catchphrase_speech_style', 'TEXT DEFAULT \'\''],
    ['goals_motivation', 'TEXT DEFAULT \'\''],
    ['weaknesses_fears', 'TEXT DEFAULT \'\''],
    ['supplementary', 'TEXT DEFAULT \'\''],
  ]);

  // ===== 地点 location_knowledge_profiles —— 对齐《世界观模板》地点/氛围/势力段落 =====
  addColumns('location_knowledge_profiles', [
    ['location_type', 'TEXT DEFAULT \'\''],
    ['basic_description', 'TEXT DEFAULT \'\''],
    ['atmosphere', 'TEXT DEFAULT \'\''],
    ['geography_position', 'TEXT DEFAULT \'\''],
    ['key_landmarks', 'TEXT DEFAULT \'\''],
    ['controlling_force', 'TEXT DEFAULT \'\''],
    ['resources_scarcity', 'TEXT DEFAULT \'\''],
    ['secrets_foreshadow', 'TEXT DEFAULT \'\''],
    ['connected_characters', 'TEXT DEFAULT \'\''],
    ['connected_chapters', 'TEXT DEFAULT \'\''],
  ]);
}

export function down(db: DatabaseSync): void {
  // 回滚：删除新增列（SQLite 不支持 DROP COLUMN 旧版本稳妥写法见 migrator；此处仅在支持时尝试）
  const drop = (table: string, col: string) => {
    try { db.exec(`ALTER TABLE ${table} DROP COLUMN ${col};`); } catch { /* 忽略不支持的情况 */ }
  };
  ['era','locations','atmosphere_tone','rules','social_structure','tech_supernatural','culture_customs','supplementary']
    .forEach(c => drop('world_system_profiles', c));
  ['alias_title','identity_occupation','faction_stance','role_type','appearance','personality_traits','abilities_skills','backstory','relationships','catchphrase_speech_style','goals_motivation','weaknesses_fears','supplementary']
    .forEach(c => drop('character_extended_profiles', c));
  ['location_type','basic_description','atmosphere','geography_position','key_landmarks','controlling_force','resources_scarcity','secrets_foreshadow','connected_characters','connected_chapters']
    .forEach(c => drop('location_knowledge_profiles', c));
}

export default { up, down };
