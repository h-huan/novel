import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { retireStaleIssues, reviewedContentHash } from './issue-lifecycle';
import { ConflictController } from '../conflict-engine/conflict.controller';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
describe('current issue lifecycle', () => {
  let db: InstanceType<typeof DatabaseSync>;
  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE chapters(id TEXT,project_id TEXT,chapter_index INTEGER,status TEXT,content TEXT,updated_at TEXT);
      CREATE TABLE generation_runs(id TEXT,project_id TEXT,chapter_index INTEGER,stage TEXT,output_text TEXT);
      CREATE TABLE foreshadowings(id TEXT,project_id TEXT,content TEXT,status TEXT,planned_recovery_chapter_index INTEGER);
      CREATE TABLE writing_quality_reports(id TEXT,project_id TEXT,source_type TEXT,source_id TEXT,status TEXT,payload TEXT,updated_at TEXT);
      CREATE TABLE writing_quality_issues(id TEXT,report_id TEXT,project_id TEXT,chapter_id TEXT,
        issue_type TEXT,severity TEXT,status TEXT,payload TEXT,status_history_json TEXT,created_at TEXT,updated_at TEXT,summary TEXT);
      INSERT INTO chapters VALUES('c','p',1,'draft','新版正文','2026-10-18T02:00:00Z');`);
  });
  afterEach(() => db.close());
  function issue(id: string, status = 'open', content?: string, options: { reportStatus?: string; reviewedAt?: string; chapter?: string } = {}) {
    db.prepare('INSERT INTO writing_quality_reports VALUES(?,?,?,?,?,?,?)').run(id, 'p', 'quality:check', null,
      options.reportStatus || 'open', '{}', options.reviewedAt || '2026-10-18T01:00:00Z');
    db.prepare('INSERT INTO writing_quality_issues VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id, id, 'p', options.chapter || 'c',
      'consistency.timeline', 'low', status, JSON.stringify(content === undefined ? {} : { reviewedContentHash: reviewedContentHash(content) }),
      '[]', '2026-10-18T01:00:00Z', null, '问题');
  }
  it('archives proven obsolete bodies with history and is idempotent', () => {
    issue('old', 'planned', '旧版正文');
    expect(retireStaleIssues(db, 'p')).toBe(1);
    const row = db.prepare('SELECT * FROM writing_quality_issues').get() as any;
    expect(row.status).toBe('superseded');
    expect(JSON.parse(row.status_history_json)[0]).toMatchObject({ from: 'planned', reason: 'reviewed_content_replaced' });
    expect(retireStaleIssues(db, 'p')).toBe(0);
    expect(db.prepare('SELECT count(*) n FROM writing_quality_issues').get()).toMatchObject({ n: 1 });
  });
  it('keeps current findings, layout-only variants, unknown legacy provenance and newer unsaved reviews', () => {
    issue('current', 'open', '新版正文'); issue('layout', 'refined', '新 版\n正文'); issue('unknown');
    issue('candidate', 'open', '尚未保存的新稿', { reviewedAt: '2026-10-18T03:00:00Z' });
    expect(retireStaleIssues(db, 'p')).toBe(0);
  });
  it('archives active children of superseded reports while preserving resolved history and other projects', () => {
    issue('stale', 'recheck_failed', undefined, { reportStatus: 'superseded' });
    issue('resolved', 'resolved', '旧版正文'); issue('other', 'open', '旧版正文');
    db.prepare("UPDATE writing_quality_issues SET project_id='q' WHERE id='other'").run();
    expect(retireStaleIssues(db, 'p')).toBe(1);
    expect(db.prepare("SELECT status FROM writing_quality_issues WHERE id='resolved'").get()).toMatchObject({ status: 'resolved' });
    expect(db.prepare("SELECT status FROM writing_quality_issues WHERE id='other'").get()).toMatchObject({ status: 'open' });
  });
  it('uses original generation output to retire legacy reviews', () => {
    issue('legacy');
    db.exec("INSERT INTO generation_runs VALUES('run','p',1,'chapter','旧版正文'); UPDATE writing_quality_reports SET source_type='artifact_quality',source_id='run'");
    expect(retireStaleIssues(db, 'p')).toBe(1);
  });
  it('current conflict list excludes resolved/expired; explicit resolved history stays accessible', () => {
    issue('active'); issue('resolved', 'resolved'); issue('expired', 'superseded');
    const checks = { checkConsistency: vi.fn() };
    const controller = new ConflictController({ getDb: () => db } as any, checks as any);
    expect(controller.getConflicts({ projectId: 'p' }).conflicts.map((i: any) => i.id)).toEqual(['active']);
    expect(controller.getConflicts({ projectId: 'p', status: 'resolved' }).conflicts.map((i: any) => i.id)).toEqual(['resolved']);
    expect(controller.getStats('p')).toMatchObject({ unresolved: 1, resolved: 1 });
    expect(checks.checkConsistency).not.toHaveBeenCalled();
  });
  it('cleanup never deletes a current low-severity issue or starts model checks', () => {
    issue('current', 'open', '新版正文'); issue('old', 'open', '旧版正文');
    const checks = { checkConsistency: vi.fn() };
    const controller = new ConflictController({ getDb: () => db } as any, checks as any);
    expect(controller.cleanupStaleConflicts('p')).toEqual({ removed: 1 });
    expect(controller.getConflicts({ projectId: 'p' }).conflicts.map((i: any) => i.id)).toEqual(['current']);
    expect(controller.cleanupStaleConflicts('p', '999')).toEqual({ removed: 0 });
    expect(checks.checkConsistency).not.toHaveBeenCalled();
  });
  it('retires closed or rescheduled source warnings without changing live unresolved foreshadowings', () => {
    for (const [id, status, planned] of [['done', 'recovered', 0], ['cancel', 'cancelled', 0], ['later', 'active', 5], ['due', 'active', 0]] as const) {
      issue(id);
      db.prepare('INSERT INTO foreshadowings VALUES(?,?,?,?,?)').run(id, 'p', id, status, planned);
      db.prepare("UPDATE writing_quality_issues SET issue_type='consistency.plot_logic',summary=?,payload=? WHERE id=?").run(
        `伏笔已超过计划回收章节：${id}`, JSON.stringify({ details: { items: [{ field: 'foreshadowing', sourceId: id }] } }), id);
    }
    expect(retireStaleIssues(db, 'p')).toBe(3);
    expect(db.prepare("SELECT id FROM writing_quality_issues WHERE status='open'").all()).toEqual([{ id: 'due' }]);
  });
});
