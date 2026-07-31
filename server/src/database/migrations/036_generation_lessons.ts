import type { DatabaseSync } from 'node:sqlite';

/**
 * 036 - generation_lessons
 *
 * 跨章节学习回路：每次章节生成/大纲对齐精修发现的「缺失场景 / 提前终止 / 角色冲突 /
 * 视角漂移 / 漏结尾钩子」等问题，经真实 LLM 归纳成可复用的避坑经验，落库后注入到
 * 本项目后续所有章节的生成 prompt。这样第一章漏了结尾钩子，第二章首版就会自动规避，
 * 而不是每章都从零犯同样的错（用户明确反对「第一章重写3次、第二章重写4次、毫无进步」）。
 *
 * 与 consistency_checks 区分：consistency_checks 是「本章的具体矛盾」（用户可见、可操作），
 * generation_lessons 是「跨章节归纳出的通用教训」（注入后续章节 prompt 防复发），二者职责不同。
 */
export function up(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS generation_lessons (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      category TEXT NOT NULL,
      lesson TEXT NOT NULL,
      occurrence INTEGER NOT NULL DEFAULT 1,
      last_chapter_index INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(project_id, lesson)
    );
  `);
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_generation_lessons_project ON generation_lessons(project_id)',
  );
}

export function down(_db: DatabaseSync): void {
  // 学习经验有长期价值，回滚时保留表。
}
