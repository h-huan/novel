/**
 * 018_writing_quality_engine - writing quality diagnosis and revision engine
 *
 * Phase 6: Writing Quality Diagnosis & Revision Closed Loop
 *
 * Tables:
 * - writing_quality_reports  质量诊断报告
 * - writing_quality_issues    具体质量问题
 * - writing_revision_records  局部精修记录
 */
import type { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS writing_quality_reports (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      chapter_id TEXT,
      source_type TEXT NOT NULL DEFAULT 'manual_check',
      source_id TEXT,
      scope TEXT NOT NULL DEFAULT 'chapter',
      title TEXT,
      summary TEXT,
      overall_level TEXT NOT NULL DEFAULT 'medium',
      overall_score INTEGER,
      status TEXT NOT NULL DEFAULT 'open',
      model TEXT,
      payload TEXT DEFAULT '{}',
      created_by TEXT DEFAULT 'system',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_wqr_project_chapter
      ON writing_quality_reports(project_id, chapter_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_wqr_project_status
      ON writing_quality_reports(project_id, status, created_at);

    CREATE TABLE IF NOT EXISTS writing_quality_issues (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      chapter_id TEXT,
      issue_type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'medium',
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      evidence TEXT,
      suggestion TEXT,
      paragraph_index INTEGER,
      sentence_index INTEGER,
      start_offset INTEGER,
      end_offset INTEGER,
      original_text TEXT,
      suggested_text TEXT,
      tags TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'open',
      payload TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT,
      resolved_by TEXT,
      FOREIGN KEY (report_id) REFERENCES writing_quality_reports(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_wqi_report_status
      ON writing_quality_issues(report_id, status);
    CREATE INDEX IF NOT EXISTS idx_wqi_project_chapter_severity
      ON writing_quality_issues(project_id, chapter_id, severity);
    CREATE INDEX IF NOT EXISTS idx_wqi_project_issue_type
      ON writing_quality_issues(project_id, issue_type);

    CREATE TABLE IF NOT EXISTS writing_revision_records (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      issue_id TEXT,
      report_id TEXT,
      revision_type TEXT NOT NULL DEFAULT 'local_refine',
      before_text TEXT NOT NULL,
      after_text TEXT NOT NULL,
      diff_json TEXT DEFAULT '{}',
      applied INTEGER NOT NULL DEFAULT 0,
      applied_at TEXT,
      reverted INTEGER NOT NULL DEFAULT 0,
      reverted_at TEXT,
      payload TEXT DEFAULT '{}',
      created_by TEXT DEFAULT 'system',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_wrr_project_chapter
      ON writing_revision_records(project_id, chapter_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_wrr_issue
      ON writing_revision_records(issue_id);
    CREATE INDEX IF NOT EXISTS idx_wrr_report
      ON writing_revision_records(report_id);
  `);

  console.log('[Migration 018] Created writing_quality_reports, writing_quality_issues, writing_revision_records.');
}

export function down(db: DatabaseSync) {
  db.exec(`
    DROP TABLE IF EXISTS writing_revision_records;
    DROP TABLE IF EXISTS writing_quality_issues;
    DROP TABLE IF EXISTS writing_quality_reports;
  `);
  console.log('[Migration 018] Dropped writing quality engine tables.');
}
