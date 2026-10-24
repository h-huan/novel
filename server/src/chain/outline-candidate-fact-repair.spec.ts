import { describe, expect, it } from 'vitest';
import { applyOutlineCandidateFactPatches, OUTLINE_FACT_REPAIR_LIMITS } from './outline-candidate-fact-repair';

const candidates = () => [{ order: 4, title: '收束', targetWords: 2000,
  content: '核对账目。'.repeat(100) + '积攒多年',
  scenes: JSON.stringify({ scenes: [{ content: '积攒多年' }], wordCountReason: '完整收束' }) }];
const patch = (field = 'content', match = '积攒多年', replacement = '此前积攒') =>
  ({ chapterNumber: 5, field, match, replacement });

describe('pending outline fact patches', () => {
  it('supports repeated fact projections beyond eight replacements within the same budget', () => {
    const input = candidates();
    input[0].content += '背景叙述。'.repeat(100) + Array.from({ length: 9 }, (_, i) => `错误投影(${i})`).join('');
    const patches = Array.from({ length: 9 }, (_, i) => patch('content', `错误投影(${i})`, `正确投影(${i})`));
    expect(applyOutlineCandidateFactPatches(input, { patches })[0].content).not.toContain('错误投影');
    expect(() => applyOutlineCandidateFactPatches(input, { patches: Array(OUTLINE_FACT_REPAIR_LIMITS.maxPatches + 1).fill(patch()) })).toThrow('项局部替换');
  });
  it('minimally reconciles the observed group-reply conflict without deleting private-message or signature evidence', () => {
    const content = '安全员翻出工作群报修消息，底下没人回。随后他另行展示助理发来的私聊回复。陈总问工作群报修底下的回复是谁留的，安全员把手机举高，回复就挂在报修底下，头像是沈曼助理。沈曼承认是她让助理在群里回复“今天拍完、明天换”。导演先签安全条款，威亚组、安全员和替身随后签字。';
    const input = [{ order: 2, title: '第3章', targetWords: 3500, content,
      scenes: JSON.stringify({ scenes: [{ outcome: '安全员展示工作群报修消息与另行收到的助理私聊回复。' }], wordCountReason: '按本章事件量安排' }) }];
    const result = applyOutlineCandidateFactPatches(input, { patches: [
      { chapterNumber: 3, field: 'content', match: '底下没人回', replacement: '底下有一条群回复' },
    ] });
    expect(result[0].content).not.toContain('底下没人回');
    expect(result[0].content).toContain('底下有一条群回复');
    expect(result[0].content).toContain('助理发来的私聊回复');
    expect(result[0].content).toContain('沈曼承认是她让助理在群里回复');
    expect(result[0].content).toContain('导演先签安全条款');
    expect(input[0].content).toBe(content);
  });

  it('repairs both projections atomically and preserves other fields and originals', () => {
    const input = candidates();
    const result = applyOutlineCandidateFactPatches(input, { patches: [patch(), patch('scenes')] });
    expect(result[0].content).toContain('此前积攒');
    expect(JSON.parse(result[0].scenes).scenes[0].content).toBe('此前积攒');
    expect(result[0].targetWords).toBe(2000);
    expect(result[0].title).toBe('收束');
    expect(input).toEqual(candidates());
  });
  it.each([
    { ...patch(), chapterNumber: 1 },
    patch('targetWords'),
    patch('content', '不存在'),
    patch('content', '核对账目。'),
    patch('scenes', '"完整收束"', '"随意缩短"'),
    patch('scenes', '"积攒多年"', '{"内容":"此前积攒"}'),
    patch('scenes', '"积攒多年"', '无效JSON'),
    patch('content', '积攒多年', '扩大剧情'.repeat(100)),
  ])('rejects unsafe patches without mutating input: %j', unsafe => {
    const input = candidates();
    expect(() => applyOutlineCandidateFactPatches(input, { patches: [unsafe] })).toThrow();
    expect(input).toEqual(candidates());
  });
  it('rolls back the whole batch when a later patch is invalid', () => {
    const input = candidates();
    expect(() => applyOutlineCandidateFactPatches(input, { patches: [patch(), patch('scenes', '不存在')] })).toThrow();
    expect(input).toEqual(candidates());
  });
});
