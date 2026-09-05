import { it, expect } from 'vitest';
import { styleFingerprint } from './style-fingerprint';
it('detects cross-chapter repetition with exact evidence and separates speaker risks', () => {
  const text = '他从门后取下那把已经生锈多年却仍然舍不得丢弃的钥匙。她沿着河岸一直走到灯火逐渐熄灭的小村庄门口才停下来。他们早已经约定无论发生什么事情都必须在天亮之前返回。';
  const result = styleFingerprint({ projectId: 'p', runId: 'r', content: text,
    previousChapters: [{ id: 'c', content: text }], characterNames: [] });
  expect(result.issues[0]).toMatchObject({ ruleId: 'style.cross_chapter_repetition', severity: 'blocking', evidence: { verified: true } });
  expect(styleFingerprint({ projectId: 'p', runId: 'r', content: '他推门出去。', previousChapters: [], characterNames: [] }).status).toBe('insufficient_evidence');
});
it('anchors repeated paragraph openings and attributed voices to the refinement stage', () => {
  const prefix = '清晨的小镇街道上';
  const text = [1, 2, 3].map(n => prefix + `第${n}家店铺的老板正忙着打开门窗准备迎接客人。`).join('\n')
    + '\n阿明说：“无论发生什么事情我们都必须在天亮之前返回。”'
    + '\n阿青说：“无论发生什么事情我们都必须在天亮之前返回。”';
  const result = styleFingerprint({ projectId: 'p', runId: 'r', stage: 'refinement', content: text,
    previousChapters: [], characterNames: ['阿明', '阿青'] });
  expect(result.issues.map(i => i.ruleId)).toEqual(['style.paragraph_opening', 'style.character_voice']);
  expect(result.issues.every(i => i.stage === 'refinement' && i.evidence.verified)).toBe(true);
});
