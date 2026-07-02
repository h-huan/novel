/**
 * 002_dual_write - 添加双写存储表
 * 用于 dualWrite() 方法的 SQLite 持久化
 */
import type { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS dual_write_store (
      id TEXT PRIMARY KEY,
      data_key TEXT NOT NULL,
      data_value TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_dws_key ON dual_write_store(data_key);
  `);

  console.log('[Migration 002] Created dual_write_store table.');
}

export function down(db: DatabaseSync): void {
  db.exec(`DROP TABLE IF EXISTS dual_write_store`);
  console.log('[Migration 002] Dropped dual_write_store table.');
}
