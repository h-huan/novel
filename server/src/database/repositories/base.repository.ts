/**
 * Repository 基类
 * 提供通用的数据库操作封装
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
   * 根据ID查询单条记录
   */
  findById(id: string): T | undefined {
    const stmt = this.db.prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`);
    return stmt.get(id) as unknown as T | undefined;
  }

  /**
   * 查询所有记录
   */
  findAll(): T[] {
    const stmt = this.db.prepare(`SELECT * FROM ${this.tableName} ORDER BY created_at DESC`);
    return stmt.all() as unknown as T[];
  }

  /**
   * 按条件查询
   */
  findByField(field: string, value: unknown): T[] {
    const stmt = this.db.prepare(`SELECT * FROM ${this.tableName} WHERE ${field} = ? ORDER BY created_at DESC`);
    return stmt.all(this.toSqlInput(value)) as unknown as T[];
  }

  /**
   * 插入记录
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
   * 更新记录
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
   * 删除记录
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`);
    const result = stmt.run(id);
    return Number(result.changes) > 0;
  }

  /**
   * 计数
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
   * 分页查询
   */
  paginate(offset: number, limit: number, orderBy = 'created_at', orderDir = 'DESC'): T[] {
    const stmt = this.db.prepare(
      `SELECT * FROM ${this.tableName} ORDER BY ${orderBy} ${orderDir} LIMIT ? OFFSET ?`
    );
    return stmt.all(limit, offset) as unknown as T[];
  }

  /**
   * 条件删除
   */
  deleteByField(field: string, value: unknown): number {
    const stmt = this.db.prepare(`DELETE FROM ${this.tableName} WHERE ${field} = ?`);
    const result = stmt.run(this.toSqlInput(value));
    return Number(result.changes);
  }

  /**
   * 事务内操作
   */
  transaction<T>(fn: () => T): T {
    return this.databaseService.transaction(() => fn());
  }

  private toSqlInput(value: unknown): SQLInputValue {
    return value as SQLInputValue;
  }
}
