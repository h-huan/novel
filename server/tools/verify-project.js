const { DatabaseSync } = require('node:sqlite');

const projectId = process.argv[2];
if (!projectId) throw new Error('Usage: node tools/verify-project.js <projectId>');

const db = new DatabaseSync(process.env.DATA_DIR ? `${process.env.DATA_DIR}/novel.db` : 'data/novel.db', { readOnly: true });
const vectorDb = new DatabaseSync(process.env.DATA_DIR ? `${process.env.DATA_DIR}/vectors.db` : 'data/vectors.db', { readOnly: true });
const project = db.prepare(`SELECT id,title,status,target_words,current_workflow_stage,idea_status
  FROM projects WHERE id=?`).get(projectId);
const outlines = db.prepare(`SELECT "order",title,target_words,chapter_function,length(content) AS content_len,status
  FROM outlines WHERE project_id=? AND level='chapter' ORDER BY "order"`).all(projectId);
const result = {
  project,
  outlines,
  outlineSummary: db.prepare(`SELECT count(*) AS count,sum(target_words) AS target_sum,
    min(target_words) AS min_target,max(target_words) AS max_target
    FROM outlines WHERE project_id=? AND level='chapter'`).get(projectId),
  chapters: db.prepare(`SELECT count(*) AS count,sum(word_count) AS words FROM chapters WHERE project_id=?`).get(projectId),
  characters: db.prepare(`SELECT count(*) AS count,
    sum(CASE WHEN name IS NULL OR trim(name)='' OR identity IS NULL OR trim(identity)='' THEN 1 ELSE 0 END) AS invalid
    FROM characters WHERE project_id=?`).get(projectId),
  worldSettings: db.prepare(`SELECT count(*) AS count FROM world_settings WHERE project_id=?`).get(projectId),
  organizations: db.prepare(`SELECT count(*) AS count FROM organizations WHERE project_id=?`).get(projectId),
  mapPoints: db.prepare(`SELECT count(*) AS count FROM map_points WHERE project_id=?`).get(projectId),
  foreshadowings: db.prepare(`SELECT count(*) AS count,
    sum(CASE WHEN evidence_text IS NULL OR trim(evidence_text)='' OR recovery_condition IS NULL OR trim(recovery_condition)='' THEN 1 ELSE 0 END) AS invalid
    FROM foreshadowings WHERE project_id=?`).get(projectId),
  timelineEvents: db.prepare(`SELECT count(*) AS count FROM timeline_events e
    JOIN timelines t ON t.id=e.timeline_id WHERE t.project_id=?`).get(projectId),
};

const vectorRows = vectorDb.prepare(`SELECT collection,vector_json,metadata_json FROM vectors`).all()
  .filter(row => {
    try { return JSON.parse(row.metadata_json).projectId === projectId; } catch { return false; }
  });
result.rag = {
  count: vectorRows.length,
  byCollection: vectorRows.reduce((counts, row) => {
    counts[row.collection] = (counts[row.collection] || 0) + 1;
    return counts;
  }, {}),
  dimensions: [...new Set(vectorRows.map(row => JSON.parse(row.vector_json).length))],
  invalidVectors: vectorRows.filter(row => {
    const vector = JSON.parse(row.vector_json);
    return vector.length === 0 || vector.some(value => !Number.isFinite(value)) || vector.every(value => value === 0);
  }).length,
};

console.log(JSON.stringify(result, null, 2));
