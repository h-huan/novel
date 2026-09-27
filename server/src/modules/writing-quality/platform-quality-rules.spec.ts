import { expect, it } from 'vitest';
import { readConstitution } from '../project/creative-constitution';
import { deterministicPlatformReview, platformReviewToRows } from './platform-quality-rules';

it('records evidenced deterministic platform risks without claiming semantic payoff failure', () => {
  const content = `清晨，他慢慢收拾行李。${'平静的景色铺展开来。'.repeat(90)}\n事情结束了。`;
  const result = deterministicPlatformReview({ projectId: 'p', runId: 'r', stage: 'chapter', content,
    constitution: readConstitution({ type: 'long_novel', target_platform: 'fanqie' }) });
  expect(result.issues.some(issue => issue.ruleId === 'platform.chapter_length')).toBe(true);
  const gap = result.issues.find(issue => issue.ruleId === 'platform.payoff_emotion_gap_risk');
  expect(gap?.message).toContain('风险标记');
  expect(gap?.evidence.verified).toBe(true);
});

it('maps every deterministic platform finding to a persistable quality tag with an actionable suggestion', () => {
  const content = `清晨，他慢慢收拾行李。${'平静的景色铺展开来。'.repeat(90)}\n事情结束了。`;
  const review = deterministicPlatformReview({ projectId: 'p', runId: 'r', stage: 'chapter', content,
    constitution: readConstitution({ type: 'long_novel', target_platform: 'fanqie' }) });
  const rows = platformReviewToRows(review);
  // 同一份 measureAgainstTarget 的每一类短板都必须能在质检侧落库，而不是被丢弃/改写成 needs_hook
  expect(rows.map(r => r.issueType)).toContain('platform_chapter_length');
  expect(rows.map(r => r.issueType)).toContain('platform_dialogue_ratio');
  expect(rows.map(r => r.issueType)).toContain('platform_opening_hook');
  for (const row of rows) {
    expect(row.issueType.startsWith('platform_')).toBe(true);
    expect(row.tags).toEqual([row.issueType]);
    expect(row.title.length).toBeGreaterThan(0);
    expect(row.evidence.length).toBeGreaterThan(0);
    expect(row.suggestion.length).toBeGreaterThan(0);
  }
});

it('片段单元不产出整章级平台指标，但仍产出段落级指标（单元不适用，不是降严重度）', () => {
  const fragment = '退了账，走了。' + '平静的景色铺展开来。'.repeat(30);
  const review = deterministicPlatformReview({ projectId: 'p', runId: 'r', stage: 'refinement', unit: 'segment',
    content: fragment, constitution: readConstitution({ type: 'long_novel', target_platform: 'fanqie' }) });
  const ids = review.issues.map(issue => issue.ruleId);
  for (const chapterLevel of ['platform.chapter_length', 'platform.dialogue_ratio',
    'platform.opening_hook_position', 'platform.ending_hook', 'platform.payoff_emotion_gap_risk']) {
    expect(ids).not.toContain(chapterLevel);
  }
  expect(ids).toContain('platform.avgParaChars');
  // 同一内容在整章单元上必须照旧逐条产出：单元判定不得变成通用放宽
  const asChapter = deterministicPlatformReview({ projectId: 'p', runId: 'r', stage: 'chapter',
    content: fragment, constitution: readConstitution({ type: 'long_novel', target_platform: 'fanqie' }) });
  expect(asChapter.issues.map(issue => issue.ruleId)).toContain('platform.chapter_length');
});

it('按平台分类执行：目标总字数落在该分类头部实测区间之外会被确定性判出并可落库', () => {
  // 用平台基准自身构造：只覆盖本判据要用的分类与目标总字数，不手抄一份 platformRules
  const constitution = { ...readConstitution({ type: 'long_novel', target_platform: 'fanqie' }),
    category: '都市·现实/都市', targetWords: 120000, targetAudience: '男频' };
  const review = deterministicPlatformReview({ projectId: 'p', runId: 'r', stage: 'chapter',
    content: '正文'.repeat(1600), constitution });
  const found = review.issues.find(issue => issue.ruleId === 'platform.category_word_scale');
  expect(found).toBeDefined();
  expect(found?.message).toContain('120000');
  expect(found?.message).toContain('都市日常');
  expect(found?.severity).toBe('high');
  // 词汇表缺映射会被 platformReviewToRows 静默丢弃 —— 必须能落到质检问题
  expect(platformReviewToRows(review).map(row => row.issueType)).toContain('platform_category_word_scale');
});

it('已归位分类但未设定目标总字数：判「分类」维未执行（unset 与落区间外是两条判据，都阻断）', () => {
  const constitution = { ...readConstitution({ type: 'long_novel', target_platform: 'fanqie' }),
    category: '都市·现实/都市', targetWords: undefined, targetAudience: '男频' };
  const review = deterministicPlatformReview({ projectId: 'p', runId: 'r', stage: 'chapter',
    content: '正文'.repeat(1600), constitution });
  const unset = review.issues.find(issue => issue.ruleId === 'platform.category_word_scale_unset');
  expect(unset).toBeDefined();
  expect(unset?.message).toContain('未设定');
  expect(unset?.message).toContain('都市日常');
  expect(unset?.severity).toBe('high');
  // 未设定 = 该维未执行，不得被当成「落区间外」的另一条判据或静默通过
  expect(review.issues.some(issue => issue.ruleId === 'platform.category_word_scale')).toBe(false);
  expect(platformReviewToRows(review).map(row => row.issueType)).toContain('platform_category_word_scale');
});

it('未采集到该分类实测体量时不产出体量判据（缺失即缺失，不拿别的区间顶）', () => {
  const constitution = { ...readConstitution({ type: 'long_novel', target_platform: 'fanqie' }),
    category: '男频·不存在的分类', targetWords: 120000, targetAudience: '男频' };
  const review = deterministicPlatformReview({ projectId: 'p', runId: 'r', stage: 'chapter',
    content: '正文'.repeat(1600), constitution });
  const ids = review.issues.map(issue => issue.ruleId);
  expect(ids).not.toContain('platform.category_word_scale');
  expect(ids).not.toContain('platform.category_word_scale_unset');
});

it('ignores platform rule ids outside the persisted vocabulary instead of mislabelling them', () => {
  const rows = platformReviewToRows({ issues: [{ ruleId: 'platform.unknown_future_rule' } as any] });
  expect(rows).toEqual([]);
});
