import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it } from 'vitest';
import { WritingQualityService } from './writing-quality.service';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

// 覆盖用户最痛的「反复质检问题只增不减」：重新质检必须作废旧报告与其下仍 open 的问题，
// 同时保留作者已处理的终态；且重复调用幂等。
describe('WritingQualityService.supersedeChapterReports', () => {
  let db: InstanceType<typeof DatabaseSync>;
  let service: any;
  const CHAPTER = 'ch-1';
  const NOW = '2026-09-02T00:00:00.000Z';

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE writing_quality_reports (id TEXT PRIMARY KEY, chapter_id TEXT, status TEXT, updated_at TEXT);
      CREATE TABLE writing_quality_issues (id TEXT PRIMARY KEY, report_id TEXT, status TEXT, status_history_json TEXT, updated_at TEXT);
    `);
    service = new WritingQualityService({ getDb: () => db } as any);
  });

  it('作废旧报告，并把其下仍 open 的问题置为 superseded 且留痕', () => {
    db.prepare('INSERT INTO writing_quality_reports (id, chapter_id, status) VALUES (?,?,?)').run('r1', CHAPTER, 'open');
    const ins = db.prepare('INSERT INTO writing_quality_issues (id, report_id, status, status_history_json) VALUES (?,?,?,?)');
    ins.run('i-open', 'r1', 'open', '[]');
    ins.run('i-plan', 'r1', 'planned', '[]');
    ins.run('i-done', 'r1', 'resolved', '[]'); // 作者已解决，必须保留

    const r = service.supersedeChapterReports(db, CHAPTER, NOW);
    expect(r.reports).toBe(1);
    expect(r.issues).toBe(2); // 只失效 open/planned，resolved 不动

    const rep = db.prepare('SELECT status FROM writing_quality_reports WHERE id=?').get('r1') as any;
    expect(rep.status).toBe('superseded');
    const open = db.prepare('SELECT status, status_history_json FROM writing_quality_issues WHERE id=?').get('i-open') as any;
    expect(open.status).toBe('superseded');
    const hist = JSON.parse(open.status_history_json);
    expect(hist.at(-1)).toMatchObject({ from: 'open', to: 'superseded', reason: 'chapter_reanalyzed' });
    const done = db.prepare('SELECT status FROM writing_quality_issues WHERE id=?').get('i-done') as any;
    expect(done.status).toBe('resolved'); // 终态不回改
  });

  it('幂等：已 superseded 的报告第二次调用不再作废、不再计数', () => {
    db.prepare('INSERT INTO writing_quality_reports (id, chapter_id, status) VALUES (?,?,?)').run('r1', CHAPTER, 'superseded');
    const r = service.supersedeChapterReports(db, CHAPTER, NOW);
    expect(r).toEqual({ reports: 0, issues: 0 });
  });

  it('不影响其它章节的报告', () => {
    db.prepare('INSERT INTO writing_quality_reports (id, chapter_id, status) VALUES (?,?,?)').run('r-other', 'ch-2', 'open');
    service.supersedeChapterReports(db, CHAPTER, NOW);
    const other = db.prepare('SELECT status FROM writing_quality_reports WHERE id=?').get('r-other') as any;
    expect(other.status).toBe('open');
  });
});
