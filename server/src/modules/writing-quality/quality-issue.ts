import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export type QualityStage = 'project' | 'world' | 'character' | 'outline' | 'chapter' | 'refinement';
export type QualitySeverity = 'blocking' | 'high' | 'medium' | 'low' | 'info';
export interface QualityIssue {
  id: string;
  projectId: string;
  entityId: string | null;
  runId: string | null;
  constitutionRevision: number | null;
  stage: QualityStage;
  ruleId: string;
  severity: QualitySeverity;
  status: 'open' | 'resolved' | 'superseded' | 'dismissed';
  message: string;
  evidence: { quote: string; start: number | null; end: number | null; verified: boolean };
  evaluation: 'evidenced' | 'insufficient_evidence';
  source: string;
  contractVersion?: string;
  contractField?: string;
}

/** Adapts warning/contradiction/hardline and persisted issues without inventing evidence. */
export function qualityIssue(input: {
  id?: string; projectId: string; entityId?: string | null; runId?: string | null;
  constitutionRevision?: number | null; stage: QualityStage; ruleId: string;
  severity?: string; status?: string; message: string; quote?: string; content?: string;
  evidenceVerified?: boolean; source: string;
}): QualityIssue {
  const severity: QualitySeverity = ({ critical: 'blocking', CRITICAL: 'blocking', contradiction: 'blocking',
    warning: 'medium', WARNING: 'medium', INFO: 'info' } as Record<string, QualitySeverity>)[input.severity || '']
    || (['blocking', 'high', 'medium', 'low', 'info'].includes(input.severity || '') ? input.severity as QualitySeverity : 'medium');
  const quote = typeof input.quote === 'string' ? input.quote.trim() : '';
  const start = quote && input.content ? input.content.indexOf(quote) : -1;
  const verified = input.evidenceVerified === true || start >= 0;
  return {
    id: input.id || createHash('sha256').update(JSON.stringify([input.projectId, input.entityId, input.runId, input.ruleId, quote, input.message])).digest('hex'),
    projectId: input.projectId, entityId: input.entityId ?? null, runId: input.runId ?? null,
    constitutionRevision: input.constitutionRevision ?? null, stage: input.stage, ruleId: input.ruleId,
    severity, status: ['resolved', 'superseded', 'dismissed'].includes(input.status || '') ? input.status as QualityIssue['status'] : 'open',
    message: input.message, evidence: { quote, start: start >= 0 ? start : null, end: start >= 0 ? start + quote.length : null, verified },
    evaluation: verified ? 'evidenced' : 'insufficient_evidence', source: input.source,
  };
}

export function qualityGate(issues: QualityIssue[], evaluated: boolean) {
  const blocking = issues.filter(i => i.status === 'open' && i.severity === 'blocking');
  return { passed: evaluated && blocking.length === 0,
    status: blocking.length ? 'blocked' : !evaluated ? 'not_evaluated' : 'passed',
    blockingIssueIds: blocking.map(i => i.id) };
}

export interface QualityIssueWrite {
  ruleId: string;
  severity?: string;
  status?: string;
  message: string;
  quote?: string;
  content?: string;
  evidenceVerified?: boolean;
  suggestion?: string;
  details?: unknown;
  entityId?: string | null;
  runId?: string | null;
  constitutionRevision?: number | null;
}

/**
 * The only persistence adapter for non-manual quality checks.
 * One report represents one current artifact scope; reruns replace its open
 * findings instead of creating a report for each model response.
 */
export function replaceQualityIssues(db: DatabaseSync, input: {
  projectId: string;
  stage: QualityStage;
  source: string;
  scopeKey: string;
  chapterId?: string | null;
  title?: string;
  overallScore?: number | null;
  issues: QualityIssueWrite[];
}): { reportId: string; issues: QualityIssue[] } {
  const now = new Date().toISOString();
  const reportId = `quality_${createHash('sha256').update(JSON.stringify([
    input.projectId, input.stage, input.source, input.scopeKey,
  ])).digest('hex')}`;
  const normalized = input.issues.map(raw => qualityIssue({
    ...raw,
    projectId: input.projectId,
    entityId: raw.entityId ?? input.chapterId ?? null,
    stage: input.stage,
    source: input.source,
    severity: raw.severity,
  }));
  const blocking = normalized.some(issue => issue.status === 'open' && issue.severity === 'blocking');
  const evaluated = normalized.every(issue => issue.evaluation === 'evidenced') || normalized.length === 0;
  const summary = normalized.length === 0 ? '未发现问题' : `${normalized.length} 条问题`;

  db.prepare(`INSERT INTO writing_quality_reports
    (id,project_id,chapter_id,source_type,source_id,scope,title,summary,overall_level,overall_score,status,payload,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET chapter_id=excluded.chapter_id,summary=excluded.summary,
      overall_level=excluded.overall_level,overall_score=excluded.overall_score,status=excluded.status,
      payload=excluded.payload,updated_at=excluded.updated_at`).run(
    reportId, input.projectId, input.chapterId ?? null, `quality:${input.source}`, input.scopeKey,
    input.stage, input.title || `${input.stage}质量检查`, summary,
    blocking ? 'low' : normalized.length ? 'medium' : 'high', input.overallScore ?? null,
    evaluated ? (blocking ? 'blocked' : 'open') : 'not_evaluated',
    JSON.stringify({ evaluation: evaluated ? 'evaluated' : 'insufficient_evidence', source: input.source }), now, now,
  );
  db.prepare("UPDATE writing_quality_issues SET status='superseded',updated_at=? WHERE report_id=? AND status='open'")
    .run(now, reportId);

  const insert = db.prepare(`INSERT INTO writing_quality_issues
    (id,report_id,project_id,chapter_id,issue_type,severity,title,summary,evidence,suggestion,
     start_offset,end_offset,status,payload,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET chapter_id=excluded.chapter_id,severity=excluded.severity,
      title=excluded.title,summary=excluded.summary,evidence=excluded.evidence,suggestion=excluded.suggestion,
      start_offset=excluded.start_offset,end_offset=excluded.end_offset,status=excluded.status,
      payload=excluded.payload,updated_at=excluded.updated_at`);
  normalized.forEach((issue, index) => {
    const raw = input.issues[index];
    const issueId = createHash('sha256').update(JSON.stringify([
      reportId, issue.ruleId, issue.evidence.quote, issue.message,
    ])).digest('hex');
    issue.id = issueId;
    insert.run(issueId, reportId, input.projectId, input.chapterId ?? null, issue.ruleId,
      issue.severity, issue.message, issue.message, issue.evidence.quote || null, raw.suggestion ?? null,
      issue.evidence.start, issue.evidence.end, issue.status,
      JSON.stringify({ qualityIssue: issue, details: raw.details ?? null }), now, now);
  });
  return { reportId, issues: normalized };
}
