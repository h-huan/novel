const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync('data/novel.db', { readOnly: true });
const project = db.prepare(
  'SELECT id,title,status,target_words,created_at FROM projects ORDER BY created_at DESC LIMIT 1',
).get();
const rows = db.prepare(
  `SELECT "order",title,target_words,length(trim(coalesce(content,''))) AS content_len,scenes
   FROM outlines WHERE project_id=? AND level='chapter' ORDER BY "order"`,
).all(project.id);
const count = (table) => db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE project_id=?`).get(project.id).c;
const result = {
  project,
  chapters: rows.map((row) => {
    let hasReason = false;
    try { hasReason = Boolean(JSON.parse(row.scenes).wordCountReason); } catch {}
    return { order: row.order, targetWords: row.target_words, contentLength: row.content_len, hasReason };
  }),
  sumTargetWords: rows.reduce((sum, row) => sum + row.target_words, 0),
  counts: {
    characters: count('characters'),
    organizations: count('organizations'),
    mapPoints: count('map_points'),
    foreshadowings: count('foreshadowings'),
    timelineEvents: db.prepare(
      'SELECT COUNT(*) AS c FROM timeline_events e JOIN timelines t ON e.timeline_id=t.id WHERE t.project_id=?',
    ).get(project.id).c,
  },
};
console.log(JSON.stringify(result, null, 2));
