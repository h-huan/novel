import { describe, expect, it } from 'vitest';
import { describeWorldSourceCandidate } from './source-rule-consistency';

describe('generic world source validation', () => {
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
