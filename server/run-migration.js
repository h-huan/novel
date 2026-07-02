/**
 * 手动运行数据库迁移
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

// 加载迁移器
const { Migrator } = require('./dist/src/database/migrator');

const dbPath = path.join(__dirname, 'data', 'novel.db');
const db = new DatabaseSync(dbPath);

console.log('=== Running Migrations ===');
const migrator = new Migrator(db);
migrator.runMigrations();

console.log('\n=== Checking Tables ===');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
tables.forEach(t => console.log(`- ${t.name}`));

db.close();
console.log('\n✅ Migrations completed!');
