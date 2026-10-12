import { it, expect } from 'vitest';
import { applyLocalPatches, compareRepair, selectAnchoredLocalPatchBatch } from './local-repair';

it('deletes a whole prose paragraph without creating blank paragraphs or changing unrelated spacing', () => {
  const first='原段保留。'.repeat(30), last='下一段保留。'.repeat(30);
  const untouched='\n\n\n\n  另一处原有空行与缩进。';
  const body=first+'\n\n删去的重复段落。\n\n'+last+untouched;
  const patch={original:'删去的重复段落。',replacement:''};
  const selected=selectAnchoredLocalPatchBatch(body,[patch],0.2);
  expect(applyLocalPatches(body,selected.patches,false,0.2)).toBe(first+'\n\n'+last+untouched);
});

it('keeps inline deletion exact and handles paragraph deletion at Windows document edges', () => {
  const kept='保留的正文。'.repeat(40);
  expect(applyLocalPatches('删去首段。\r\n\r\n'+kept,[{original:'删去首段。',replacement:''}])).toBe(kept);
  expect(applyLocalPatches(kept+'\r\n\r\n删去末段。',[{original:'删去末段。',replacement:''}])).toBe(kept);
  const inline=kept+'\n\n句内删除旧词，空行保持。';
  expect(applyLocalPatches(inline,[{original:'旧词',replacement:''}])).toBe(kept+'\n\n句内删除，空行保持。');
});

it('counts a removed paragraph separator in the same local-change budget', () => {
  const body='保留。'.repeat(30)+'\n\n删段\n\n'+'后文。'.repeat(30);
  const patch={original:'删段',replacement:''};
  const limit=3/body.length;
  expect(selectAnchoredLocalPatchBatch(body,[patch],limit).rejected[0].reason).toBe('超出本批改动预算');
  expect(()=>applyLocalPatches(body,[patch],false,limit)).toThrow('局部修复范围超过');
});
import { parseStageScore, SCORE_DIMENSIONS } from './stage-score';
import { readConstitution } from '../project/creative-constitution';
import { dimensionBasis } from '../../test/quality-review.fixture';

// 用户选定的执行前提必须齐全，否则"未执行标准"的 blocking 会掩盖本文件真正要测的复检逻辑。
const COMPLETE_STANDARDS = {
  target_platform: 'fanqie',
  settings: { category: '悬疑', storyTone: ['冷峻'], writingStyle: ['简练'], webNovelGenre: ['都市'], genreFitNote: '现实城市职业与人际冲突推动人物选择', pov: '第三人称限知' },
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
  const make = (context: number, logic: number) => parseStageScore({ dimensions: Object.fromEntries(SCORE_DIMENSIONS.map(k => [k, { score: k === 'context' ? context : logic, reason: '评估', evidence: ['证据'], basis: dimensionBasis(input.constitution,k) }])) }, input);
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
    basis: dimensionBasis(constitution, key),
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
      basis: dimensionBasis(constitution, key),
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
      basis: dimensionBasis(constitution, key),
    }])),
    issues: [],
  }, { projectId: 'p', runId: 'after', stage: 'outline', content: afterContent, constitution });

  expect(before.status).toBe('partial');
  expect(compareRepair(before, after).accepted).toBe(true);
});
