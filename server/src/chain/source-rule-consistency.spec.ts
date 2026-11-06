import { describe, expect, it } from 'vitest';
import { confirmedWorldProtagonistName, describeWorldSourceCandidate, normalizeWorldSourceCandidate } from './source-rule-consistency';

describe('generic world source validation', () => {
  it('does not misidentify anonymous first-person narration and roles as names', () => {
    for (const description of ['我，一名修理工', '我是个修理工', '主角：修理工', '匿名主角', '叙述者', '一名技工']) {
      expect(confirmedWorldProtagonistName(description)).toBe('');
    }
  });

  it('retains an actually named first-person protagonist', () => {
    expect(confirmedWorldProtagonistName('李明，修理工')).toBe('李明');
    expect(confirmedWorldProtagonistName('我叫李明，修理工')).toBe('李明');
  });
  it('rejects malformed/empty world records without encoding a particular story mechanic', () => {
    expect(describeWorldSourceCandidate({ error: '生成失败', rules: [] }, '甲'))
      .toContain('世界观rules必须包含至少一条非空因果规则；具体数量由本作品结构需要决定，不设公共固定配额');
  });

  it('does not impose a universal 2-3 world-rule quota', () => {
    expect(describeWorldSourceCandidate({
      era: '任意时代', storyPremise: '甲面对一个需要遵守的核心规则', atmosphere: '自定', endingDirection: '完成本故事收束',
      rules: ['唯一必要的核心因果规则'], locations: ['地点A'],
    }, '甲')).toEqual([]);
  });

  it('accepts a substantive world candidate for arbitrary genres', () => {
    expect(describeWorldSourceCandidate({
      era: '当代',
      storyPremise: '甲在新的现实压力下寻找解决办法',
      atmosphere: '克制',
      endingDirection: '完成核心选择并承担后果',
      rules: ['公开规则一', '公开规则二'],
      locations: ['地点A'],
    }, '甲')).toEqual([]);
  });

  it('keeps protagonist anchoring as structure validation', () => {
    expect(describeWorldSourceCandidate({
      era: '当代', storyPremise: '乙的故事', atmosphere: '平静', endingDirection: '收束',
      rules: ['规则一', '规则二'], locations: ['地点A'],
    }, '甲')).toContain('世界观storyPremise未保留主角“甲”');
  });
});

describe('world JSON root recovery before unchanged semantic and source Gates',()=>{
 const valid={era:'当代',storyPremise:'甲必须面对真正的危机',atmosphere:'悬疑',
  endingDirection:'甲作出最终选择',rules:['当甲采取行动时，真实结果才会发生'],locations:['家中']};
 it('recovers complete doubly encoded objects and sole-item world arrays without rewriting facts',()=>{
  for(const value of [JSON.stringify(valid),JSON.stringify(JSON.stringify(valid)),[valid],{world:valid},{worldview:valid},{worldSetting:valid}]){
   const normalized=normalizeWorldSourceCandidate(value);
   expect(normalized).toEqual(valid);
   expect(describeWorldSourceCandidate(normalized,'甲')).toEqual([]);
  }
 });
 it('never promotes ambiguous, malformed or incomplete objects to a valid world',()=>{
  for(const value of [[valid,valid],{world:valid,other:'different world'},{world:[valid]},
   'unstructured text with {"era":"当代"} inside',JSON.stringify({era:'当代'}),null]){
   const normalized=normalizeWorldSourceCandidate(value);
   expect(describeWorldSourceCandidate(normalized,'甲').length).toBeGreaterThan(0);
  }
 });
});
