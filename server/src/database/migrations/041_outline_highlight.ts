import type { DatabaseSync } from 'node:sqlite';

/**
 * 041 - outline_highlight
 *
 * 大纲爽点与系统提示字段补充。
 * 小说每章细化大纲都有「爽点设置」（不少于2个）和「系统提示」字段。
 *
 * - highlight_points: 爽点设置JSON数组，如["主角果断突围","途中收拢流民"]
 * - system_hints: 系统提示（贡献点/任务/科技解锁等提示内容）
 * - timeline: 本章时间线描述（如"穿越第1天"）
 * - location_summary: 本章地点摘要（如"并州边境→荒野→山谷"）
 */
export function up(db: DatabaseSync): void {
  db.exec(`ALTER TABLE outlines ADD COLUMN highlight_points TEXT DEFAULT '[]';`);
  db.exec(`ALTER TABLE outlines ADD COLUMN system_hints TEXT DEFAULT '';`);
  db.exec(`ALTER TABLE outlines ADD COLUMN timeline TEXT DEFAULT '';`);
  db.exec(`ALTER TABLE outlines ADD COLUMN location_summary TEXT DEFAULT '';`);
}

export function down(_db: DatabaseSync): void {
  // 新增字段不破坏已有数据
}
