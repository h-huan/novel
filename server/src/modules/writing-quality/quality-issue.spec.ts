import { it, expect } from 'vitest';
import { qualityIssue, qualityGate } from './quality-issue';
import { QualityInspectionService } from '../refinement/quality-inspection.service';
it('normalizes severity, anchors real evidence, and blocks independently of scores', () => {
  const issue = qualityIssue({ projectId: 'p', stage: 'world', ruleId: 'contradiction', source: 'gate',
    severity: 'CRITICAL', message: '冲突', quote: '太阳从西边升起', content: '清晨，太阳从西边升起。' });
  expect(issue.evidence).toMatchObject({ verified: true, start: 3 });
  expect(qualityGate([issue], true).passed).toBe(false);
  expect(qualityGate([{ ...issue, status: 'resolved' }], true).passed).toBe(true);
  expect(qualityGate([], false).passed).toBe(false);
});
it('does not fabricate evidence offsets or diagnostics', () => {
  const issue = qualityIssue({ projectId: 'p', stage: 'chapter', ruleId: 'warning', source: 'legacy', message: '缺信息' });
  expect(issue.evidence.start).toBeNull();
  expect(issue.evaluation).toBe('insufficient_evidence');
  const service = new QualityInspectionService();
  const text = '早上他走进房间。晚上他走出房间。';
  const result = service.inspect(text);
  expect(result.overallScore).toBeNull();
  expect(result.logicIssues).toEqual([]);
  expect(result.characterDrift).toEqual([]);
  expect(result.foreshadowingMisses).toEqual([]);
  expect(Object.values(result.dimensions).every(v => v === null)).toBe(true);
  expect(service.inspect(text)).toEqual(result);
});
