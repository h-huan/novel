import { createRequire } from 'node:module';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { up as stateUp } from '../database/migrations/017_state_items_and_evolution';
import { up as syncUp } from '../database/migrations/026_chapter_derived_data_sync';
import { up as continuityUp } from '../database/migrations/027_chapter_continuity_rechecks';
import { StateItemService } from './state-item.service';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

type Fixture = ReturnType<typeof fixture>;
const openDatabases: Array<InstanceType<typeof DatabaseSync>> = [];

function fixture(continuityService?: any) {
  const db = new DatabaseSync(':memory:');
  openDatabases.push(db);
  stateUp(db);
  syncUp(db);
  continuityUp(db);
  db.exec(`
    CREATE TABLE chapters (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT, status TEXT NOT NULL DEFAULT 'draft',
      content TEXT DEFAULT '', checksum TEXT, volume_index INTEGER DEFAULT 1, chapter_index INTEGER DEFAULT 1
    )
    ;
    CREATE TABLE character_relationships (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, trust_score INTEGER NOT NULL DEFAULT 50,
      review_status TEXT NOT NULL DEFAULT 'pending', locked INTEGER NOT NULL DEFAULT 0, updated_at TEXT
    );
    CREATE TABLE character_state_snapshots (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, current_state TEXT, review_status TEXT NOT NULL DEFAULT 'pending',
      locked INTEGER NOT NULL DEFAULT 0, updated_at TEXT
    );
    CREATE TABLE foreshadowing_threads (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, summary TEXT, review_status TEXT NOT NULL DEFAULT 'pending',
      locked INTEGER NOT NULL DEFAULT 0, updated_at TEXT
    );
    CREATE TABLE world_rules (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, content TEXT, review_status TEXT NOT NULL DEFAULT 'pending',
      locked INTEGER NOT NULL DEFAULT 0, updated_at TEXT
    );
    CREATE TABLE timeline_three_line_events (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, summary TEXT, review_status TEXT NOT NULL DEFAULT 'pending',
      locked INTEGER NOT NULL DEFAULT 0, updated_at TEXT
    )
  `);
  return { db, service: new StateItemService({ getDb: () => db } as any, continuityService) };
}

