import type { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { up } from './033_foreshadowing_lifecycle_metadata';

describe('033 foreshadowing lifecycle metadata migration', () => {
  it('adds the recovery window, evidence, and risk fields idempotently', () => {
    const { DatabaseSync: RealDatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
    const db: DatabaseSync = new RealDatabaseSync(':memory:');
    db.exec(`CREATE TABLE foreshadowings (id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'buried')`);

    up(db);
    up(db);

    const columns = (db.prepare('PRAGMA table_info(foreshadowings)').all() as any[]).map(row => row.name);
    expect(columns).toEqual(expect.arrayContaining([
      'recovery_window_start', 'recovery_window_end', 'evidence_text', 'risk_level',
    ]));
  });
});
