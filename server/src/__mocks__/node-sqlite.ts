/**
 * Mock for node:sqlite — used by vitest
 * Implements a minimal in-memory SQLite-compatible DatabaseSync
 */
// @ts-nocheck

class MockStatement {
  private sql: string;
  private db: MockDatabase;

  constructor(db: MockDatabase, sql: string) {
    this.db = db;
    this.sql = sql;
  }

  all(...params: unknown[]): unknown[] {
    return this.db.execute(this.sql, params);
  }

  get(...params: unknown[]): unknown | undefined {
    const rows = this.db.execute(this.sql, params);
    return rows[0];
  }

  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint } {
    const rows = this.db.execute(this.sql, params);
    return { changes: 1, lastInsertRowid: 1 };
  }
}

class MockDatabase {
  private tables: Map<string, unknown[]> = new Map();

  constructor(_location: string, _options?: Record<string, unknown>) {}

  close(): void {}

  exec(sql: string): void {
    // Simple CREATE TABLE handling
    if (sql.toUpperCase().includes('CREATE TABLE')) {
      const match = sql.match(/CREATE TABLE.*?(\w+)\s*\(/i);
      if (match && !this.tables.has(match[1])) {
        this.tables.set(match[1], []);
      }
    }
    // Simple INSERT handling
    if (sql.toUpperCase().includes('INSERT')) {
      this.tables.set('last_insert', [{ ok: true }]);
    }
  }

  prepare(sql: string): MockStatement {
    return new MockStatement(this, sql);
  }

  execute(_sql: string, _params: unknown[]): unknown[] {
    return [];
  }
}

export const DatabaseSync = MockDatabase;
export default MockDatabase;
