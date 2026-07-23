import type { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { up } from './032_canonical_entity_sync_states';

describe('032 canonical entity sync states migration', () => {
  it('persists retryable index status and failure details', () => {
    const { DatabaseSync: RealDatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
    const db: DatabaseSync = new RealDatabaseSync(':memory:');
    up(db);
    const columns = (db.prepare('PRAGMA table_info(canonical_entity_sync_states)').all() as any[]).map(row => row.name);
    expect(columns).toEqual(expect.arrayContaining([
      'project_id', 'entity_type', 'entity_id', 'index_status', 'needs_resync',
      'last_error', 'last_attempt_at', 'synced_at', 'updated_at',
    ]));
  });
});
