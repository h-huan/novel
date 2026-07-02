/**
 * SQLite 数据库服务
 * 基于 Node.js 内置 node:sqlite (DatabaseSync)，WAL 模式，外键约束
 */
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { DatabaseSync } from 'node:sqlite';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const archiver = require('archiver');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const AdmZip = require('adm-zip');
import { Migrator } from './migrator';

// Statement 类型别名（node:sqlite 直接返回对象）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Statement = any;

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private db!: DatabaseSync;
  private _dbPath: string;

  constructor() {
    const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this._dbPath = path.join(dataDir, 'novel.db');
  }

  async onModuleInit() {
    this.db = new DatabaseSync(this._dbPath);

    // WAL 模式
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA synchronous = NORMAL');
    this.db.exec('PRAGMA foreign_keys = ON');
    this.db.exec('PRAGMA cache_size = -8000');

    // 运行迁移
    const migrator = new Migrator(this.db);
    await migrator.runMigrations();

    // 注册自定义函数
    this.registerFunctions();
  }

  onModuleDestroy() {
    if (this.db) {
      this.db.close();
    }
  }

  getDb(): DatabaseSync {
    return this.db;
  }

  get dbPath(): string {
    return this._dbPath;
  }

  /**
   * 执行事务 — node:sqlite 直接在 db 上操作即可
   */
  transaction<T>(fn: (db: DatabaseSync) => T): T {
    return fn(this.db);
  }

  /**
   * 预编译语句
   */
  prepare(sql: string): Statement {
    return this.db.prepare(sql);
  }

  /**
   * pragma 查询 — node:sqlite 返回数组对象
   */
  private pragmaGet(sql: string): Record<string, unknown>[] {
    return this.db.prepare(sql).all() as Record<string, unknown>[];
  }

  /**
   * 注册自定义 SQL 函数
   * node:sqlite 中 .function() 略有不同，直接使用 prepare + run 替代
   */
  private registerFunctions() {
    // node:sqlite 内置支持，不需要注册 update_timestamp
    // 直接在 SQL 中使用 datetime('now') 即可
  }

  /**
   * 获取数据库健康状态
   */
  getHealth(): { ok: boolean; integrityCheck: string; dbPath: string; size: number } {
    let integrityCheck = 'unknown';
    try {
      const result = this.pragmaGet('PRAGMA integrity_check');
      integrityCheck = JSON.stringify(result);
    } catch (e: any) {
      integrityCheck = `error: ${e.message}`;
    }

    let size = 0;
    try {
      if (fs.existsSync(this._dbPath)) {
        size = fs.statSync(this._dbPath).size;
      }
    } catch {
      // ignore stat errors
    }

    return {
      ok: integrityCheck.includes('ok') || integrityCheck.includes('integrity_check'),
      integrityCheck,
      dbPath: this._dbPath,
      size,
    };
  }

  /**
   * 双写: 同时写入 SQLite 和 JSON 备份文件
   */
  async dualWrite(key: string, data: object): Promise<void> {
    const now = new Date().toISOString();
    const id = uuidv4();
    const jsonData = JSON.stringify(data);

    // 确保双写表存在
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dual_write_store (
        id TEXT PRIMARY KEY,
        data_key TEXT NOT NULL,
        data_value TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // 写入 SQLite - 先删后插实现 upsert
    try {
      this.db.prepare(`DELETE FROM dual_write_store WHERE data_key = ?`).run(key);
      this.db.prepare(`
        INSERT INTO dual_write_store (id, data_key, data_value, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, key, jsonData, now, now);
    } catch {
      // 表可能还不存在，忽略
    }

    // 写入 JSON 备份文件
    const backupDir = path.join(path.dirname(this._dbPath), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    const backupPath = path.join(backupDir, `${safeKey}.json`);
    fs.writeFileSync(backupPath, jsonData, 'utf-8');
  }

  /**
   * 获取数据库统计
   */
  getStats() {
    const tables = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%'"
    ).all() as { name: string }[];

    const stats: Record<string, number> = {};
    for (const table of tables) {
      const result = this.db
        .prepare(`SELECT COUNT(*) as count FROM "${table.name}"`)
        .get() as { count: number };
      stats[table.name] = result.count;
    }

    return {
      dbPath: this._dbPath,
      tableCount: tables.length,
      tableStats: stats,
      journalMode: (this.pragmaGet('PRAGMA journal_mode') as any)[0]?.journal_mode,
    };
  }

  // ==================== 快照与备份 ====================

  private snapshotDir: string;
  private nightlyTimer: ReturnType<typeof setInterval> | null = null;

  private getSnapshotDir(): string {
    if (!this.snapshotDir) {
      const dataDir = path.dirname(this._dbPath);
      this.snapshotDir = path.join(dataDir, 'snapshots');
      if (!fs.existsSync(this.snapshotDir)) {
        fs.mkdirSync(this.snapshotDir, { recursive: true });
      }
    }
    return this.snapshotDir;
  }

  async createSnapshot(): Promise<string> {
    const snapshotDir = this.getSnapshotDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshotName = `snapshot_${timestamp}.novel`;
    const snapshotPath = path.join(snapshotDir, snapshotName);

    this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');

    return new Promise<string>((resolve, reject) => {
      const output = fs.createWriteStream(snapshotPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => resolve(snapshotPath));
      archive.on('error', (err: any) => reject(err));

      archive.pipe(output);
      archive.file(this._dbPath, { name: 'data/novel.db' });

      const walPath = this._dbPath + '-wal';
      if (fs.existsSync(walPath)) {
        archive.file(walPath, { name: 'data/novel.db-wal' });
      }

      const backupDir = path.join(path.dirname(this._dbPath), 'backups');
      if (fs.existsSync(backupDir)) {
        const backupFiles = fs.readdirSync(backupDir);
        for (const file of backupFiles) {
          const filePath = path.join(backupDir, file);
          if (fs.statSync(filePath).isFile()) {
            archive.file(filePath, { name: `backups/${file}` });
          }
        }
      }

      archive.append(JSON.stringify({
        type: 'full',
        created_at: new Date().toISOString(),
        db_size: fs.statSync(this._dbPath).size,
        backup_count: fs.existsSync(backupDir) ? fs.readdirSync(backupDir).length : 0,
        version: '1.0',
      }, null, 2), { name: '.snapshot_metadata.json' });

      archive.finalize();
    });
  }

  async createIncrementalBackup(): Promise<string> {
    const snapshotDir = this.getSnapshotDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `incremental_${timestamp}.novel`;
    const backupPath = path.join(snapshotDir, backupName);

    const allSnapshots = this.listSnapshotsSync()
      .filter((s) => s.type === 'full')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const lastFullSnapshot = allSnapshots.length > 0 ? allSnapshots[0].path : null;

    return new Promise<string>((resolve, reject) => {
      const output = fs.createWriteStream(backupPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      output.on('close', () => resolve(backupPath));
      archive.on('error', (err: any) => reject(err));
      archive.pipe(output);

      const backupDir = path.join(path.dirname(this._dbPath), 'backups');
      if (fs.existsSync(backupDir)) {
        for (const file of fs.readdirSync(backupDir)) {
          const filePath = path.join(backupDir, file);
          if (fs.statSync(filePath).isFile()) {
            archive.file(filePath, { name: `backups/${file}` });
          }
        }
      }

      archive.append(JSON.stringify({
        type: 'incremental',
        created_at: new Date().toISOString(),
        based_on_full_snapshot: lastFullSnapshot ? path.basename(lastFullSnapshot) : null,
        backup_count: fs.existsSync(backupDir) ? fs.readdirSync(backupDir).length : 0,
        version: '1.0',
      }, null, 2), { name: '.snapshot_metadata.json' });

      archive.finalize();
    });
  }

  async scheduleNightlyBackup(): Promise<void> {
    if (this.nightlyTimer) clearInterval(this.nightlyTimer);
    const checkInterval = 60_000;
    this.nightlyTimer = setInterval(async () => {
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() === 0) {
        try { await this.createSnapshot(); } catch (err) { /* ignore */ }
      }
    }, checkInterval);
    if (this.nightlyTimer && 'unref' in this.nightlyTimer) this.nightlyTimer.unref();
  }

  async restoreFromSnapshot(snapshotPath: string): Promise<void> {
    if (!fs.existsSync(snapshotPath)) throw new Error(`Snapshot not found: ${snapshotPath}`);
    if (!snapshotPath.endsWith('.novel')) throw new Error('Invalid snapshot file: must be .novel format');

    const zip = new AdmZip(snapshotPath);
    const dataDir = path.dirname(this._dbPath);
    const backupDir = path.join(dataDir, 'backups');

    const metaEntry = zip.getEntry('.snapshot_metadata.json');
    if (metaEntry) {
      const metadata = JSON.parse(metaEntry.getData().toString('utf-8'));
      if (metadata.type === 'incremental' && !fs.existsSync(this._dbPath)) {
        throw new Error('无法恢复增量备份：数据库文件不存在，请先恢复完整快照');
      }
    }

    this.db.close();

    try {
      const dbEntry = zip.getEntry('data/novel.db');
      if (dbEntry) {
        if (fs.existsSync(this._dbPath)) fs.copyFileSync(this._dbPath, this._dbPath + '.restore_bak');
        fs.writeFileSync(this._dbPath, dbEntry.getData());
      }

      const backupEntries = zip.getEntries().filter((e: any) => e.entryName.startsWith('backups/') && !e.isDirectory);
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      for (const entry of backupEntries) {
        const fileName = path.basename(entry.entryName);
        fs.writeFileSync(path.join(backupDir, fileName), entry.getData());
      }

      this.db = new DatabaseSync(this._dbPath);
      this.db.exec('PRAGMA journal_mode = WAL');
      this.db.exec('PRAGMA synchronous = NORMAL');
      this.db.exec('PRAGMA foreign_keys = ON');
      this.db.exec('PRAGMA cache_size = -8000');
    } catch (err) {
      try {
        this.db = new DatabaseSync(this._dbPath);
        this.db.exec('PRAGMA journal_mode = WAL');
        this.db.exec('PRAGMA synchronous = NORMAL');
        this.db.exec('PRAGMA foreign_keys = ON');
        this.db.exec('PRAGMA cache_size = -8000');
      } catch { /* ignore */ }
      throw err;
    }
  }

  async listSnapshots(): Promise<Array<{ path: string; size: number; date: string; type: 'full' | 'incremental' }>> {
    return this.listSnapshotsSync();
  }

  private listSnapshotsSync(): Array<{ path: string; size: number; date: string; type: 'full' | 'incremental' }> {
    const snapshotDir = this.getSnapshotDir();
    if (!fs.existsSync(snapshotDir)) return [];

    const files = fs.readdirSync(snapshotDir).filter((f) => f.endsWith('.novel')).sort().reverse();
    const snapshots: Array<{ path: string; size: number; date: string; type: 'full' | 'incremental' }> = [];

    for (const file of files) {
      const filePath = path.join(snapshotDir, file);
      try {
        const stat = fs.statSync(filePath);
        let type: 'full' | 'incremental' = 'full';
        if (file.startsWith('incremental_')) type = 'incremental';
        try {
          const zip = new AdmZip(filePath);
          const metaEntry = zip.getEntry('.snapshot_metadata.json');
          if (metaEntry) {
            const metadata = JSON.parse(metaEntry.getData().toString('utf-8'));
            if (metadata.type === 'incremental') type = 'incremental';
          }
        } catch { /* fallback to filename */ }
        snapshots.push({ path: filePath, size: stat.size, date: stat.mtime.toISOString(), type });
      } catch { /* skip */ }
    }
    return snapshots;
  }
}
