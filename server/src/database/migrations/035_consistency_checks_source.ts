import type { DatabaseSync } from 'node:sqlite';

/**
 * 035 - consistency_checks.source
 *
 * 区分矛盾来源：
 * - 'deterministic'：ConsistencyCheckService 的确定性规则检测（人物/世界观/时间线/伏笔）。
 * - 'alignment_verifier'：正文生成后大纲一致性验收器（checkChapterAlignment）发现的真实矛盾。
 *
 * 写作完成提示里的真实矛盾来自 alignment_verifier，前后矛盾 tab 读同一张表，
 * 二者必须从同一数据源取数，避免「提示里看到矛盾、tab 里看不到」的对不上问题。
 */
export function up(db: DatabaseSync): void {
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='consistency_checks'").get();
  if (!table) return;
  const columns = db.prepare('PRAGMA table_info(consistency_checks)').all() as Array<{ name: string }>;
  if (!columns.some(column => column.name === 'source')) {
    db.exec("ALTER TABLE consistency_checks ADD COLUMN source TEXT NOT NULL DEFAULT 'deterministic'");
  }
}

export function down(_db: DatabaseSync): void {
  // SQLite 不便于安全删除列且数据有保留价值，回滚时保留。
}
