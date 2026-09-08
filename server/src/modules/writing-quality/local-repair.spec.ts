import { it, expect } from 'vitest';
import { applyLocalPatches, compareRepair } from './local-repair';
import { parseStageScore, SCORE_DIMENSIONS } from './stage-score';
import { readConstitution } from '../project/creative-constitution';
it('applies only unique local patches and rejects ambiguous or extensive rewrites', () => {
  expect(applyLocalPatches('0123456789', [{ original: '34', replacement: 'AB' }])).toBe('012AB56789');
  expect(() => applyLocalPatches('aa-aa', [{ original: 'aa', replacement: 'bb' }])).toThrow('唯一');
  expect(() => applyLocalPatches('0123456789', [{ original: '012345', replacement: 'other' }])).toThrow('30%');
});
it('rejects an improved total when a single dimension regresses', () => {
  const input = { projectId: 'p', runId: 'r', stage: 'world' as const, content: '证据', constitution: readConstitution({}) };
  const make = (context: number, logic: number) => parseStageScore({ dimensions: Object.fromEntries(SCORE_DIMENSIONS.map(k => [k, { score: k === 'context' ? context : logic, reason: '评估', evidence: ['证据'] }])) }, input);
  expect(compareRepair(make(90, 60), make(80, 99)).accepted).toBe(false);
  expect(compareRepair(make(40, 80), make(90, 80)).accepted).toBe(true);
});

it('accepts a fully verified repair of an evidenced blocker even when the first review was partial', () => {
  const constitution = readConstitution({ targetPlatform: '番茄' });
  const before = parseStageScore({
    dimensions: {
      context: { score: 30, reason: '新增未授权人物', evidence: ['律师'] },
    },
    issues: [{ ruleId: 'context.allowed_characters', severity: 'blocking', message: '新增未授权人物', evidence: '律师' }],
  }, { projectId: 'p', runId: 'before', stage: 'outline', content: '律师参与签署。', constitution });
  const afterContent = '林铎本人完成签署。';
  const after = parseStageScore({
    dimensions: Object.fromEntries(SCORE_DIMENSIONS.map(key => [key, {
      score: 90,
      reason: '已按创作宪法修复',
      evidence: [afterContent],
    }])),
    issues: [],
  }, { projectId: 'p', runId: 'after', stage: 'outline', content: afterContent, constitution });

  expect(before.status).toBe('partial');
  expect(compareRepair(before, after).accepted).toBe(true);
});
