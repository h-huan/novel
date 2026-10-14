import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { up as initSchema } from '../../database/migrations/001_initial';
import { StateItemService } from '../../state/state-item.service';
import { ChapterDerivedDataSyncService } from './chapter-derived-data-sync.service';
import { createHash } from 'node:crypto';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

function fixture() {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=OFF;'); initSchema(db);
  const database = { getDb: () => db } as any;
  const stateItems = new StateItemService(database);
  const service = new ChapterDerivedDataSyncService(database, {} as any, {} as any, {} as any, {} as any, undefined, stateItems);
  const input = { projectId: 'p', chapterId: 'c', beforeContent: 'old', afterContent: 'new', reason: 'manual_resync' } as const;
  const issue = { type: 'removed_recovery', target: 'f', requirement: '伏笔', old: 'old', next: '', severity: 'high', block: true };
  return { db, service: service as any, input, issue };
}

describe('continuity review idempotency', () => {
  it('counts deduplicated persisted findings, not repeated candidates', () => {
    const { db, service, input, issue } = fixture();
    try {
      const result = service.persistReviews(input, 'sum', 'foreshadowing', [issue, issue, issue]);
      expect(result).toMatchObject({ issueCount: 1, blockingCount: 1 });
      expect(result.reviewIds).toHaveLength(1);
      expect(result.stateItemIds).toHaveLength(1);
    } finally { db.close(); }
  });
  it('does not require plan metadata verbatim; only exact validated AI proof completes review', () => {
    const { db, service, input } = fixture();
    try {
      db.exec(`INSERT INTO outlines(id,project_id,level,title,content) VALUES ('o','p','chapter','标题','应当通过实际选择推进，不能把这段规划复制到正文');
        INSERT INTO generation_runs(id,project_id,chapter_index,stage,scenario,status,gate_status,output_text,prompt_version,context_version,started_at) VALUES ('run','p',1,'chapter','writing','success','passed','new','v','v','now');`);
      const chapter = { outline_id: 'o', chapter_index: 1 };
      expect(service.reviewOutline(input, 'sum', chapter)).toMatchObject({ status: 'pending', issueCount: 0 });
      const outline = db.prepare('SELECT * FROM outlines WHERE id=? AND project_id=?').get('o', 'p');
      const proof = { runId: 'run', outlineFingerprint: createHash('sha256').update(JSON.stringify(outline)).digest('hex') };
      expect(service.reviewOutline({ ...input, validatedOutlineProof: proof }, 'sum', chapter)).toMatchObject({ status: 'completed', issueCount: 0 });
      expect(service.reviewOutline({ ...input, afterContent: 'changed', validatedOutlineProof: proof }, 'sum', chapter).status).toBe('pending');
      db.prepare('UPDATE outlines SET content=? WHERE id=?').run('更新计划', 'o');
      expect(service.reviewOutline({ ...input, validatedOutlineProof: proof }, 'sum', chapter).status).toBe('pending');
    } finally { db.close(); }
  });
  it('archives legacy literal probes, preserving actual blockers and confirmed items', () => {
    const { db, service, input, issue } = fixture();
    try {
      db.exec(`INSERT INTO outlines(id,project_id,level,title,content) VALUES ('o','p','chapter','标题','章纲说明');`);
      const literal = service.persistReviews(input, 'sum', 'outline', [{ ...issue, type: 'missing_requirement', block: false }]);
      const blocker = service.persistReviews(input, 'sum', 'outline', [{ ...issue, type: 'actual_conflict' }]);
      service.reviewOutline(input, 'sum', { outline_id: 'o', chapter_index: 1 });
      expect(db.prepare('SELECT status FROM state_items WHERE id=?').get(literal.stateItemIds[0]).status).toBe('archived');
      expect(db.prepare('SELECT status FROM state_items WHERE id=?').get(blocker.stateItemIds[0]).status).toBe('conflict');
    } finally { db.close(); }
  });
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

  it('blocks locking while derived data needs resynchronization, then allows it after resync clears the flag', () => {
    const { db,service } = fixture(); const checksum=createHash('sha256').update('new').digest('hex');
    db.prepare(`INSERT INTO chapter_derived_sync_states (chapter_id,project_id,content_checksum,summary_sync_status,vector_sync_status,foreshadowing_sync_status,timeline_sync_status,outline_sync_status,needs_resync,needs_author_review,updated_at) VALUES ('c','p',?,'completed','completed','completed','completed','completed',1,1,'now')`).run(checksum);

    const blocked = service.getLockGate('p', 'c', 'new');
    expect(blocked.allowed).toBe(false); expect(blocked.needsResync).toBe(true); expect(blocked.needsAuthorReview).toBe(true);
    expect(blocked.reasons).toContain('chapter derived data requires resynchronization');

    db.prepare(`UPDATE chapter_derived_sync_states SET needs_resync=0 WHERE chapter_id='c'`).run();
    const allowed = service.getLockGate('p', 'c', 'new');
    expect(allowed.allowed).toBe(true); expect(allowed.needsResync).toBe(false); expect(allowed.needsAuthorReview).toBe(true);
  });
});

describe('completed manual semantic review reuse', () => {
  it('retains the review only for the same body, outline and current model provenance', () => {
    const { db, service, input } = fixture();
    try {
      db.prepare("INSERT INTO outlines(id,project_id,level,title,content) VALUES ('o','p','chapter','测试','合同')").run();
      const outline = db.prepare("SELECT * FROM outlines WHERE id='o'").get();
      const checksum = createHash('sha256').update(input.afterContent).digest('hex');
      const receipt = { bodyHash: checksum, outlineHash: createHash('sha256').update(JSON.stringify(outline)).digest('hex'),
        report: { evaluationStatus: 'evaluated', pass: true, missing: [], contradictions: [], sourceConflicts: [] },
        runs: [{ id: 'actual-review', status: 'success' }] };
      db.prepare(`INSERT INTO chapter_continuity_reviews(id,project_id,chapter_id,content_checksum,review_type,issue_type,target_id,change_type,severity,status,payload,created_at,updated_at)
        VALUES ('manual','p','c',?,'outline','manual_semantic_alignment_review','o','review','low','resolved',?,'now','now')`).run(checksum, JSON.stringify(receipt));
      let current = true; service.moduleRef = { get: () => ({ runIsCurrent: (id: string) => current && id === 'actual-review' }) };
      expect(service.reviewOutline(input, checksum, { outline_id: 'o', chapter_index: 1 })).toMatchObject({ status: 'completed', reviewIds: ['manual'] });
      current = false;
      expect(service.reviewOutline(input, checksum, { outline_id: 'o', chapter_index: 1 }).status).toBe('pending');
      current = true;
      db.prepare("UPDATE outlines SET content='修改后的合同' WHERE id='o'").run();
      expect(service.reviewOutline(input, checksum, { outline_id: 'o', chapter_index: 1 }).status).toBe('pending');
      expect(service.reviewOutline({ ...input, afterContent: 'changed' }, 'changed-hash', { outline_id: 'o', chapter_index: 1 }).status).toBe('pending');
    } finally { db.close(); }
  });
});
