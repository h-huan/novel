import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { up as stateUp } from '../../database/migrations/017_state_items_and_evolution';
import { up as syncUp } from '../../database/migrations/026_chapter_derived_data_sync';
import { up as continuityUp } from '../../database/migrations/027_chapter_continuity_rechecks';
import { StateItemService } from '../../state/state-item.service';
import { ChapterDerivedDataSyncService } from './chapter-derived-data-sync.service';
import { createHash } from 'node:crypto';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

function fixture() {
  const db = new DatabaseSync(':memory:'); stateUp(db); syncUp(db); continuityUp(db);
  const database = { getDb: () => db } as any;
  const stateItems = new StateItemService(database);
  const service = new ChapterDerivedDataSyncService(database, {} as any, {} as any, {} as any, {} as any, undefined, stateItems);
  const input = { projectId: 'p', chapterId: 'c', beforeContent: 'old', afterContent: 'new', reason: 'manual_resync' } as const;
  const issue = { type: 'removed_recovery', target: 'f', requirement: '伏笔', old: 'old', next: '', severity: 'high', block: true };
  return { db, service: service as any, input, issue };
}

describe('continuity review idempotency', () => {
  it('creates one review and one linked state item', () => {
    const { db,service,input,issue }=fixture(); const result=service.persistReviews(input,'sum','foreshadowing',[issue]);
    expect(result.reviewIds).toHaveLength(1); expect(result.stateItemIds).toHaveLength(1);
    expect((db.prepare('SELECT COUNT(*) count FROM state_items').get() as any).count).toBe(1);
  });

  it('reuses review and state item for the same checksum', () => {
    const { db,service,input,issue }=fixture(); const first=service.persistReviews(input,'sum','foreshadowing',[issue]); const second=service.persistReviews(input,'sum','foreshadowing',[issue]);
    expect(second.reviewIds).toEqual(first.reviewIds); expect(second.stateItemIds).toEqual(first.stateItemIds);
    expect((db.prepare('SELECT COUNT(*) count FROM state_items').get() as any).count).toBe(1);
  });

  it('repairs a review whose state item link is empty exactly once', () => {
    const { db,service,input,issue }=fixture(); service.persistReviews(input,'sum','foreshadowing',[issue]);
    db.exec('DELETE FROM state_items'); db.exec('UPDATE chapter_continuity_reviews SET state_item_id=NULL');
    const result=service.persistReviews(input,'sum','foreshadowing',[issue]);
    expect(result.stateItemIds).toHaveLength(1); expect((db.prepare('SELECT COUNT(*) count FROM state_items').get() as any).count).toBe(1);
  });

  it('creates a distinct review and state item for a new checksum', () => {
    const { db,service,input,issue }=fixture(); service.persistReviews(input,'sum-1','foreshadowing',[issue]); service.persistReviews(input,'sum-2','foreshadowing',[issue]);
    expect((db.prepare('SELECT COUNT(*) count FROM chapter_continuity_reviews').get() as any).count).toBe(2);
    expect((db.prepare('SELECT COUNT(*) count FROM state_items').get() as any).count).toBe(2);
  });

  it('returns separate review and state item ids from the lock gate', () => {
    const { db,service,input,issue }=fixture(); const checksum=createHash('sha256').update('new').digest('hex');
    const created=service.persistReviews(input,checksum,'foreshadowing',[issue]);
    db.prepare(`INSERT INTO chapter_derived_sync_states (chapter_id,project_id,content_checksum,summary_sync_status,vector_sync_status,foreshadowing_sync_status,timeline_sync_status,outline_sync_status,needs_resync,needs_author_review,updated_at) VALUES ('c','p',?,'completed','completed','completed','completed','completed',0,1,'now')`).run(checksum);
    const gate=service.getLockGate('p','c','new');
    expect(gate.reviewIds).toEqual(created.reviewIds); expect(gate.stateItemIds).toEqual(created.stateItemIds);
    expect(gate.allowed).toBe(false);
  });

  it('allows locking after the linked blocking state item is confirmed', () => {
    const { db,service,input,issue }=fixture(); const checksum=createHash('sha256').update('new').digest('hex');
    const created=service.persistReviews(input,checksum,'foreshadowing',[issue]);
    db.prepare(`INSERT INTO chapter_derived_sync_states (chapter_id,project_id,content_checksum,summary_sync_status,vector_sync_status,foreshadowing_sync_status,timeline_sync_status,outline_sync_status,needs_resync,needs_author_review,updated_at) VALUES ('c','p',?,'completed','completed','completed','completed','completed',0,1,'now')`).run(checksum);
    db.prepare("UPDATE state_items SET status='confirmed' WHERE id=?").run(created.stateItemIds[0]);
    expect(service.getLockGate('p','c','new').allowed).toBe(true);
  });
});