function addState(f: Fixture, id: string, status: string, targetType = 'character', targetId = 'hero') {
  f.db.prepare(`
    INSERT INTO state_items (
      id, project_id, target_type, target_id, target_label, summary, status, authority, summary_hash, updated_at
    ) VALUES (?, 'p', ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, targetType, targetId, id, `${id} summary`, status,
    status === 'confirmed' ? 'hard_fact' : status === 'stale' ? 'warning' : 'soft_candidate',
    `hash-${id}`, `2000-01-01T00:00:00.000Z`);
}

function addChapter(f: Fixture, id: string, status = 'draft') {
  f.db.prepare(`
    INSERT INTO chapters (id, project_id, title, status, content, volume_index, chapter_index)
    VALUES (?, 'p', ?, ?, 'chapter content', 1, 1)
  `).run(id, id, status);
}

function addReport(f: Fixture, id = 'report') {
  f.db.prepare(`INSERT INTO state_impact_reports (id, project_id, summary) VALUES (?, 'p', 'report')`).run(id);
}

function addImpact(
  f: Fixture,
  id: string,
  impactType: string,
  payload: Record<string, unknown> = {},
  targetId: string | null = null,
  reportId = 'report',
) {
  f.db.prepare(`
    INSERT INTO state_impact_items (
      id, report_id, project_id, impact_type, target_type, target_id, summary, payload
    ) VALUES (?, ?, 'p', ?, 'state', ?, 'impact', ?)
  `).run(id, reportId, impactType, targetId, JSON.stringify(payload));
}

function setPayload(f: Fixture, id: string, payload: Record<string, unknown>) {
  f.db.prepare(`UPDATE state_items SET payload = ? WHERE id = ?`).run(JSON.stringify(payload), id);
}

afterEach(() => {
  while (openDatabases.length) openDatabases.pop()!.close();
});

describe('StateItemService impact actions', () => {
  it('analyzes impact without making a confirmed state stale', () => {
    const f = fixture();
    addState(f, 'source', 'pending');
    addState(f, 'confirmed', 'confirmed');

    const report = f.service.analyzeImpact('p', { sourceStateItemId: 'source' });

    expect((f.db.prepare(`SELECT status, authority FROM state_items WHERE id='confirmed'`).get() as any))
      .toMatchObject({ status: 'confirmed', authority: 'hard_fact' });
    expect(report.items.some((item: any) => item.impactType === 'may_make_confirmed_state_stale')).toBe(true);
  });

  it('applies may_make_confirmed_state_stale and completes its report', () => {
    const f = fixture(); addState(f, 'state', 'confirmed'); addReport(f);
    addImpact(f, 'impact', 'may_make_confirmed_state_stale', { relatedStateItemId: 'state' });

    const result = f.service.applyImpactItem('p', 'impact');

    expect(f.db.prepare(`SELECT status, authority FROM state_items WHERE id='state'`).get())
      .toMatchObject({ status: 'stale', authority: 'warning' });
    expect(result.actionResult).toMatchObject({ action: 'mark_state_item_stale', verified: true, stateItemId: 'state' });
    expect(result.impactItem.payload.actionResult).toEqual(result.actionResult);
    expect(result.reportStatus).toBe('completed');
  });

  it('treats an already stale state and an already applied item idempotently', () => {
    const f = fixture(); addState(f, 'state', 'stale'); addReport(f);
    addImpact(f, 'impact', 'may_make_confirmed_state_stale', { relatedStateItemId: 'state' });
    const before = (f.db.prepare(`SELECT updated_at FROM state_items WHERE id='state'`).get() as any).updated_at;

    const first = f.service.applyImpactItem('p', 'impact');
    const second = f.service.applyImpactItem('p', 'impact');

    expect(second).toEqual(first);
    expect((f.db.prepare(`SELECT updated_at FROM state_items WHERE id='state'`).get() as any).updated_at).toBe(before);
  });

  it('keeps a review candidate pending instead of confirming it', () => {
    const f = fixture(); addState(f, 'candidate', 'pending'); addReport(f);
    addImpact(f, 'impact', 'candidate_needs_review', { relatedStateItemId: 'candidate' });

    const result = f.service.applyImpactItem('p', 'impact');

    expect((f.db.prepare(`SELECT status FROM state_items WHERE id='candidate'`).get() as any).status).toBe('pending');
    expect(result.actionResult.action).toBe('retain_candidate_for_author_review');
  });

  it.each(['rejected', 'archived'])('rejects a %s candidate and leaves the impact pending', (status) => {
    const f = fixture(); addState(f, 'candidate', status); addReport(f);
    addImpact(f, 'impact', 'candidate_needs_review', { relatedStateItemId: 'candidate' });

    expect(() => f.service.applyImpactItem('p', 'impact')).toThrow(BadRequestException);
    expect((f.db.prepare(`SELECT status FROM state_impact_items WHERE id='impact'`).get() as any).status).toBe('pending');
  });

  it('creates a pending chapter sync state and verifies review flags', () => {
    const f = fixture(); addChapter(f, 'chapter'); addReport(f);
    addImpact(f, 'impact', 'downstream_chapter_needs_sync', { canAutoSync: true, needsReview: true }, 'chapter');

    const result = f.service.applyImpactItem('p', 'impact');
    const sync = f.db.prepare(`SELECT * FROM chapter_derived_sync_states WHERE chapter_id='chapter'`).get() as any;

    expect(sync).toMatchObject({ needs_resync: 1, needs_author_review: 1, summary_sync_status: 'pending', vector_sync_status: 'pending' });
    expect(result.actionResult).toMatchObject({ verified: true, chapterId: 'chapter' });
  });

  it('updates an existing chapter sync state without running derived generation', () => {
    const f = fixture(); addChapter(f, 'chapter'); addReport(f);
    f.db.prepare(`
      INSERT INTO chapter_derived_sync_states (
        chapter_id, project_id, content_checksum, summary_sync_status, vector_sync_status,
        foreshadowing_sync_status, timeline_sync_status, outline_sync_status, needs_resync, needs_author_review, updated_at
      ) VALUES ('chapter', 'p', 'old', 'completed', 'completed', 'completed', 'completed', 'completed', 0, 0, 'old')
    `).run();
    addImpact(f, 'impact', 'downstream_chapter_needs_sync', { canAutoSync: true, needsReview: true }, 'chapter');

    f.service.applyImpactItem('p', 'impact');
    const sync = f.db.prepare(`SELECT * FROM chapter_derived_sync_states WHERE chapter_id='chapter'`).get() as any;

    expect(sync).toMatchObject({ needs_resync: 1, needs_author_review: 1, summary_sync_status: 'completed', content_checksum: 'old' });
  });

  it('rejects a locked target chapter without changing business or impact data', () => {
    const f = fixture(); addChapter(f, 'chapter', 'locked'); addReport(f);
    addImpact(f, 'impact', 'downstream_chapter_needs_sync', { canAutoSync: true, needsReview: true }, 'chapter');

    expect(() => f.service.applyImpactItem('p', 'impact')).toThrow(BadRequestException);
    expect(f.db.prepare(`SELECT * FROM chapter_derived_sync_states WHERE chapter_id='chapter'`).get()).toBeUndefined();
    expect((f.db.prepare(`SELECT status FROM state_impact_items WHERE id='impact'`).get() as any).status).toBe('pending');
  });

  it('keeps blocked and unknown impact types pending with an open report', () => {
    for (const impactType of ['blocked_by_locked_chapter', 'future_unknown_action']) {
      const f = fixture(); addReport(f); addImpact(f, 'impact', impactType);
      expect(() => f.service.applyImpactItem('p', 'impact')).toThrow(BadRequestException);
      expect((f.db.prepare(`SELECT status FROM state_impact_items WHERE id='impact'`).get() as any).status).toBe('pending');
      expect((f.db.prepare(`SELECT status FROM state_impact_reports WHERE id='report'`).get() as any).status).toBe('open');
    }
  });

  it('rolls back the business action when saving the applied item fails', () => {
    const f = fixture(); addState(f, 'state', 'confirmed'); addReport(f);
    addImpact(f, 'impact', 'may_make_confirmed_state_stale', { relatedStateItemId: 'state' });
    f.db.exec(`
      CREATE TRIGGER reject_impact_apply BEFORE UPDATE OF status ON state_impact_items
      BEGIN SELECT RAISE(ABORT, 'forced impact save failure'); END
    `);

    expect(() => f.service.applyImpactItem('p', 'impact')).toThrow('forced impact save failure');
    expect((f.db.prepare(`SELECT status FROM state_items WHERE id='state'`).get() as any).status).toBe('confirmed');
    expect((f.db.prepare(`SELECT status FROM state_impact_items WHERE id='impact'`).get() as any).status).toBe('pending');
  });

  it('keeps a report open until every item is applied, then completes it', () => {
    const f = fixture(); addState(f, 'one', 'pending'); addState(f, 'two', 'conflict'); addReport(f);
    addImpact(f, 'impact-one', 'candidate_needs_review', { relatedStateItemId: 'one' });
    addImpact(f, 'impact-two', 'candidate_needs_review', { relatedStateItemId: 'two' });

    expect(f.service.applyImpactItem('p', 'impact-one').reportStatus).toBe('open');
    expect((f.db.prepare(`SELECT status FROM state_impact_reports WHERE id='report'`).get() as any).status).toBe('open');
    expect(f.service.applyImpactItem('p', 'impact-two').reportStatus).toBe('completed');
    expect((f.db.prepare(`SELECT status FROM state_impact_reports WHERE id='report'`).get() as any).status).toBe('completed');
  });

  it('does not apply an item whose related state no longer exists', () => {
    const f = fixture(); addReport(f);
    addImpact(f, 'impact', 'may_make_confirmed_state_stale', { relatedStateItemId: 'missing' });
    expect(() => f.service.applyImpactItem('p', 'impact')).toThrow(NotFoundException);
    expect((f.db.prepare(`SELECT status FROM state_impact_items WHERE id='impact'`).get() as any).status).toBe('pending');
  });
});

describe('StateItemService confirmation semantics', () => {
  it('confirms review_only without changing canonical core content', () => {
    const f = fixture();
    f.db.prepare(`INSERT INTO character_relationships (id, project_id, trust_score, review_status, updated_at) VALUES ('rel', 'p', 25, 'pending', 'old')`).run();
    addState(f, 'state', 'pending', 'relationship', 'rel');
    setPayload(f, 'state', { intent: 'review_only', relationshipId: 'rel' });

    const confirmed = f.service.confirm('p', 'state');

    expect(f.db.prepare(`SELECT trust_score, review_status FROM character_relationships WHERE id='rel'`).get())
      .toMatchObject({ trust_score: 25, review_status: 'confirmed' });
    expect(confirmed.writeback).toMatchObject({ mode: 'review_only', applied: true, verified: true, canonicalId: 'rel' });
  });

  it('confirms a review_only task with no target without canonical writes', () => {
    const f = fixture(); addState(f, 'state', 'pending', 'relationship', null as any);
    setPayload(f, 'state', { intent: 'review_only' });

    const confirmed = f.service.confirm('p', 'state');

    expect(confirmed.writeback).toMatchObject({ mode: 'review_only', applied: false, verified: true, reason: 'review_task_has_no_canonical_target' });
    expect((f.db.prepare(`SELECT status FROM state_items WHERE id='state'`).get() as any).status).toBe('confirmed');
  });

  it('rolls back a canonical_change with missing fields', () => {
    const f = fixture({}); addState(f, 'state', 'pending', 'relationship', 'rel');
    setPayload(f, 'state', { intent: 'canonical_change', canonicalChange: { entityType: 'relationship', action: 'update' } });

    expect(() => f.service.confirm('p', 'state')).toThrow(BadRequestException);
    expect((f.db.prepare(`SELECT status FROM state_items WHERE id='state'`).get() as any).status).toBe('pending');
  });

  it('uses ContinuityService and rereads a canonical target before confirming', () => {
    const continuity = { updateRelationship: vi.fn() };
    const f = fixture(continuity);
    f.db.prepare(`INSERT INTO character_relationships (id, project_id, trust_score, review_status, updated_at) VALUES ('rel', 'p', 20, 'pending', 'old')`).run();
    continuity.updateRelationship.mockImplementation((_projectId: string, id: string, values: any) => {
      f.db.prepare(`UPDATE character_relationships SET trust_score = ?, updated_at = 'new' WHERE id = ?`).run(values.trustScore, id);
      return { id };
    });
    addState(f, 'state', 'pending', 'relationship', 'rel');
    setPayload(f, 'state', { intent: 'canonical_change', canonicalChange: { entityType: 'relationship', action: 'update', targetId: 'rel', values: { trustScore: 91 } } });

    const confirmed = f.service.confirm('p', 'state');

    expect(continuity.updateRelationship).toHaveBeenCalledWith('p', 'rel', expect.objectContaining({ trustScore: 91, source: 'manual' }));
    expect((f.db.prepare(`SELECT trust_score FROM character_relationships WHERE id='rel'`).get() as any).trust_score).toBe(91);
    expect(confirmed.writeback).toMatchObject({ mode: 'canonical_change', applied: true, verified: true, canonicalType: 'relationship', canonicalId: 'rel' });
  });

  it('does not let canonical_change overwrite a locked entity', () => {
    const continuity = { updateRelationship: vi.fn() };
    const f = fixture(continuity);
    f.db.prepare(`INSERT INTO character_relationships (id, project_id, trust_score, review_status, locked, updated_at) VALUES ('rel', 'p', 20, 'pending', 1, 'old')`).run();
    addState(f, 'state', 'pending', 'relationship', 'rel');
    setPayload(f, 'state', { intent: 'canonical_change', canonicalChange: { entityType: 'relationship', action: 'update', targetId: 'rel', values: { trustScore: 91 } } });

    expect(() => f.service.confirm('p', 'state')).toThrow('Cannot overwrite locked canonical target');
    expect(continuity.updateRelationship).not.toHaveBeenCalled();
    expect((f.db.prepare(`SELECT status FROM state_items WHERE id='state'`).get() as any).status).toBe('pending');
  });

  it('does not confirm unsupported canonical types', () => {
    const f = fixture({}); addState(f, 'state', 'pending');
    setPayload(f, 'state', { intent: 'canonical_change', canonicalChange: { entityType: 'unsupported', action: 'create', values: { title: 'x' } } });

    expect(() => f.service.confirm('p', 'state')).toThrow('Unsupported canonical type');
    expect((f.db.prepare(`SELECT status FROM state_items WHERE id='state'`).get() as any).status).toBe('pending');
  });
});
