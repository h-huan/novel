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
    CREATE TABLE projects (
      id TEXT PRIMARY KEY, title TEXT, type TEXT, target_words INTEGER, target_platform TEXT,
      platform_style TEXT, writing_style TEXT, settings TEXT
    );
    INSERT INTO projects (id,title,type,target_words,target_platform,platform_style,settings)
      VALUES ('p','测试项目','long_novel',2000000,'qidian','qidian','{"genre":"悬疑","pov":"第三人称限知","chapterWordRange":{"min":3200,"max":4000},"structurePlanning":"dynamic_by_story_rhythm"}');
    CREATE TABLE chapters (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT, status TEXT NOT NULL DEFAULT 'draft',
      content TEXT DEFAULT '', checksum TEXT, volume_index INTEGER DEFAULT 1, chapter_index INTEGER DEFAULT 1
    )
    ;
    CREATE TABLE characters (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT, identity TEXT);
    CREATE TABLE character_extended_profiles (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, character_id TEXT NOT NULL UNIQUE,
      short_term_goal TEXT, forbidden_writing TEXT, updated_at TEXT
    );
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
    );
    CREATE TABLE character_states (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, states_json TEXT, needs_review INTEGER NOT NULL DEFAULT 1,
      reviewed_by TEXT, reviewed_at TEXT, updated_at TEXT
    );
    CREATE TABLE foreshadowing_states (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, status TEXT, recovery_method TEXT, needs_review INTEGER NOT NULL DEFAULT 1,
      reviewed_by TEXT, reviewed_at TEXT, updated_at TEXT
    );
    CREATE TABLE plot_progress (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, emotional_beat TEXT, turning_points TEXT, needs_review INTEGER NOT NULL DEFAULT 1,
      reviewed_by TEXT, reviewed_at TEXT, updated_at TEXT
    );
    CREATE TABLE version_history (
      id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, version INTEGER NOT NULL,
      snapshot TEXT NOT NULL, checksum TEXT NOT NULL, change_summary TEXT, created_by TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE canonical_entity_sync_states (
      project_id TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
      index_status TEXT NOT NULL DEFAULT 'pending', needs_resync INTEGER NOT NULL DEFAULT 1,
      last_error TEXT, last_attempt_at TEXT, synced_at TEXT, updated_at TEXT,
      PRIMARY KEY (project_id, entity_type, entity_id)
    )
  `);
  const databaseService = {
    getDb: () => db,
    transaction: (fn: () => unknown) => {
      db.exec('BEGIN');
      try { const result = fn(); db.exec('COMMIT'); return result; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
  return { db, service: new StateItemService(databaseService as any, continuityService) };
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
  it('keeps all 350 confirmed facts and all related impacts without fixed truncation', () => {
    const f = fixture();
    for (let index = 0; index < 350; index += 1) addState(f, `fact-${index}`, 'confirmed', 'character', 'hero');

    const context = f.service.buildWritingStateContext('p', 301);
    const report = f.service.analyzeImpact('p', { targetType: 'character', targetId: 'hero', summary: '300+章设定修改' });

    expect(context.confirmed).toHaveLength(350);
    expect(context.contextText).toContain('fact-349 summary');
    expect(report.items.filter((item: any) => item.impactType === 'may_make_confirmed_state_stale')).toHaveLength(350);
  });

  it('restores a canonical version and marks review plus index resync as pending', () => {
    const f = fixture();
    f.db.prepare(`INSERT INTO characters (id, project_id, name, identity) VALUES ('hero', 'p', '新名字', '新身份')`).run();
    f.db.prepare(`INSERT INTO version_history (id, entity_type, entity_id, version, snapshot, checksum, created_at) VALUES ('v1', 'character', 'hero', 1, ?, 'old-checksum', '2000-01-01')`)
      .run(JSON.stringify({ name: '旧名字', identity: '旧身份' }));

    const result = f.service.restoreCanonicalVersion('p', 'character', 'hero', 1);

    expect(f.db.prepare(`SELECT name, identity FROM characters WHERE id='hero'`).get()).toMatchObject({ name: '旧名字', identity: '旧身份' });
    expect(result).toMatchObject({ restoredVersion: 1, needsReview: true, needsResync: true });
    expect(f.db.prepare(`SELECT index_status, needs_resync FROM canonical_entity_sync_states WHERE project_id='p' AND entity_type='character' AND entity_id='hero'`).get())
      .toMatchObject({ index_status: 'pending', needs_resync: 1 });
    expect((f.db.prepare(`SELECT COUNT(*) AS count FROM state_impact_reports WHERE project_id='p'`).get() as any).count).toBe(1);
  });

  it('does not restore a version into an entity owned by another project', () => {
    const f = fixture();
    f.db.prepare(`INSERT INTO characters (id, project_id, name) VALUES ('hero', 'other', '新名字')`).run();
    f.db.prepare(`INSERT INTO version_history (id, entity_type, entity_id, version, snapshot, checksum, created_at) VALUES ('v1', 'character', 'hero', 1, '{"name":"旧名字"}', 'checksum', '2000-01-01')`).run();
    expect(() => f.service.restoreCanonicalVersion('p', 'character', 'hero', 1)).toThrow(NotFoundException);
  });

  it('restores a character extended profile instead of writing profile fields into the base row', () => {
    const f = fixture();
    f.db.prepare(`INSERT INTO characters (id, project_id, name) VALUES ('hero', 'p', '角色')`).run();
    f.db.prepare(`INSERT INTO character_extended_profiles (id, project_id, character_id, short_term_goal, forbidden_writing) VALUES ('profile', 'p', 'hero', '新目标', '新禁忌')`).run();
    f.db.prepare(`INSERT INTO version_history (id, entity_type, entity_id, version, snapshot, checksum, created_at) VALUES ('profile-v1', 'character', 'hero', 1, ?, 'profile-checksum', '2000-01-01')`)
      .run(JSON.stringify({ short_term_goal: '旧目标', forbidden_writing: '旧禁忌' }));

    f.service.restoreCanonicalVersion('p', 'character', 'hero', 1);

    expect(f.db.prepare(`SELECT short_term_goal, forbidden_writing FROM character_extended_profiles WHERE character_id='hero'`).get())
      .toMatchObject({ short_term_goal: '旧目标', forbidden_writing: '旧禁忌' });
  });

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
    expect(confirmed.authority).toBe('excluded');
    expect(f.service.buildWritingStateContext('p').contextText).not.toContain('state summary');
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

  it('persists confirmationResult and does not repeat canonical creates', () => {
    const continuity = { createRelationship: vi.fn() };
    const f = fixture(continuity);
    continuity.createRelationship.mockImplementation(() => {
      f.db.prepare(`INSERT INTO character_relationships (id, project_id, trust_score, review_status, updated_at) VALUES ('created', 'p', 50, 'pending', 'now')`).run();
      return { id: 'created' };
    });
    addState(f, 'state', 'pending', 'relationship');
    setPayload(f, 'state', { intent: 'canonical_change', canonicalChange: { entityType: 'relationship', action: 'create', values: { trustScore: 50 } } });

    const first = f.service.confirm('p', 'state');
    const second = f.service.confirm('p', 'state');

    expect(continuity.createRelationship).toHaveBeenCalledTimes(1);
    expect(second.writeback).toEqual(first.writeback);
    expect((f.db.prepare(`SELECT payload FROM state_items WHERE id='state'`).get() as any).payload).toContain('confirmationResult');
    expect(first.authority).toBe('hard_fact');
  });

  it.each([
    ['character_state', 'character_states', `INSERT INTO character_states (id, project_id, states_json, needs_review, updated_at) VALUES ('legacy', 'p', '{"hp":1}', 1, 'old')`, 'states_json'],
    ['foreshadowing_state', 'foreshadowing_states', `INSERT INTO foreshadowing_states (id, project_id, status, recovery_method, needs_review, updated_at) VALUES ('legacy', 'p', 'planted', 'method', 1, 'old')`, 'recovery_method'],
    ['plot_progress', 'plot_progress', `INSERT INTO plot_progress (id, project_id, emotional_beat, turning_points, needs_review, updated_at) VALUES ('legacy', 'p', 'calm', '["turn"]', 1, 'old')`, 'emotional_beat'],
  ])('confirms legacy %s review target without changing core fields', (entityType, table, insertSql, coreColumn) => {
    const f = fixture(); f.db.prepare(insertSql).run(); addState(f, 'state', 'pending');
    setPayload(f, 'state', { intent: 'review_only', legacyReviewTarget: { entityType, targetId: 'legacy' } });
    const before = (f.db.prepare(`SELECT ${coreColumn} AS value FROM ${table} WHERE id='legacy'`).get() as any).value;

    const confirmed = f.service.confirm('p', 'state', 'author');
    const after = f.db.prepare(`SELECT needs_review, reviewed_by, ${coreColumn} AS value FROM ${table} WHERE id='legacy'`).get() as any;

    expect(after).toMatchObject({ needs_review: 0, reviewed_by: 'author', value: before });
    expect(confirmed.writeback).toMatchObject({ mode: 'review_only', applied: true, canonicalId: 'legacy' });
  });

  it('rolls back canonical confirmation when a submitted value is not persisted', () => {
    const continuity = { updateRelationship: vi.fn(() => ({ id: 'rel' })) };
    const f = fixture(continuity);
    f.db.prepare(`INSERT INTO character_relationships (id, project_id, trust_score, review_status, updated_at) VALUES ('rel', 'p', 20, 'pending', 'old')`).run();
    addState(f, 'state', 'pending', 'relationship', 'rel');
    setPayload(f, 'state', { intent: 'canonical_change', canonicalChange: { entityType: 'relationship', action: 'update', targetId: 'rel', values: { trustScore: 99 } } });

    expect(() => f.service.confirm('p', 'state')).toThrow('Canonical field verification failed');
    expect((f.db.prepare(`SELECT status FROM state_items WHERE id='state'`).get() as any).status).toBe('pending');
  });

  it('sets archive candidate intent only for a complete canonicalChange', () => {
    const f = fixture();
    const review = f.service.createFromArchive('p', 'chapter', { characterUpdates: [{ title: 'review', summary: 'only' }] })[0];
    const canonical = f.service.createFromArchive('p', 'chapter', { characterUpdates: [{ title: 'change', canonicalChange: { entityType: 'relationship', action: 'create', values: { trustScore: 50 } } }] })[0];
    expect(review.payload.intent).toBe('review_only');
    expect(canonical.payload.intent).toBe('canonical_change');
  });
});
