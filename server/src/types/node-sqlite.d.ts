/**
 * Type declarations for node:sqlite (Node.js 22.5+ built-in)
 * Minimal types covering the APIs used in this project
 */
declare module 'node:sqlite' {
  interface SQLiteRunResult {
    changes: number;
    lastInsertRowid: number | bigint;
  }

  interface SQLiteStatement {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown | undefined;
    run(...params: unknown[]): SQLiteRunResult;
    iterate(...params: unknown[]): IterableIterator<unknown>;
    expandedSQL: string;
  }

  class DatabaseSync {
    constructor(location: string, options?: { open?: boolean });
    close(): void;
    exec(sql: string): void;
    prepare(sql: string): SQLiteStatement;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createFunction(name: string, fn: (...args: any[]) => any, options?: Record<string, unknown>): void;
  }

  export { DatabaseSync, SQLiteRunResult, SQLiteStatement };
}
