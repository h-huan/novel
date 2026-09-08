import { it, expect } from 'vitest';
import { parseStageScore, SCORE_DIMENSIONS, aggregateProjectScore } from './stage-score';
import { readConstitution } from '../project/creative-constitution';
const input = { projectId: 'p', runId: 'r', stage: 'world' as const, content: '真实引用', constitution: readConstitution({}) };
it('does not count missing or fabricated evidence as high scores', () => {
  const score = parseStageScore({ dimensions: { context: { score: 99, reason: '好', evidence: ['不存在'] } } }, input);
  expect(score.overallScore).toBeNull();
  expect(score.dimensions.context.status).toBe('not_evaluated');
});

it('anchors evidence when the quoted JSON differs only in whitespace', () => {
  const content = '{\n  "platform": "番茄",\n  "tone": "热血"\n}';
  const score = parseStageScore({
    dimensions: {
      context: { score: 88, reason: '遵守设定', evidence: ['"platform":"番茄"'] },
    },
  }, { ...input, content });

  expect(score.dimensions.context.status).toBe('evaluated');
  expect(content).toContain(score.dimensions.context.evidence[0]);
});

it('keeps the project unassessed until all prerequisite stages are assessed', () => {
  const world = parseStageScore({ dimensions: Object.fromEntries(SCORE_DIMENSIONS.map(k => [k, { score: 90, reason: '满足', evidence: ['真实引用'] }])) }, input);
  expect(aggregateProjectScore({ world }).overallScore).toBeNull();
  expect(aggregateProjectScore({ world }).coverage).toBe(0.25);
  expect(aggregateProjectScore({ world, character: world, outline: world, chapter: world }).overallScore).toBe(90);
});
it('preserves all dimensions and marks a low consistency dimension blocking', () => {
  const dimensions = Object.fromEntries(SCORE_DIMENSIONS.map(k => [k, { score: k === 'context' ? 20 : 99, reason: '与前文冲突', evidence: ['真实引用'] }]));
  const result = parseStageScore({ dimensions }, input);
  expect(result.coverage).toBe(1);
  expect(result.issues.some(i => i.severity === 'blocking')).toBe(true);
  expect(result.dimensions.platform.status).toBe('not_applicable');
  expect(result.dimensions.context.score).toBe(20);
});
