/**
 * Repository 鍩虹被
 * 鎻愪緵閫氱敤鐨勬暟鎹簱鎿嶄綔灏佽
 */
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { DatabaseService } from '../database.service';

export abstract class BaseRepository<T> {
  protected _db: DatabaseSync | null = null;

  constructor(
    protected readonly databaseService: DatabaseService,
    protected readonly tableName: string
  ) {}

  protected get db(): DatabaseSync {
    if (!this._db) {
      this._db = this.databaseService.getDb();
    }
    return this._db;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected get stmt(): Record<string, any> {
    return {};
  }

  /**
   * 鏍规嵁ID鏌ヨ鍗曟潯璁板綍
   */
  findById(id: string): T | undefined {
    const stmt = this.db.prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`);
    return stmt.get(id) as unknown as T | undefined;
  }

  /**
   * 鏌ヨ鎵€鏈夎褰?   */
  findAll(): T[] {
    const stmt = this.db.prepare(`SELECT * FROM ${this.tableName} ORDER BY created_at DESC`);
    return stmt.all() as unknown as T[];
  }

  /**
   * 鎸夋潯浠舵煡璇?   */
  findByField(field: string, value: unknown): T[] {
    const stmt = this.db.prepare(`SELECT * FROM ${this.tableName} WHERE ${field} = ? ORDER BY created_at DESC`);
    return stmt.all(this.toSqlInput(value)) as unknown as T[];
  }

  /**
   * 鎻掑叆璁板綍
   */
  insert(data: Record<string, unknown>): T {
    const keys = Object.keys(data);
    const placeholders = keys.map(() => '?').join(', ');
    const columns = keys.map((k) => `"${k}"`).join(', ');
    const values = keys.map((k) => this.toSqlInput(data[k]));

    const stmt = this.db.prepare(
      `INSERT INTO ${this.tableName} (${columns}) VALUES (${placeholders})`
    );
    stmt.run(...values);

    return this.findById(data.id as string) as T;
  }

  /**
   * 鏇存柊璁板綍
   */
  update(id: string, data: Record<string, unknown>): T | undefined {
    const keys = Object.keys(data).filter((k) => k !== 'id');
    if (keys.length === 0) return this.findById(id);

    const setClauses = keys.map((k) => `"${k}" = ?`).join(', ');
    const values = keys.map((k) => this.toSqlInput(data[k]));

    const stmt = this.db.prepare(
      `UPDATE ${this.tableName} SET ${setClauses} WHERE id = ?`
    );
    stmt.run(...values, id);

    return this.findById(id);
  }

  /**
   * 鍒犻櫎璁板綍
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`);
    const result = stmt.run(id);
    return Number(result.changes) > 0;
  }

  /**
   * 璁℃暟
   */
  count(field?: string, value?: unknown): number {
    if (field && value !== undefined) {
      const stmt = this.db.prepare(
        `SELECT COUNT(*) as count FROM ${this.tableName} WHERE ${field} = ?`
      );
      return (stmt.get(this.toSqlInput(value)) as unknown as { count: number }).count;
    }
    const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM ${this.tableName}`);
    return (stmt.get() as unknown as { count: number }).count;
  }

  /**
   * 鍒嗛〉鏌ヨ
   */
  paginate(offset: number, limit: number, orderBy = 'created_at', orderDir = 'DESC'): T[] {
    const stmt = this.db.prepare(
      `SELECT * FROM ${this.tableName} ORDER BY ${orderBy} ${orderDir} LIMIT ? OFFSET ?`
    );
    return stmt.all(limit, offset) as unknown as T[];
  }

  /**
   * 鏉′欢鍒犻櫎
   */
  deleteByField(field: string, value: unknown): number {
    const stmt = this.db.prepare(`DELETE FROM ${this.tableName} WHERE ${field} = ?`);
    const result = stmt.run(this.toSqlInput(value));
    return Number(result.changes);
  }

  /**
   * 浜嬪姟鍐呮搷浣?   */
  transaction<T>(fn: () => T): T {
    return this.databaseService.transaction(() => fn());
  }

  private toSqlInput(value: unknown): SQLInputValue {
    return value as SQLInputValue;
  }
}
