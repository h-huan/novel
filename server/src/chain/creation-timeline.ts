import type { DatabaseSync } from 'node:sqlite';

/**
 * Finalize a project's chapter-derived timeline without invoking another model.
 * Reuse existing events on recovery; if an earlier write left an empty timeline,
 * populate it rather than adding another header. A savepoint makes a failed
 * event insert incapable of leaving a new empty timeline behind.
 */
export function ensureCreationTimelineWithEvents(
  db: DatabaseSync,
  options: {
    projectId: string;
    title: string;
    timelineItems: any[];
    fallbackChapters?: any[];
    makeId: () => string;
    timestamp: () => string;
    serialize: (value: unknown, fallback?: string) => string;
  },
): number {
  const items = options.timelineItems.length ? options.timelineItems : (options.fallbackChapters || []);
  if (items.length === 0) return 0;
  const asArray = (value: unknown): unknown[] =>
    Array.isArray(value) ? value : value === undefined || value === null || value === '' ? [] : [value];

  // SQLite savepoints also work if a caller already owns a transaction.
  db.exec('SAVEPOINT creation_timeline_insert');
  try {
    const previous = db.prepare(`
      SELECT t.id, COUNT(e.id) AS events FROM timelines t
      LEFT JOIN timeline_events e ON e.timeline_id = t.id
      WHERE t.project_id = ?
      GROUP BY t.id
      ORDER BY events DESC, t.created_at ASC LIMIT 1
    `).get(options.projectId) as { id: string; events: number } | undefined;
    if (previous && Number(previous.events) > 0) {
      // Never promote a partial legacy write to a complete timeline.
      // Existing author events stay untouched, including their ordering.
      if (Number(previous.events) < items.length) {
        throw new Error(`已有时间线事件 ${previous.events}/${items.length}，必须核对缺失节点；不会覆盖已保存事件`);
      }
      db.exec('RELEASE SAVEPOINT creation_timeline_insert');
      return Number(previous.events);
    }

    const timelineId = previous?.id || options.makeId();
    if (!previous) {
      const startDate = items[0]?.date || items[0]?.eventDate || null;
      const last = items[items.length - 1];
      const endDate = last?.date || last?.eventDate || null;
      db.prepare(`INSERT INTO timelines
        (id, project_id, name, description, start_date, end_date, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?)`).run(
        timelineId, options.projectId, `${options.title}时间线`,
        `《${options.title}》的故事时间线`, startDate, endDate,
        options.timestamp(), options.timestamp(),
      );
    }

    let created = 0;
    for (const [index, item] of items.entries()) {
      const title = options.serialize(item?.title || item?.event || item?.name, `关键节点 ${index + 1}`);
      if (!title) continue;
      const relatedChapterIds = item?.chapterReference ? [String(item.chapterReference)] : [];
      db.prepare(`INSERT INTO timeline_events
        (id, timeline_id, title, description, event_date, event_type, importance,
          related_character_ids, related_chapter_ids, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
        options.makeId(), timelineId, title,
        options.serialize(item?.description || item?.significance || item?.summary),
        options.serialize(item?.date || item?.eventDate, `第${index + 1}章`),
        options.serialize(item?.eventType, 'plot'),
        Number(item?.importance || (index === 0 ? 3 : 2)),
        JSON.stringify(asArray(item?.relatedCharacterIds || item?.characters).map(String)),
        JSON.stringify(relatedChapterIds),
        options.timestamp(), options.timestamp(),
      );
      created++;
    }
    if (created === 0) throw new Error('已有章纲但未生成可写入的时间线事件');
    db.exec('RELEASE SAVEPOINT creation_timeline_insert');
    return created;
  } catch (error) {
    db.exec('ROLLBACK TO SAVEPOINT creation_timeline_insert');
    db.exec('RELEASE SAVEPOINT creation_timeline_insert');
    throw error;
  }
}
