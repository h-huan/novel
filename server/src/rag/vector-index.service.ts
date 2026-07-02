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
  isAvailable(): boolean;
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
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    this.store = new SqliteVectorStore(path.join(dataDir, 'vectors.db'));
    this.logger.log('向量索引引擎初始化完成。存储模式: SQLite');
  }

  getStore(): VectorStore { return this.store; }
  getHealthStatus(): { available: boolean; detail: string } {
    return { available: this.store.isAvailable(), detail: 'SQLite 向量存储已就绪' };
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

  async indexChunks(collection: string, chunks: Array<{ chunk: Chunk; vector: number[] }>) {
    await this.store.upsert(collection, chunks.map(({ chunk, vector }) => ({
      id: chunk.id, vector,
      metadata: { text: chunk.text, docType: chunk.docType, ...chunk.metadata },
    })));
  }
}

class SqliteVectorStore implements VectorStore {
  private db!: DatabaseSync;
  private available = false;

  constructor(dbPath: string) {
    try {
      this.db = new DatabaseSync(dbPath);
      this.db.exec('PRAGMA journal_mode = WAL');
      this.db.exec(`CREATE TABLE IF NOT EXISTS vectors (
        collection TEXT NOT NULL, id TEXT NOT NULL,
        vector_json TEXT NOT NULL, metadata_json TEXT NOT NULL,
        PRIMARY KEY (collection, id))`);
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_vectors_col ON vectors(collection)');
      this.available = true;
    } catch { this.available = false; }
  }

  async upsert(collection: string, chunks: VectorUpsertPayload[]) {
    if (!this.available) return;
    try {
      for (const c of chunks)
        this.db.prepare('INSERT OR REPLACE INTO vectors VALUES (?,?,?,?)')
          .run(collection, c.id, JSON.stringify(c.vector), JSON.stringify(c.metadata));
    } catch { /* ignore */ }
  }

  async query(collection: string, qv: number[], limit: number, filters?: SearchFilters) {
    if (!this.available) return [];
    try {
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
    } catch { return []; }
  }

  async delete(collection: string, ids: string[]) {
    if (!this.available) return;
    try { for (const id of ids) this.db.prepare('DELETE FROM vectors WHERE collection=? AND id=?').run(collection, id); } catch { /* ignore */ }
  }

  async count(collection: string): Promise<number> {
    if (!this.available) return 0;
    try { return (this.db.prepare('SELECT COUNT(*) as c FROM vectors WHERE collection=?').get(collection) as any)?.c ?? 0; } catch { return 0; }
  }

  isAvailable(): boolean { return this.available; }
}

function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return (na === 0 || nb === 0) ? 0 : d / (Math.sqrt(na) * Math.sqrt(nb));
}
