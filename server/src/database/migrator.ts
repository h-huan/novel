/**
 * 数据库迁移管理
 * 支持 up/down 回滚，迁移记录表
 */
import { DatabaseSync } from 'node:sqlite';
import * as path from 'path';
import * as fs from 'fs';
import { normalizeStoredConstitutions } from '../modules/project/creative-constitution';
import { reconcileSchema } from './schema-reconciler';

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
      .filter((f) => /^\d+_.*\.(ts|js)$/.test(f) && !f.endsWith('.d.ts') && !f.includes('.spec.'))
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
        throw err;
      }
    }

    return migrations.sort((a, b) => a.id - b.id);
  }

  /** Collapse historical numbered records into the single current baseline. */
  private alignSquashedBaseline(migrations: Migration[]): void {
    const initial = migrations.find((m) => m.id === 1);
    if (!initial) return;
    const recorded = this.db.prepare('SELECT id,name FROM _migrations WHERE id>1').all() as Array<{id:number;name:string}>;
    const legacy = { c: recorded.filter(row => !migrations.some(m => m.id === row.id && m.name === row.name)).length };
    if (!legacy || legacy.c === 0) return;

    console.log(`[Schema] 检测到 ${legacy.c} 条旧版结构记录，正在收敛为单一 001 基线…`);
    this.db.exec('BEGIN');
    try {
      initial.up(this.db);
      this.db.exec('DELETE FROM _migrations');
      this.db.prepare('INSERT INTO _migrations (id, name) VALUES (?, ?)').run(initial.id, initial.name);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    console.log('[Schema] 历史记录已收敛，业务数据保持不变。');
  }

  /**
   * 运行待执行的迁移
   */
  async runMigrations(): Promise<void> {
    this.ensureMigrationTable();

    const migrations = this.loadMigrations();
    this.alignSquashedBaseline(migrations);
    const executed = this.getExecutedMigrations();
    for (const migration of migrations) {
      if (!executed.has(migration.id)) {
        console.log(`[Migration] Running ${migration.id}_${migration.name}...`);
        try {
          this.db.exec('BEGIN');
          migration.up(this.db);
          this.db
            .prepare('INSERT INTO _migrations (id, name) VALUES (?, ?)')
            .run(migration.id, migration.name);
          this.db.exec('COMMIT');
          console.log(`[Migration] ${migration.id}_${migration.name} completed.`);
        } catch (err) {
          this.db.exec('ROLLBACK');
          console.error(`[Migration] ${migration.id}_${migration.name} FAILED:`, err);
          throw err;
        }
      }
    }

    const reconciliation = reconcileSchema(this.db);
    if (reconciliation.actions.length > 0) {
      console.log(`[Schema] 已校准当前结构：${reconciliation.actions.join(', ')}`);
    }
    normalizeStoredConstitutions(this.db);
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
