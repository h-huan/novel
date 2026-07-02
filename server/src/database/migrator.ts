/**
 * 数据库迁移管理
 * 支持 up/down 回滚，迁移记录表
 */
import { DatabaseSync } from 'node:sqlite';
import * as path from 'path';
import * as fs from 'fs';

export interface Migration {
  id: number;
  name: string;
  up: (db: DatabaseSync) => void;
  down: (db: DatabaseSync) => void;
}

export class Migrator {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  /**
   * 创建迁移记录表
   */
  private ensureMigrationTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        executed_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  /**
   * 获取已执行的迁移
   */
  private getExecutedMigrations(): Set<number> {
    const rows = this.db
      .prepare('SELECT id FROM _migrations ORDER BY id')
      .all() as { id: number }[];
    return new Set(rows.map((r) => r.id));
  }

  /**
   * 加载所有迁移文件
   */
  private loadMigrations(): Migration[] {
    const migDir = path.join(__dirname, 'migrations');
    const migrations: Migration[] = [];

    if (!fs.existsSync(migDir)) {
      return migrations;
    }

    const files = fs
      .readdirSync(migDir)
      .filter((f) => /^\d+_.*\.(ts|js)$/.test(f))
      .sort();

    for (const file of files) {
      const match = file.match(/^(\d+)_(.+)\.(ts|js)$/);
      if (!match) continue;

      const id = parseInt(match[1], 10);
      const name = match[2];
      const modulePath = path.join(migDir, file);

      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const migrationModule = require(modulePath);
        const migration = migrationModule.default || migrationModule;
        if (migration && migration.up && migration.down) {
          migrations.push({ id, name, up: migration.up, down: migration.down });
        }
      } catch (err) {
        console.error(`Failed to load migration ${file}:`, err);
      }
    }

    return migrations.sort((a, b) => a.id - b.id);
  }

  /**
   * 运行待执行的迁移
   */
  async runMigrations(): Promise<void> {
    this.ensureMigrationTable();

    const executed = this.getExecutedMigrations();
    const migrations = this.loadMigrations();

    for (const migration of migrations) {
      if (!executed.has(migration.id)) {
        console.log(`[Migration] Running ${migration.id}_${migration.name}...`);
        try {
          migration.up(this.db);
          this.db
            .prepare('INSERT INTO _migrations (id, name) VALUES (?, ?)')
            .run(migration.id, migration.name);
          console.log(`[Migration] ${migration.id}_${migration.name} completed.`);
        } catch (err) {
          console.error(`[Migration] ${migration.id}_${migration.name} FAILED:`, err);
          throw err;
        }
      }
    }
  }

  /**
   * 回滚到指定的迁移ID
   */
  async rollbackTo(targetId: number): Promise<void> {
    this.ensureMigrationTable();

    const executed = this.getExecutedMigrations();
    const migrations = this.loadMigrations();

    const toRollback = migrations
      .filter((m) => m.id > targetId && executed.has(m.id))
      .sort((a, b) => b.id - a.id);

    for (const migration of toRollback) {
      console.log(`[Migration] Rolling back ${migration.id}_${migration.name}...`);
      try {
        migration.down(this.db);
        this.db
          .prepare('DELETE FROM _migrations WHERE id = ?')
          .run(migration.id);
        console.log(`[Migration] Rolled back ${migration.id}_${migration.name}.`);
      } catch (err) {
        console.error(`[Migration] Rollback ${migration.id}_${migration.name} FAILED:`, err);
        throw err;
      }
    }
  }
}
