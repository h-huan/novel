import type { DatabaseSync } from 'node:sqlite';

/**
 * 043 - outline_conflict_design
 *
 * 对照第一卷细化大纲，每章都有「冲突设计」字段。
 * 当前 outlines 表缺少此字段。
 */
export function up(db: DatabaseSync): void {
  db.exec(`ALTER TABLE outlines ADD COLUMN conflict_design TEXT DEFAULT '';`);
}

export function down(_db: DatabaseSync): void {
  // 新增字段不破坏已有数据
}
