import { DatabaseSync } from 'node:sqlite';

// 047 — 对齐《两百万字小说创作全流程指南》世界观 7 类，补齐经济体系与势力分布；
// custom_settings 为按小说自定义设定（JSON 键值对数组）。
export function up(db: DatabaseSync): void {
  const table = 'world_system_profiles';
  const existing: Set<string> = new Set(
    (db.prepare(`PRAGMA table_info(${table})`).all() as any[]).map((c: any) => c.name),
  );
  const cols: Array<[string, string]> = [
    ['economy_system', 'TEXT DEFAULT \'\''],
    ['factions', 'TEXT DEFAULT \'\''],
    ['custom_settings', 'TEXT DEFAULT \'\''],
  ];
  for (const [col, def] of cols) {
    if (existing.has(col)) continue;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def};`);
  }
}

export function down(db: DatabaseSync): void {
  // SQLite 旧运行时不支持 DROP COLUMN；新列留空不影响旧数据。
}

export default { up, down };
