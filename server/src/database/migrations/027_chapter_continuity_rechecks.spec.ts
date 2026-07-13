import type { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { up as secondBatchUp } from './026_chapter_derived_data_sync';
import { down, up } from './027_chapter_continuity_rechecks';

const columns = (db: DatabaseSync) => (db.prepare('PRAGMA table_info(chapter_derived_sync_states)').all() as any[]).map((x) => x.name);
const { DatabaseSync: RealDatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

describe('027 chapter continuity rechecks migration', () => {
  it('runs successfully on an empty database', () => {
    const db = new RealDatabaseSync(':memory:'); up(db);
    expect(columns(db)).toContain('foreshadowing_sync_status');
  });

  it('upgrades the second-batch schema and creates all continuity columns', () => {
    const db = new RealDatabaseSync(':memory:'); secondBatchUp(db); up(db);
    expect(columns(db)).toEqual(expect.arrayContaining(['foreshadowing_sync_status','timeline_sync_status','outline_sync_status','needs_author_review']));
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='chapter_continuity_reviews'").get()).toBeTruthy();
  });

  it('fills only missing columns when one already exists', () => {
    const db = new RealDatabaseSync(':memory:'); secondBatchUp(db);
    db.exec("ALTER TABLE chapter_derived_sync_states ADD COLUMN foreshadowing_sync_status TEXT NOT NULL DEFAULT 'completed'");
    up(db); expect(columns(db)).toEqual(expect.arrayContaining(['timeline_sync_status','outline_sync_status']));
  });

  it('can run repeatedly while preserving existing sync data', () => {
    const db = new RealDatabaseSync(':memory:'); secondBatchUp(db); up(db);
    db.prepare(`INSERT INTO chapter_derived_sync_states (chapter_id,project_id,content_checksum,summary_sync_status,vector_sync_status,needs_resync,updated_at) VALUES ('c','p','sum','completed','completed',0,'now')`).run();
    up(db); up(db);
    expect((db.prepare("SELECT content_checksum FROM chapter_derived_sync_states WHERE chapter_id='c'").get() as any).content_checksum).toBe('sum');
  });

  it('down is repeatable and conservatively retains sync columns and data', () => {
    const db = new RealDatabaseSync(':memory:'); secondBatchUp(db); up(db); down(db); down(db);
    expect(columns(db)).toContain('foreshadowing_sync_status');
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='chapter_continuity_reviews'").get()).toBeUndefined();
  });
});
