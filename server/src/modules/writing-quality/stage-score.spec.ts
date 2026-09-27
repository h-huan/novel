import { it, expect } from 'vitest';
import { parseStageScore, SCORE_DIMENSIONS, aggregateProjectScore, stageJudgePrompt, applicableScoreDimensions } from './stage-score';
import { readConstitution } from '../project/creative-constitution';
// 执行前提（用户选定）：平台/分类/基调/文风/流派/视角全部设置，测试本身不得落在"未执行标准"上。
const COMPLETE_STANDARDS = {
  target_platform: 'fanqie',
  settings: { category: '悬疑', storyTone: ['冷峻'], writingStyle: ['简练'], webNovelGenre: ['都市'], pov: '第三人称限知' },
};
const input = { projectId: 'p', runId: 'r', stage: 'world' as const, content: '真实引用', constitution: readConstitution(COMPLETE_STANDARDS) };
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
  expect(result.dimensions.platform.status).toBe('evaluated');
  // pov 只在大纲/正文阶段评分，world 阶段确实"不适用"，与"未执行标准"必须区分。
  expect(result.dimensions.pov.status).toBe('not_applicable');
  expect(result.dimensions.context.score).toBe(20);
});

// 口径变更（用户指令）：平台/分类/基调/文风/流派/视角是执行约束，不再被降级为 high。
// 评审模型给出的严重度必须原样保留 —— 这条断言是"禁止降级"的回归锁。
it('preserves a blocking expressive verdict exactly as the reviewer reported it', () => {
  const dimensions = Object.fromEntries(SCORE_DIMENSIONS.map(k => [k, { score: 99, reason: '满足', evidence: ['真实引用'] }]));
  const result = parseStageScore({ dimensions, issues: [
    { ruleId: 'constitution.style', severity: 'blocking', message: '文风偏平，缺少具体动作', evidence: '真实引用' },
    { ruleId: 'constitution.tone', severity: 'BLOCKING', message: '基调偏冷', evidence: '真实引用' },
    { ruleId: 'ai_trace.abstract_summary', severity: 'blocking', message: '以抽象总结收尾', evidence: '真实引用' },
    { ruleId: 'constitution.timeline', severity: 'blocking', message: '时间线与前文互斥', evidence: '真实引用' },
    { ruleId: 'constitution.world_rules', severity: 'blocking', message: '违反已确认世界规则', evidence: '真实引用' },
  ] }, input);
  expect(result.issues.find(i => i.ruleId === 'constitution.style')?.severity).toBe('blocking');
  expect(result.issues.find(i => i.ruleId === 'constitution.tone')?.severity).toBe('blocking');
  expect(result.issues.find(i => i.ruleId === 'ai_trace.abstract_summary')?.severity).toBe('blocking');
  expect(result.issues.find(i => i.ruleId === 'constitution.timeline')?.severity).toBe('blocking');
  expect(result.issues.find(i => i.ruleId === 'constitution.world_rules')?.severity).toBe('blocking');
  expect(result.gateStatus).toBe('blocked');
});

it('blocks a below-floor expressive dimension the user selected', () => {
  const constitution = readConstitution({
    target_platform: 'fanqie', story_category: '悬疑', story_tone: ['冷峻'],
    web_novel_genre: ['都市'], writing_style: ['简练'],
  });
  const chapterInput = { ...input, stage: 'chapter' as const, constitution };
  const dimensions = Object.fromEntries(SCORE_DIMENSIONS.map(k => [k, { score: k === 'tone' ? 30 : 99, reason: '基调与所选不符', evidence: ['真实引用'] }]));
  const result = parseStageScore({ dimensions }, chapterInput);
  expect(result.dimensions.tone.status).toBe('evaluated');
  expect(result.issues.find(i => i.ruleId === 'constitution.tone')?.severity).toBe('blocking');
  expect(result.gateStatus).toBe('blocked');
});

