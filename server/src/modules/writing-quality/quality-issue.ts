import { createHash } from 'node:crypto';

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
}

/** Adapts warning/contradiction/hardline and persisted issues without inventing evidence. */
export function qualityIssue(input: {
  id?: string; projectId: string; entityId?: string | null; runId?: string | null;
  constitutionRevision?: number | null; stage: QualityStage; ruleId: string;
  severity?: string; status?: string; message: string; quote?: string; content?: string;
  source: string;
}): QualityIssue {
  const severity: QualitySeverity = ({ critical: 'blocking', CRITICAL: 'blocking', contradiction: 'blocking',
    warning: 'medium', WARNING: 'medium', INFO: 'info' } as Record<string, QualitySeverity>)[input.severity || '']
    || (['blocking', 'high', 'medium', 'low', 'info'].includes(input.severity || '') ? input.severity as QualitySeverity : 'medium');
  const quote = typeof input.quote === 'string' ? input.quote.trim() : '';
  const start = quote && input.content ? input.content.indexOf(quote) : -1;
  const verified = start >= 0;
  return {
    id: input.id || createHash('sha256').update(JSON.stringify([input.projectId, input.entityId, input.runId, input.ruleId, quote, input.message])).digest('hex'),
    projectId: input.projectId, entityId: input.entityId ?? null, runId: input.runId ?? null,
    constitutionRevision: input.constitutionRevision ?? null, stage: input.stage, ruleId: input.ruleId,
    severity, status: ['resolved', 'superseded', 'dismissed'].includes(input.status || '') ? input.status as QualityIssue['status'] : 'open',
    message: input.message, evidence: { quote, start: verified ? start : null, end: verified ? start + quote.length : null, verified },
    evaluation: verified ? 'evidenced' : 'insufficient_evidence', source: input.source,
  };
}

export function qualityGate(issues: QualityIssue[], evaluated: boolean) {
  const blocking = issues.filter(i => i.status === 'open' && i.severity === 'blocking');
  return { passed: evaluated && blocking.length === 0,
    status: !evaluated ? 'not_evaluated' : blocking.length ? 'blocked' : 'passed',
    blockingIssueIds: blocking.map(i => i.id) };
}
