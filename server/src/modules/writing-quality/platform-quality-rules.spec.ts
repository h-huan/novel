import { expect, it } from 'vitest';
import { readConstitution } from '../project/creative-constitution';
import { deterministicPlatformReview, platformReviewToRows, partitionPlatformRows, partitionPlatformIssues, isObjectivePlatformRule } from './platform-quality-rules';

it('retains paragraph measurements as probes without forcing a split, while semantic findings remain reviewable',()=>{
 const content='她把信封推回去，等他把话说完。'+ '桌上的名单还留着空位，她知道他在等一个答复，却没有立刻替他作决定。'.repeat(40);
 const review=deterministicPlatformReview({projectId:'p',runId:'r',stage:'chapter',content,constitution:readConstitution({type:'long_novel',target_platform:'fanqie'})});
 const partition=partitionPlatformIssues(review.issues);
 expect(partition.confirmed.some(issue=>['platform.avgParaChars','platform.longParaRatio'].includes(issue.ruleId))).toBe(false);
 expect(partition.probes.some(issue=>issue.ruleId==='platform.avgParaChars')).toBe(true);
 for(const id of ['platform.avgParaChars','platform.longParaRatio','platform_paragraph_length'])expect(isObjectivePlatformRule(id)).toBe(false);
 expect(isObjectivePlatformRule('platform.chapter_length')).toBe(true);
 const rows=platformReviewToRows(review);
 const unconfirmed=partitionPlatformRows(rows,[]);
 expect(unconfirmed.probes.filter(row=>row.issueType==='platform_paragraph_length').every(row=>row.evaluation==='needs_semantic_review')).toBe(true);
 const evaluated=partitionPlatformRows(rows,[{issueType:'platform_paragraph_length'}]);
 expect(evaluated.probes.some(row=>row.issueType==='platform_paragraph_length'&&row.evaluation==='semantic_confirmed')).toBe(true);
});

it('keeps the maximum-length finding while the planning minimum no longer forces padding',()=>{
 const constitution=readConstitution({type:'long_novel',target_platform:'fanqie'});
 for(const words of [2399,5001]){
  const result=deterministicPlatformReview({projectId:'p',runId:'r',stage:'chapter',content:'她'.repeat(words),constitution});
  expect(result.issues.some(issue=>issue.ruleId==='platform.chapter_length')).toBe(words>5000);
 }
});

it('关键词未命中只保留待核对信号，客观比例仍是确认问题，语义确认的问题不被取消', () => {
  const review = deterministicPlatformReview({ projectId: 'p', runId: 'r', stage: 'chapter',
    content: '她从版框里取出弟弟惯用的铅条。'.repeat(100),
    constitution: readConstitution({ type: 'long_novel', target_platform: 'fanqie' }) });
  const result = partitionPlatformRows(platformReviewToRows(review), [{ issueType: 'platform_opening_hook' }]);
  expect(result.confirmed.map(row => row.issueType)).toContain('platform_dialogue_ratio');
  expect(result.confirmed.map(row => row.issueType)).not.toContain('platform_ending_hook');
  expect(result.probes.find(row => row.issueType === 'platform_ending_hook')?.evaluation).toBe('needs_semantic_review');
  expect(result.probes.find(row => row.issueType === 'platform_opening_hook')?.evaluation).toBe('semantic_confirmed');
  const generation = partitionPlatformIssues(review.issues);
  expect(generation.confirmed.some(issue=>issue.ruleId==='platform.dialogue_ratio')).toBe(true);
  expect(generation.confirmed.some(issue=>issue.ruleId==='platform.ending_hook')).toBe(false);
  expect(generation.probes.some(issue=>issue.ruleId==='platform.ending_hook')).toBe(true);
});

it('records evidenced deterministic platform risks without claiming semantic payoff failure', () => {
  const content = `清晨，他慢慢收拾行李。${'平静的景色铺展开来。'.repeat(90)}\n事情结束了。`;
  const result = deterministicPlatformReview({ projectId: 'p', runId: 'r', stage: 'chapter', content,
    constitution: readConstitution({ type: 'long_novel', target_platform: 'fanqie' }) });
  expect(result.issues.some(issue => issue.ruleId === 'platform.chapter_length')).toBe(false);
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
  expect(rows.map(r => r.issueType)).not.toContain('platform_chapter_length');
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
  expect(asChapter.issues.map(issue => issue.ruleId)).not.toContain('platform.chapter_length');
  expect(asChapter.issues.map(issue => issue.ruleId)).toContain('platform.dialogue_ratio');
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