it('treats an empty constitution as unexecuted standards instead of not_applicable', () => {
  const bare = { ...input, constitution: readConstitution({}) };
  const dimensions = Object.fromEntries(SCORE_DIMENSIONS.map(k => [k, { score: 99, reason: '满足', evidence: ['真实引用'] }]));
  const result = parseStageScore({ dimensions }, bare);
  expect(result.dimensions.platform.status).toBe('missing_standard');
  expect(result.dimensions.category.status).toBe('missing_standard');
  const missing = result.issues.filter(i => i.source === 'constitution_missing_standard');
  expect(missing.map(i => i.ruleId)).toContain('constitution.category.missing_standard');
  expect(missing.every(i => i.severity === 'blocking')).toBe(true);
  expect(result.gateStatus).toBe('blocked');
  // 未执行标准不得被"评分"成通过：整体分无法成立。
  expect(result.overallScore).toBeNull();
  // 六维创作前提在适用阶段入分母；world 阶段不评价叙事视角。
  expect(result.coverage).toBeCloseTo(4 / 9, 5);
  expect(result.dimensions.pov.status).toBe('not_applicable');
});

it('评审侧拿到的是与生成侧同一份执行标准，含按平台分类执行的逐维口径', () => {
  // 判定侧只给宪法原文 = 「说一套判另一套」：模型看不到分类落位、头部官方标签与落差。
  const constitution = readConstitution({
    target_platform: 'fanqie',
    settings: {
      category: '都市·现实/都市',
      targetAudience: '男频',
      storyTone: ['热血'],
      writingStyle: ['白描/朴素'],
      webNovelGenre: ['系统流'],
      submissionTags: ['系统流'],
      pov: '第三人称限知',
    },
  });
  const prompt = stageJudgePrompt('正文', '上下文', constitution, 'chapter');
  expect(prompt).toContain('项目执行标准 · 最高优先级');
  expect(prompt).toContain('按平台分类执行');
  // 流派维的真实落差必须进入评审提示词，否则评审器无从判定该维是否被兑现。
  expect(prompt).toContain('系统流');
  expect(prompt).toContain('落差');
  expect(prompt).toContain('不得默认通过');
});


describe('判定单元（整章 / 片段）—— 单元不成立，不是降严重度', () => {
  const longConstitution = readConstitution(COMPLETE_STANDARDS);

  it('片段单元：整章级维度为 not_applicable，表达层与事实层维度照旧生效', () => {
    const applicable = applicableScoreDimensions(longConstitution, 'refinement', 'segment');
    for (const key of ['platform', 'category', 'tone', 'length', 'structure', 'pacing', 'payoff', 'retention'] as const) {
      expect(applicable[key]).toBe(false);
    }
    for (const key of ['style', 'genre', 'pov', 'context', 'logic', 'prose', 'character_voice'] as const) {
      expect(applicable[key]).toBe(true);
    }
  });

  it('整章单元（缺省）保持整章口径：不声明单元就不得放宽任何整章级维度', () => {
    const applicable = applicableScoreDimensions(longConstitution, 'refinement');
    for (const key of ['platform', 'category', 'tone', 'length', 'structure', 'payoff', 'retention'] as const) {
      expect(applicable[key]).toBe(true);
    }
  });

  it('片段单元不得把「未执行标准」一起放掉：空宪法在任何单元都照样 blocking', () => {
    const empty = readConstitution({});
    const score = parseStageScore(null, { ...input, constitution: empty, stage: 'refinement', unit: 'segment' });
    // 维度单元不适用，但空宪法是「执行前提缺失」：必须先于单元判定，且仍然阻断。
    expect(score.dimensions.category.status).toBe('missing_standard');
    expect(score.issues.some(i => i.ruleId === 'constitution.category.missing_standard' && i.severity === 'blocking')).toBe(true);
    expect(score.gateStatus).toBe('blocked');
  });

  it('片段单元的评审提示词不再索要整章级维度，但仍索要文风/流派/视角', () => {
    const listOf = (unit: 'chapter' | 'segment') => {
      const prompt = stageJudgePrompt('正文片段', '上下文', longConstitution, 'refinement', unit);
      return String(prompt.split('本阶段只评估这些适用维度：')[1].split('。')[0]).split('、');
    };
    const segment = listOf('segment');
    for (const key of ['tone', 'length', 'retention', 'structure', 'pacing', 'payoff', 'platform', 'category']) {
      expect(segment).not.toContain(key);
    }
    for (const key of ['style', 'genre', 'pov']) expect(segment).toContain(key);
    // 同一宪法换回整章单元：整章级维度必须回到适用清单，单元判定不是通用放宽。
    const chapter = listOf('chapter');
    for (const key of ['tone', 'length', 'retention', 'structure', 'payoff']) expect(chapter).toContain(key);
  });
});
