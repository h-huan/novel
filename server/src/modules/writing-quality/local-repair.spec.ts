import { it, expect } from 'vitest';
import { applyLocalPatches, compareRepair, selectAnchoredLocalPatchBatch } from './local-repair';
import { parseStageScore, SCORE_DIMENSIONS } from './stage-score';
import { readConstitution } from '../project/creative-constitution';

// 用户选定的执行前提必须齐全，否则"未执行标准"的 blocking 会掩盖本文件真正要测的复检逻辑。
const COMPLETE_STANDARDS = {
  target_platform: 'fanqie',
  settings: { category: '悬疑', storyTone: ['冷峻'], writingStyle: ['简练'], webNovelGenre: ['都市'], pov: '第三人称限知' },
};
it('applies only unique local patches and rejects ambiguous or extensive rewrites', () => {
  expect(applyLocalPatches('0123456789', [{ original: '34', replacement: 'AB' }])).toBe('012AB56789');
  expect(() => applyLocalPatches('aa-aa', [{ original: 'aa', replacement: 'bb' }])).toThrow('唯一');
  expect(() => applyLocalPatches('0123456789', [{ original: '012345', replacement: 'other' }])).toThrow('30%');
});
it('keeps exact fact patches when one original quote is missing and another exceeds the batch budget', () => {
  const content = '甲'.repeat(40) + '旧时间' + '乙'.repeat(40) + '旧称呼' + '丙'.repeat(40);
  const result = selectAnchoredLocalPatchBatch(content, [
    { original: '旧时间', replacement: '三天后上午十点' },
    { original: '模型漏抄的台词', replacement: '没有此人' },
    { original: '旧称呼', replacement: '孙婆' },
    { original: '丙'.repeat(40), replacement: '重写整段' },
  ], 0.2);
  expect(result.patches).toHaveLength(2);
  expect(result.rejected.map(item => item.reason)).toEqual(['原文缺失或匹配不唯一', '超出本批改动预算']);
  expect(applyLocalPatches(content, result.patches, false, 0.2)).toContain('三天后上午十点');
});
it('rejects an improved total when a single dimension regresses', () => {
  const input = { projectId: 'p', runId: 'r', stage: 'world' as const, content: '证据', constitution: readConstitution(COMPLETE_STANDARDS) };
  const make = (context: number, logic: number) => parseStageScore({ dimensions: Object.fromEntries(SCORE_DIMENSIONS.map(k => [k, { score: k === 'context' ? context : logic, reason: '评估', evidence: ['证据'] }])) }, input);
  expect(compareRepair(make(90, 60), make(80, 99)).accepted).toBe(false);
  expect(compareRepair(make(40, 80), make(90, 80)).accepted).toBe(true);
});

it('accepts removal of an evidenced blocker despite small judge score noise', () => {
  const constitution = readConstitution(COMPLETE_STANDARDS);
  const content = '贺兰看到原始签名后才承认地下库的位置。';
  const dimensions = (context: number) => Object.fromEntries(SCORE_DIMENSIONS.map(key => [key, {
    score: key === 'context' ? context : 88,
    reason: '有逐字证据',
    evidence: [content],
  }]));
  const before = parseStageScore({
    dimensions: dimensions(90),
    issues: [{ ruleId: 'character.intelligence', severity: 'blocking', message: '人物无诱因泄密', evidence: content }],
  }, { projectId: 'p', runId: 'before', stage: 'outline', content, constitution });
  const after = parseStageScore({ dimensions: dimensions(87), issues: [] }, {
    projectId: 'p', runId: 'after', stage: 'outline', content, constitution,
  });

  expect(compareRepair(before, after)).toMatchObject({ accepted: true });
});

it('still rejects a repair when a dimension crosses its quality floor', () => {
  const constitution = readConstitution(COMPLETE_STANDARDS);
  const content = '证据段落';
  const make = (context: number) => parseStageScore({
    dimensions: Object.fromEntries(SCORE_DIMENSIONS.map(key => [key, {
      score: key === 'context' ? context : 88,
      reason: '有逐字证据',
      evidence: [content],
    }])),
  }, { projectId: 'p', runId: String(context), stage: 'outline', content, constitution });

  expect(compareRepair(make(75), make(55))).toMatchObject({ accepted: false });
});

it('accepts a fully verified repair of an evidenced blocker even when the first review was partial', () => {
  const constitution = readConstitution(COMPLETE_STANDARDS);
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
