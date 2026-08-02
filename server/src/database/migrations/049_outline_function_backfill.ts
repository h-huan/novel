import { DatabaseSync } from 'node:sqlite';

// 049 — 回填旧的"全 paving"短篇章节功能：按章节顺序套用短篇节奏数组，保证大纲节奏可视化。
const SHORT_RHYTHM = ['opening', 'exposition', 'rising_action', 'conflict', 'climax', 'transition', 'climax', 'cliffhanger', 'resolution'];

export function up(db: DatabaseSync): void {
  const projects = db.prepare(`SELECT project_id FROM outlines WHERE level='chapter' AND chapter_function='paving' GROUP BY project_id`).all() as any[];
  for (const { project_id } of projects) {
    const rows = db.prepare(`SELECT id, "order" FROM outlines WHERE project_id=? AND level='chapter' AND chapter_function='paving' ORDER BY "order"`).all(project_id) as any[];
    for (const row of rows) {
      const fn = SHORT_RHYTHM[Math.min((Number(row.order) || 1) - 1, SHORT_RHYTHM.length - 1)];
      db.prepare(`UPDATE outlines SET chapter_function=? WHERE id=?`).run(fn, row.id);
    }
  }
}

export function down(db: DatabaseSync): void {
  // 不回滚（幂等回填）。
}

export default { up, down };
