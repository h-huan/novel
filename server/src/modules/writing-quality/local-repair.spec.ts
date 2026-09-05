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
