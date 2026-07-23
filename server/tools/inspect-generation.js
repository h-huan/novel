const { DatabaseSync } = require('node:sqlite');

const projectId = process.argv[2];
if (!projectId) throw new Error('Usage: node tools/inspect-generation.js <projectId>');
const db = new DatabaseSync('data/novel.db', { readOnly: true });
const tables = db.prepare(`SELECT name FROM sqlite_master
  WHERE type='table' AND (name LIKE '%generation%' OR name LIKE '%execution%' OR name LIKE '%log%' OR name LIKE '%workflow%')
  ORDER BY name`).all();
for (const { name } of tables) {
  const columns = db.prepare(`PRAGMA table_info(${name})`).all().map(row => row.name);
  const projectColumn = columns.includes('project_id') ? 'project_id' : columns.includes('projectId') ? 'projectId' : null;
  let rows = [];
  if (projectColumn) {
    const order = columns.includes('created_at') ? 'created_at DESC' : columns.includes('updated_at') ? 'updated_at DESC' : 'rowid DESC';
    rows = db.prepare(`SELECT * FROM ${name} WHERE ${projectColumn}=? ORDER BY ${order} LIMIT 10`).all(projectId);
  }
  console.log(JSON.stringify({ name, columns, rows }));
}
