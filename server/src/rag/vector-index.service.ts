/**
 * 向量索引引擎 (Vector Index Service)
 *
 * SQLite 持久化向量存储 + 余弦相似度检索
 * 替代 ChromaDB，零外部依赖，重启不丢失数据
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseSync } from 'node:sqlite';
import * as path from 'path';
import * as fs from 'fs';
import type { DocType, RTCOTier, SearchFilters, VectorUpsertPayload } from './types';
import type { Chunk } from './chunker.service';

export interface VectorStore {
  upsert(collection: string, chunks: VectorUpsertPayload[]): Promise<void>;
  query(collection: string, vector: number[], limit: number, filters?: SearchFilters): Promise<Array<{
    id: string; score: number; metadata: Record<string, unknown>;
  }>>;
  delete(collection: string, ids: string[]): Promise<void>;
  count(collection: string): Promise<number>;
  upsertStrict(collection: string, chunks: VectorUpsertPayload[]): Promise<void>;
  deleteStrict(collection: string, ids: string[]): Promise<void>;
  findByMetadata(collection: string, filters: Record<string, unknown>): Promise<Array<{
    id: string; vector: number[]; metadata: Record<string, unknown>;
  }>>;
  isAvailable(): boolean;
  getHealthDetail(): string;
}

@Injectable()
export class VectorIndexService implements OnModuleInit {
  private readonly logger = new Logger(VectorIndexService.name);
  private store!: SqliteVectorStore;

  static readonly COLLECTIONS = {
    GLOBAL_KNOWLEDGE: 'global_knowledge',
    CHARACTERS: 'characters',
    CHAPTERS_ROLLING: 'chapters_rolling',
    FORESHADOWINGS: 'foreshadowings',
  } as const;

  async onModuleInit(): Promise<void> {
    const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    this.store = new SqliteVectorStore(path.join(dataDir, 'vectors.db'));
    this.logger.log('向量索引引擎初始化完成。存储模式: SQLite');
  }

  getStore(): VectorStore { return this.store; }
  getHealthStatus(): { available: boolean; detail: string } {
    return { available: this.store.isAvailable(), detail: this.store.getHealthDetail() };
  }
  isAvailable(): boolean { return this.store.isAvailable(); }

  async addChunks(collection: string, chunks: Array<{ id: string; vector: number[]; metadata: Record<string, unknown> }>) {
    await this.store.upsert(collection, chunks);
  }
  async deleteChunks(collection: string, ids: string[]) { await this.store.delete(collection, ids); }
  async updateChunks(collection: string, chunks: Array<{ id: string; vector: number[]; metadata: Record<string, unknown> }>) {
    await this.store.delete(collection, chunks.map(c => c.id));
    await this.store.upsert(collection, chunks);
  }
  async query(collection: string, queryVector: number[], limit: number, filters?: SearchFilters) {
    return this.store.query(collection, queryVector, limit, filters);
  }
  async count(collection: string): Promise<number> { return this.store.count(collection); }

  async upsertChunksStrict(collection: string, chunks: VectorUpsertPayload[]): Promise<void> {
    await this.store.upsertStrict(collection, chunks);
  }

  async deleteChunksStrict(collection: string, ids: string[]): Promise<void> {
    await this.store.deleteStrict(collection, ids);
  }

  async getChunksByMetadata(collection: string, filters: Record<string, unknown>) {
    return this.store.findByMetadata(collection, filters);
  }

  async indexChunks(collection: string, chunks: Array<{ chunk: Chunk; vector: number[] }>) {
    await this.store.upsert(collection, chunks.map(({ chunk, vector }) => ({
      id: chunk.id, vector,
      metadata: { text: chunk.text, docType: chunk.docType, ...chunk.metadata },
    })));
  }

  async indexChunksStrict(collection: string, chunks: Array<{ chunk: Chunk; vector: number[] }>) {
    await this.store.upsertStrict(collection, chunks.map(({ chunk, vector }) => ({
      id: chunk.id, vector,
      metadata: { text: chunk.text, docType: chunk.docType, ...chunk.metadata },
    })));
  }
}

class SqliteVectorStore implements VectorStore {
  private db!: DatabaseSync;
  private available = false;
  private writeCount = 0;
  private initializationError = '';

  constructor(dbPath: string) {
    try {
      this.db = new DatabaseSync(dbPath);
      this.db.exec('PRAGMA journal_mode = WAL');
      // WAL 文件自动 checkpoint：每次写操作后积累，每 100 次合并到主文件
      this.db.exec('PRAGMA wal_autocheckpoint = 100');
      this.db.exec(`CREATE TABLE IF NOT EXISTS vectors (
        collection TEXT NOT NULL, id TEXT NOT NULL,
        vector_json TEXT NOT NULL, metadata_json TEXT NOT NULL,
        PRIMARY KEY (collection, id))`);
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_vectors_col ON vectors(collection)');
      this.available = true;
    } catch (error) {
      this.available = false;
      this.initializationError = error instanceof Error ? error.message : String(error);
    }
  }

  async upsert(collection: string, chunks: VectorUpsertPayload[]) {
    await this.upsertStrict(collection, chunks);
  }

  async upsertStrict(collection: string, chunks: VectorUpsertPayload[]): Promise<void> {
    this.assertAvailable();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const stmt = this.db.prepare('INSERT OR REPLACE INTO vectors VALUES (?,?,?,?)');
      for (const chunk of chunks) {
        stmt.run(collection, chunk.id, JSON.stringify(chunk.vector), JSON.stringify(chunk.metadata));
      }
      this.db.exec('COMMIT');
      this.maybeCheckpoint();
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private maybeCheckpoint() {
    this.writeCount++;
    // 每 500 次写入强制 RESTART checkpoint（SQLite 自动 checkpoint 是 PASSIVE，不保证立即合并）
    if (this.writeCount >= 500) {
      try { this.db.exec('PRAGMA wal_checkpoint(RESTART)'); } catch { /* ignore */ }
      this.writeCount = 0;
    }
  }

  async query(collection: string, qv: number[], limit: number, filters?: SearchFilters) {
    this.assertAvailable();
    const rows = this.db.prepare('SELECT id,vector_json,metadata_json FROM vectors WHERE collection=?').all(collection) as any[];
    const r: Array<{ id: string; score: number; metadata: Record<string, unknown> }> = [];
    for (const row of rows) {
      const meta = JSON.parse(row.metadata_json);
      if (filters) {
        if (filters.docTypes && !filters.docTypes.includes(meta['docType'] as DocType)) continue;
        if (filters.priorities && !filters.priorities.includes(meta['priority'] as RTCOTier)) continue;
        if (filters.locked !== undefined && meta['locked'] !== filters.locked) continue;
      }
      const vec = JSON.parse(row.vector_json);
      r.push({ id: row.id, score: cosineSim(qv, vec), metadata: meta });
    }
    return r.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  async delete(collection: string, ids: string[]) {
    await this.deleteStrict(collection, ids);
  }

  async deleteStrict(collection: string, ids: string[]): Promise<void> {
    this.assertAvailable();
    if (ids.length === 0) return;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const stmt = this.db.prepare('DELETE FROM vectors WHERE collection=? AND id=?');
      for (const id of ids) stmt.run(collection, id);
      this.db.exec('COMMIT');
      this.maybeCheckpoint();
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async findByMetadata(collection: string, filters: Record<string, unknown>) {
    this.assertAvailable();
    const rows = this.db.prepare(
      'SELECT id, vector_json, metadata_json FROM vectors WHERE collection = ?'
    ).all(collection) as Array<{ id: string; vector_json: string; metadata_json: string }>;
    return rows.map((row) => ({
      id: row.id,
      vector: JSON.parse(row.vector_json) as number[],
      metadata: JSON.parse(row.metadata_json) as Record<string, unknown>,
    })).filter((row) => Object.entries(filters).every(([key, value]) => row.metadata[key] === value));
  }

  async count(collection: string): Promise<number> {
    this.assertAvailable();
    return (this.db.prepare('SELECT COUNT(*) as c FROM vectors WHERE collection=?').get(collection) as any)?.c ?? 0;
  }

  isAvailable(): boolean { return this.available; }
  getHealthDetail(): string { return this.available ? 'SQLite 向量存储已就绪' : `SQLite 向量存储不可用: ${this.initializationError || '未知初始化错误'}`; }

  private assertAvailable(): void {
    if (!this.available) throw new Error('Vector store is unavailable');
  }
}

function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return (na === 0 || nb === 0) ? 0 : d / (Math.sqrt(na) * Math.sqrt(nb));
}
