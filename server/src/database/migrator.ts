/**
 * 数据库迁移管理
 * 支持 up/down 回滚，迁移记录表
 */
import { DatabaseSync } from 'node:sqlite';
import * as path from 'path';
import * as fs from 'fs';
import { normalizeStoredConstitutions } from '../modules/project/creative-constitution';

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

  /** Apply the single current baseline once to databases carrying old migration ids. */
  private alignSquashedBaseline(migrations: Migration[]): void {
    const initial = migrations.find((m) => m.id === 1);
    if (!initial) return;
    const recorded = this.db.prepare('SELECT id,name FROM _migrations WHERE id>1').all() as Array<{id:number;name:string}>;
    const legacy = { c: recorded.filter(row => !migrations.some(m => m.id === row.id && m.name === row.name)).length };
    if (!legacy || legacy.c === 0) return;

    console.log(
      `[Migration] 检测到 ${legacy.c} 条历史增量迁移记录（迁移已 squash 为单一初始 schema），执行一次幂等对齐：补齐缺失列/索引，不改动业务数据…`,
    );
    this.db.exec('BEGIN');
    try {
      initial.up(this.db);
      this.db.exec('DELETE FROM _migrations');
      this.db.prepare('INSERT INTO _migrations (id, name) VALUES (?, ?)').run(initial.id, initial.name);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    console.log('[Migration] squash 对齐完成，迁移基线已收敛为 001 初始 schema。');
  }

  /**
   * 运行待执行的迁移
   */
  async runMigrations(): Promise<void> {
    this.ensureMigrationTable();

    const migrations = this.loadMigrations();
    this.alignSquashedBaseline(migrations);
    const executed = this.getExecutedMigrations();
    const applied = new Set<number>();

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
          applied.add(migration.id);
          console.log(`[Migration] ${migration.id}_${migration.name} completed.`);
        } catch (err) {
          this.db.exec('ROLLBACK');
          console.error(`[Migration] ${migration.id}_${migration.name} FAILED:`, err);
          throw err;
        }
      }
    }

    // Released baselines are immutable. All subsequent schema changes use new migrations.
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
