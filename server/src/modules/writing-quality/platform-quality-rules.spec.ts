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

it('ignores platform rule ids outside the persisted vocabulary instead of mislabelling them', () => {
  const rows = platformReviewToRows({ issues: [{ ruleId: 'platform.unknown_future_rule' } as any] });
  expect(rows).toEqual([]);
});
