import { expect, it } from 'vitest';
import { readConstitution } from '../project/creative-constitution';
import { deterministicPlatformReview } from './platform-quality-rules';

it('records evidenced deterministic platform risks without claiming semantic payoff failure', () => {
  const content = `清晨，他慢慢收拾行李。${'平静的景色铺展开来。'.repeat(90)}\n事情结束了。`;
  const result = deterministicPlatformReview({ projectId: 'p', runId: 'r', stage: 'chapter', content,
    constitution: readConstitution({ type: 'long_novel', target_platform: 'fanqie' }) });
  expect(result.issues.some(issue => issue.ruleId === 'platform.chapter_length')).toBe(true);
  const gap = result.issues.find(issue => issue.ruleId === 'platform.payoff_emotion_gap_risk');
  expect(gap?.message).toContain('风险标记');
  expect(gap?.evidence.verified).toBe(true);
});
