import { describe, it, expect } from 'vitest';
import {
  scenarioGroupOf, SCENARIO_GROUP_LABEL, platformLabel, storyTypeLabel,
  qualityIssueLabel, checkTypeLabel, severityLabel, scenarioLabel, SCENARIO_GROUP_ORDER,
} from './labels';

describe('scenarioGroupOf 模型场景四大类归并', () => {
  it('架构类：题材/大纲/世界观/角色/组织/伏笔/时间线', () => {
    ['idea_generate', 'outline', 'world_building', 'character_design', 'organization_map', 'foreshadowing', 'timeline']
      .forEach(s => expect(scenarioGroupOf(s)).toBe('architecture'));
  });
  it('正文写作类：writing 系列与 body/chapter_synthesis', () => {
    expect(scenarioGroupOf('writing')).toBe('writing');
    expect(scenarioGroupOf('writing_daily')).toBe('writing');
    expect(scenarioGroupOf('writing_climax')).toBe('writing');
    expect(scenarioGroupOf(undefined, 'body_first')).toBe('writing');
    expect(scenarioGroupOf(undefined, 'body_length_retry')).toBe('writing');
    expect(scenarioGroupOf(undefined, 'body_alignment_repair')).toBe('writing');
    expect(scenarioGroupOf(undefined, 'body_benchmark_refine')).toBe('writing');
    expect(scenarioGroupOf('chapter_synthesis')).toBe('writing');
  });
  it('优化精修类：润色/质检/审查/各类 repair/refine/enhance', () => {
    expect(scenarioGroupOf('polish')).toBe('polish');
    expect(scenarioGroupOf('character_review')).toBe('polish');
    expect(scenarioGroupOf(undefined, 'consistency_repair')).toBe('polish');
    expect(scenarioGroupOf('enhance_opening')).toBe('polish');
  });
  it('日常/其它：daily 与未知 key 兜底，不抛错', () => {
    expect(scenarioGroupOf('daily')).toBe('daily');
    expect(scenarioGroupOf('some_new_scene')).toBe('daily');
    expect(scenarioGroupOf(undefined, undefined)).toBe('daily');
  });
  it('四大类顺序与中文标签齐全', () => {
    expect(SCENARIO_GROUP_ORDER).toEqual(['architecture', 'writing', 'polish', 'daily']);
    SCENARIO_GROUP_ORDER.forEach(g => expect(SCENARIO_GROUP_LABEL[g]).toBeTruthy());
  });
});

describe('中文字典', () => {
  it('平台 / 长短篇', () => {
    expect(platformLabel('fanqie')).toBe('番茄');
    expect(platformLabel('zhihu')).toBe('知乎盐选');
    expect(storyTypeLabel('short_story')).toBe('短篇');
    expect(storyTypeLabel('long_novel')).toBe('长篇');
  });
  it('质检问题 / 矛盾类型 / 严重级 / 场景全部中文，不再漏英文 key', () => {
    expect(qualityIssueLabel('reader_hook')).toBe('开篇抓不住读者');
    expect(qualityIssueLabel('flat_dialogue')).toBe('对话平淡');
    expect(checkTypeLabel('outline_alignment')).toBe('正文与大纲不符');
    expect(severityLabel('high')).toBe('较重');
    expect(scenarioLabel('writing_climax')).toBe('正文写作·高潮章');
  });
  it('未知 key 回退为自身、空值安全，绝不抛错', () => {
    expect(platformLabel(undefined)).toBe('未标注');
    expect(qualityIssueLabel('never_seen_key')).toBe('never_seen_key');
    expect(scenarioLabel(null)).toBe('未知步骤');
  });
});
