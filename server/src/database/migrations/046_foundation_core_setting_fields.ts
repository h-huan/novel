import { DatabaseSync } from 'node:sqlite';

// 核心设定扩为"地基型"：在 045 的 8 类世界观列基础上，新增不属于角色/大纲/地点的
// 基础设定板块（对齐《核心设定.txt》：作品简介/基本信息/系统机制/命名规则/规模规划/
// 结局/层级规则）。保留 045 旧列休眠，幂等 ADD COLUMN 避免与已有列冲突。
export function up(db: DatabaseSync): void {
  const table = 'world_system_profiles';
  const existing: Set<string> = new Set(
    (db.prepare(`PRAGMA table_info(${table})`).all() as any[]).map((c: any) => c.name),
  );
  const cols: Array<[string, string]> = [
    ['synopsis', 'TEXT DEFAULT \'\''],
    ['basic_info', 'TEXT DEFAULT \'\''],
    ['system_mechanics', 'TEXT DEFAULT \'\''],
    ['naming_rules', 'TEXT DEFAULT \'\''],
    ['scale_plan', 'TEXT DEFAULT \'\''],
    ['ending', 'TEXT DEFAULT \'\''],
    ['hierarchy_rules', 'TEXT DEFAULT \'\''],
  ];
  for (const [col, def] of cols) {
    if (existing.has(col)) continue;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def};`);
  }
}

export function down(db: DatabaseSync): void {
  // SQLite 不支持 DROP COLUMN（旧运行时），此处仅记录；新列留空不影响旧数据。
}
