import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import { Migrator } from '../database/migrator';
import { ProjectRepository } from '../database/repositories/project.repository';
import { ProjectService } from '../modules/project/project.service';
import { PlatformAnalyticsService } from '../modules/platform-analytics/platform-analytics.service';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

it('counts quality problems only for existing projects and removes their reports on deletion', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys = ON');
    await new Migrator(db).runMigrations();
    const database = { getDb: () => db } as any;
    const analytics = new PlatformAnalyticsService(database);
    const projects = new ProjectService(new ProjectRepository(database), database);
    db.prepare(`INSERT INTO projects (id,title,settings,created_at,updated_at) VALUES ('live','Live','{}','2026-10-06','2026-10-06')`).run();
    db.prepare(`INSERT INTO chapters (id,project_id,chapter_index,title,created_at,updated_at) VALUES ('chapter','live',1,'Chapter','2026-10-06','2026-10-06')`).run();
    db.prepare(`INSERT INTO writing_quality_reports (id,project_id,chapter_id,created_at) VALUES ('live-report','live','chapter','2026-10-06')`).run();
    db.prepare(`INSERT INTO writing_quality_issues (id,report_id,project_id,chapter_id,issue_type,title,summary) VALUES ('live-issue','live-report','live','chapter','outline_alignment','Conflict','Conflict')`).run();

    // Legacy rows without a project foreign key can survive older deletions.
    db.prepare(`INSERT INTO writing_quality_reports (id,project_id,chapter_id,created_at) VALUES ('orphan-report','deleted','old-chapter','2026-10-06')`).run();
    db.prepare(`INSERT INTO writing_quality_issues (id,report_id,project_id,chapter_id,issue_type,title,summary) VALUES ('orphan-issue','orphan-report','deleted','old-chapter','outline_alignment','Old','Old')`).run();

    expect(analytics.overview().kpis).toMatchObject({ projectCount: 1, currentIssues: 1, currentConsistency: 1 });
    expect(projects.remove('live')).toEqual({ success: true });
    expect(db.prepare(`SELECT COUNT(*) n FROM writing_quality_reports WHERE project_id='live'`).get()).toMatchObject({ n: 0 });
    expect(db.prepare(`SELECT COUNT(*) n FROM writing_quality_issues WHERE project_id='live'`).get()).toMatchObject({ n: 0 });
    expect(analytics.overview().kpis).toMatchObject({ projectCount: 0, currentIssues: 0, currentConsistency: 0 });
  } finally {
    db.close();
  }
});
