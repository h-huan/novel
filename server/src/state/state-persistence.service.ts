/**
 * 状态持久化服务 (State Persistence Service)
 *
 * SQLite 存储 + 每章快照 + 状态变更日志
 *
 * 三层架构:
 * L1: 内存缓存（LRU）
 * L2: SQLite 持久化
 * L3: 变更日志审计
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { StateEngineService } from './state-engine.service';
import type { CharacterStateSnapshot, StateChange } from './state-engine.service';

/** 数据库行类型 */
interface SnapshotRow {
  id: string;
  character_id: string;
  chapter_id: string;
  snapshot_order: number;
  states_json: string;
  changed_dimensions: string;
  previous_snapshot_id: string | null;
  change_summary: string | null;
  confidence: number;
  needs_review: number;
  created_by: string;
  created_at: string;
}

interface ChangeLogRow {
  id: string;
  snapshot_id: string;
  character_id: string;
  dimension: string;
  old_value: string | null;
  new_value: string | null;
  change_source: string;
  trigger_keyword: string | null;
  chapter_id: string | null;
  created_at: string;
}

@Injectable()
export class StatePersistenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StatePersistenceService.name);

  /** 内存 LRU 缓存 */
  private cache = new Map<string, { snapshot: CharacterStateSnapshot; timestamp: number }>();
  private readonly MAX_CACHE_SIZE = 200;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5分钟

  /** 数据库路径 */
  private db: any = null;
  private writeCount = 0;
  private snapshotCounter = new Map<string, number>(); // characterId -> order

  async onModuleInit(): Promise<void> {
    try {
      await this.initDatabase();
      this.logger.log('状态持久化服务初始化完成');
    } catch (error) {
      this.logger.warn('数据库初始化失败，将以纯内存模式运行');
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.db) {
      try {
        this.db.close();
      } catch { /* ignore */ }
    }
  }

  /**
   * 初始化 SQLite 数据库
   */
  private async initDatabase(): Promise<void> {
    try {
      const { DatabaseSync } = await import('node:sqlite');
      const path = await import('path');
      const { mkdirSync } = await import('fs');

      const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
      try { mkdirSync(dataDir, { recursive: true }); } catch { /* ignore */ }

      this.db = new DatabaseSync(path.join(dataDir, 'state.db'));
      this.db.exec('PRAGMA journal_mode = WAL');
      this.db.exec('PRAGMA foreign_keys = ON');

      this.createTables();
    } catch {
      this.db = null;
      throw new Error('无法加载 SQLite');
    }
  }

  /**
   * 创建表结构
   */
  private createTables(): void {
    if (!this.db) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS character_state_snapshots (
        id TEXT PRIMARY KEY,
        character_id TEXT NOT NULL,
        chapter_id TEXT NOT NULL,
        snapshot_order INTEGER NOT NULL,
        states_json TEXT NOT NULL,
        changed_dimensions TEXT,
        previous_snapshot_id TEXT,
        change_summary TEXT,
        confidence REAL DEFAULT 1.0,
        needs_review INTEGER DEFAULT 0,
        created_by TEXT DEFAULT 'system',
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_snapshots_char_order
        ON character_state_snapshots(character_id, snapshot_order);

      CREATE INDEX IF NOT EXISTS idx_snapshots_needs_review
        ON character_state_snapshots(needs_review) WHERE needs_review = 1;

      CREATE TABLE IF NOT EXISTS state_change_log (
        id TEXT PRIMARY KEY,
        snapshot_id TEXT NOT NULL,
        character_id TEXT NOT NULL,
        dimension TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        change_source TEXT NOT NULL,
        trigger_keyword TEXT,
        chapter_id TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (snapshot_id) REFERENCES character_state_snapshots(id)
      );

      CREATE INDEX IF NOT EXISTS idx_changes_dimension
        ON state_change_log(character_id, dimension);
    `);
  }

  /**
   * 保存状态快照
   */
  async saveSnapshot(snapshot: CharacterStateSnapshot): Promise<void> {
    // 更新计数器
    const currentOrder = (this.snapshotCounter.get(snapshot.characterId) || 0) + 1;
    this.snapshotCounter.set(snapshot.characterId, currentOrder);

    // 写入 L1 缓存
    this.cacheSet(snapshot.characterId, snapshot);

    // 写入 L2 SQLite
    if (this.db) {
      try {
        const stmt = this.db.prepare(`
          INSERT INTO character_state_snapshots
            (id, character_id, chapter_id, snapshot_order, states_json,
             changed_dimensions, previous_snapshot_id, change_summary,
             confidence, needs_review, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          snapshot.snapshotId,
          snapshot.characterId,
          snapshot.chapterId,
          currentOrder,
          JSON.stringify(snapshot.states),
          JSON.stringify(snapshot.changedDimensions),
          snapshot.previousSnapshotId || null,
          snapshot.changeSummary || null,
          1.0,
          snapshot.createdBy === 'auto_detect' ? 1 : 0,
          snapshot.createdBy,
          snapshot.timestamp.toISOString(),
        );

        this.writeCount++;
        if (this.writeCount >= 100) {
          this.db.exec('PRAGMA wal_checkpoint(RESTART)');
          this.writeCount = 0;
        }
      } catch (error) {
        this.logger.error(`保存快照失败: ${snapshot.snapshotId}`, error);
      }
    }
  }

  /**
   * 获取最新状态快照
   */
  async getLatestSnapshot(characterId: string): Promise<CharacterStateSnapshot | null> {
    // 先查 L1 缓存
    const cached = this.cacheGet(characterId);
    if (cached) return cached;

    // 查 L2 SQLite
    if (this.db) {
      try {
        const row = this.db.prepare(`
          SELECT * FROM character_state_snapshots
          WHERE character_id = ?
          ORDER BY snapshot_order DESC
          LIMIT 1
        `).get(characterId) as SnapshotRow | undefined;

        if (row) {
          const snapshot = this.rowToSnapshot(row);
          this.cacheSet(characterId, snapshot);
          return snapshot;
        }
      } catch (error) {
        this.logger.error(`查询最新快照失败: ${characterId}`, error);
      }
    }

    return null;
  }

  /**
   * 获取指定章节的状态快照
   */
  async getSnapshotByChapter(characterId: string, chapterId: string): Promise<CharacterStateSnapshot | null> {
    if (this.db) {
      try {
        const row = this.db.prepare(`
          SELECT * FROM character_state_snapshots
          WHERE character_id = ? AND chapter_id = ?
          ORDER BY snapshot_order DESC
          LIMIT 1
        `).get(characterId, chapterId) as SnapshotRow | undefined;

        if (row) {
          return this.rowToSnapshot(row);
        }
      } catch (error) {
        this.logger.error(`查询章节快照失败: ${characterId}/${chapterId}`, error);
      }
    }

    return null;
  }

  /**
   * 获取状态变更历史
   */
  async getChangeHistory(
    characterId: string,
    limit = 20,
    offset = 0,
  ): Promise<Array<{ snapshot: CharacterStateSnapshot; changes: StateChange[] }>> {
    if (!this.db) return [];

    try {
      const rows = this.db.prepare(`
        SELECT * FROM character_state_snapshots
        WHERE character_id = ?
        ORDER BY snapshot_order DESC
        LIMIT ? OFFSET ?
      `).all(characterId, limit, offset) as SnapshotRow[];

      return rows.map(row => {
        const snapshot = this.rowToSnapshot(row);

        // 生成变化列表
        const changes: StateChange[] = (snapshot.changedDimensions || []).map(dim => ({
          dimension: dim,
          changeType: 'set_value' as const,
          suggestedValue: snapshot.states[dim],
          autoApply: true,
          needsReview: false,
          confidence: 1.0,
        }));

        return { snapshot, changes };
      });
    } catch (error) {
      this.logger.error(`查询变更历史失败: ${characterId}`, error);
      return [];
    }
  }

  /**
   * 保存状态变更日志
   */
  async saveChangeLog(
    snapshotId: string,
    characterId: string,
    dimension: string,
    oldValue: unknown,
    newValue: unknown,
    source: string,
    triggerKeyword?: string,
    chapterId?: string,
  ): Promise<void> {
    if (!this.db) return;

    try {
      const stmt = this.db.prepare(`
        INSERT INTO state_change_log
          (id, snapshot_id, character_id, dimension, old_value, new_value,
           change_source, trigger_keyword, chapter_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        this.generateId(),
        snapshotId,
        characterId,
        dimension,
        oldValue !== undefined ? JSON.stringify(oldValue) : null,
        newValue !== undefined ? JSON.stringify(newValue) : null,
        source,
        triggerKeyword || null,
        chapterId || null,
        new Date().toISOString(),
      );
    } catch (error) {
      this.logger.error(`保存变更日志失败: ${snapshotId}`, error);
    }
  }

  /**
   * 获取待确认的状态变化
   */
  async getPendingReviews(): Promise<CharacterStateSnapshot[]> {
    if (!this.db) return [];

    try {
      const rows = this.db.prepare(`
        SELECT * FROM character_state_snapshots
        WHERE needs_review = 1
        ORDER BY created_at DESC
      `).all() as SnapshotRow[];

      return rows.map(row => this.rowToSnapshot(row));
    } catch (error) {
      this.logger.error('查询待确认变化失败', error);
      return [];
    }
  }

  /**
   * 标记快照为已审核
   */
  async markReviewed(snapshotId: string): Promise<void> {
    if (!this.db) return;

    try {
      this.db.prepare(`
        UPDATE character_state_snapshots
        SET needs_review = 0, reviewed_at = ?
        WHERE id = ?
      `).run(new Date().toISOString(), snapshotId);
    } catch (error) {
      this.logger.error(`标记已审核失败: ${snapshotId}`, error);
    }
  }

  /**
   * 获取数据库统计信息
   */
  getStats(): { totalSnapshots: number; totalCharacters: number; cacheSize: number } {
    if (!this.db) {
      return { totalSnapshots: 0, totalCharacters: 0, cacheSize: this.cache.size };
    }

    try {
      const snapshots = this.db.prepare('SELECT COUNT(*) as cnt FROM character_state_snapshots').get() as { cnt: number };
      const characters = this.db.prepare('SELECT COUNT(DISTINCT character_id) as cnt FROM character_state_snapshots').get() as { cnt: number };

      return {
        totalSnapshots: snapshots.cnt,
        totalCharacters: characters.cnt,
        cacheSize: this.cache.size,
      };
    } catch {
      return { totalSnapshots: 0, totalCharacters: 0, cacheSize: this.cache.size };
    }
  }

  /**
   * 获取记忆健康度报告 (P4)
   * 每日自动校验：角色/章节/伏笔/状态一致性
   */
  async getHealthReport(): Promise<{
    overall: 'healthy' | 'warning' | 'critical';
    checks: { name: string; status: 'pass' | 'warn' | 'fail'; detail: string }[];
    summary: string;
    timestamp: string;
  }> {
    const report: any = {
      overall: 'healthy' as const,
      checks: [],
      summary: '',
      timestamp: new Date().toISOString(),
    };

    try {
      if (!this.db) {
        report.overall = 'critical';
        report.checks.push({ name: '数据库连接', status: 'fail', detail: '数据库未初始化' });
        report.summary = '数据库未连接，所有持久化功能不可用';
        return report;
      }

      const integrity = this.db.prepare('PRAGMA integrity_check').get() as any;
      const dbOk = integrity?.integrity_check === 'ok';
      report.checks.push({
        name: '数据库完整性',
        status: dbOk ? 'pass' : 'fail',
        detail: dbOk ? 'SQLite 完整性校验通过' : '数据库可能损坏',
      });
      if (!dbOk) report.overall = 'critical';

      const orphanedSnapshots = this.db.prepare(`
        SELECT COUNT(*) as cnt FROM character_state_snapshots s
        LEFT JOIN character_state_snapshots p ON s.previous_snapshot_id = p.id
        WHERE s.previous_snapshot_id IS NOT NULL AND p.id IS NULL
      `).get() as { cnt: number };
      report.checks.push({
        name: '快照链完整性',
        status: orphanedSnapshots.cnt === 0 ? 'pass' : orphanedSnapshots.cnt < 5 ? 'warn' : 'fail',
        detail: orphanedSnapshots.cnt === 0 ? '所有快照链完整' : `发现 ${orphanedSnapshots.cnt} 个孤立快照`,
      });
      if (orphanedSnapshots.cnt >= 5) report.overall = 'warning';

      const dbCount = (this.db.prepare('SELECT COUNT(DISTINCT character_id) as cnt FROM character_state_snapshots').get() as { cnt: number }).cnt;
      const cacheCount = this.cache.size;
      const cacheMatch = dbCount === 0 || Math.abs(cacheCount - dbCount) <= 2;
      report.checks.push({
        name: '缓存一致性',
        status: cacheMatch ? 'pass' : 'warn',
        detail: `数据库 ${dbCount} 个角色, 缓存 ${cacheCount} 个角色`,
      });
      if (!cacheMatch) report.overall = 'warning';

      const logCount = this.db.prepare('SELECT COUNT(*) as cnt FROM state_change_log').get() as { cnt: number };
      const snapshotCount = (this.db.prepare('SELECT COUNT(*) as cnt FROM character_state_snapshots').get() as { cnt: number }).cnt;
      report.checks.push({
        name: '变更日志',
        status: logCount.cnt >= snapshotCount ? 'pass' : 'warn',
        detail: `${logCount.cnt} 条变更日志, ${snapshotCount} 个快照`,
      });

      report.summary = report.overall === 'healthy'
        ? '所有记忆系统运行正常'
        : report.overall === 'warning'
          ? '存在少量不一致，建议检查告警项'
          : '数据库异常，需要立即修复';
    } catch (err) {
      report.overall = 'critical';
      report.checks.push({
        name: '健康检查异常',
        status: 'fail',
        detail: err instanceof Error ? err.message : '未知错误',
      });
      report.summary = '健康检查执行失败';
    }

    return report;
  }

  /**
   * 行转快照对象
   */
  private rowToSnapshot(row: SnapshotRow): CharacterStateSnapshot {
    return {
      snapshotId: row.id,
      characterId: row.character_id,
      chapterId: row.chapter_id,
      timestamp: new Date(row.created_at),
      states: JSON.parse(row.states_json),
      changedDimensions: JSON.parse(row.changed_dimensions || '[]'),
      previousSnapshotId: row.previous_snapshot_id || undefined,
      createdBy: row.created_by as CharacterStateSnapshot['createdBy'],
      changeSummary: row.change_summary || undefined,
    };
  }

  /** L1 缓存读 */
  private cacheGet(characterId: string): CharacterStateSnapshot | null {
    const key = `latest:${characterId}`;
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }

    return entry.snapshot;
  }

  /** L1 缓存写 */
  private cacheSet(characterId: string, snapshot: CharacterStateSnapshot): void {
    const key = `latest:${characterId}`;
    this.cache.set(key, { snapshot, timestamp: Date.now() });

    // LRU 淘汰
    if (this.cache.size > this.MAX_CACHE_SIZE) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
  }

  /** 生成UUID */
  private generateId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
