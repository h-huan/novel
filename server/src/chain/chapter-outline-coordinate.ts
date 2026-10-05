interface ChapterDb {
  prepare(sql: string): { get(...args: any[]): any; all(...args: any[]): any[] };
}

/** Expand sibling positions into a global story sequence, including multiple volumes. */
export function readOrderedChapterOutlines(db: ChapterDb, projectId: string): any[] {
  return db.prepare(`SELECT o.* FROM outlines o LEFT JOIN outlines p ON p.id=o.parent_id AND p.project_id=o.project_id
    WHERE o.project_id=? AND o.level='chapter'
    ORDER BY COALESCE(p."order",0), o."order", o.id`).all(projectId);
}

/** A persisted chapter binding is authoritative. No zero/one-origin guessing. */
export function findChapterOutline(db: ChapterDb, projectId: string, chapterIndex: number, chapterId?: string): any {
  if (!Number.isSafeInteger(chapterIndex) || chapterIndex < 1) return undefined;
  const linked = db.prepare(`SELECT o.* FROM chapters c JOIN outlines o ON o.id=c.outline_id AND o.project_id=c.project_id
    WHERE c.project_id=? AND ${chapterId ? 'c.id=?' : 'c.chapter_index=?'} AND o.level='chapter' LIMIT 1`)
    .get(projectId, chapterId || chapterIndex);
  if (linked) return linked;
  if (chapterId) throw new Error('当前章节没有有效的章纲绑定，停止生成，禁止按排序猜测另一章');
  return readOrderedChapterOutlines(db, projectId)[chapterIndex - 1];
}
