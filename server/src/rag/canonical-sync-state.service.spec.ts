import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { up as initSchema } from '../database/migrations/001_initial';
import { CanonicalSyncStateService } from './canonical-sync-state.service';

function fixture() {
  const { DatabaseSync: RealDatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
  const db = new RealDatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=OFF;');
  initSchema(db);
  const embedding = { embed: vi.fn(async () => [[0.1, 0.2]]) };
  const vectorIndex = { indexChunksStrict: vi.fn(async () => undefined) };
  const service = new CanonicalSyncStateService({ getDb: () => db } as any, embedding as any, vectorIndex as any);
  return { db, embedding, vectorIndex, service };
}

describe('CanonicalSyncStateService', () => {
  it('keeps a visible retryable warning when indexing fails', async () => {
    const { service } = fixture();
    const result = await service.run('p', 'character', 'c', async () => { throw new Error('embedding unavailable'); });
    expect(result).toMatchObject({ indexStatus: 'warning', needsResync: true, lastError: 'embedding unavailable' });
    expect(service.list('p')[0]).toMatchObject({ indexStatus: 'warning', needsResync: true, lastError: 'embedding unavailable' });
  });

  it('rebuilds a character index from canonical data and clears the warning', async () => {
    const { db, service, vectorIndex } = fixture();
    db.prepare(`INSERT INTO characters (id, project_id, name, identity, personality, background, dialogue_style, created_at, updated_at) VALUES ('c','p','林川','调查员','谨慎','旧案幸存者','短句','t','t')`).run();
    const result = await service.retry('p', 'character', 'c');
    expect(result).toMatchObject({ indexStatus: 'completed', needsResync: false });
    expect(vectorIndex.indexChunksStrict).toHaveBeenCalledOnce();
    expect(service.list('p')[0]).toMatchObject({ indexStatus: 'completed', needsResync: false, lastError: null });
  });
});
