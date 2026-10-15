import { expect, it, vi } from 'vitest';
import { reviewChapterDependencies } from './chapter-dependency-review';

const chapter = { content: '提出新的处理方案', foreshadowingRecover: [{ method: '争议已经解除' }] };
const factPass = { consistent: true, contradictions: [], ledger: ['既有事实'] };
const actionGap = () => Object.assign(new Error('行动不足以支持已解决的结果'), {
  gateRejection: true as const, report: { status: 422, topic: 'outline_alignment', sections: ['只有提出方案，没有对方接受或状态改变的证据'] },
});
it('事实通过不能盖过行动缺口：完整拒绝作为同一章局部修复依据', async () => {
  const facts = vi.fn().mockResolvedValue(factPass);
  const actions = vi.fn().mockRejectedValue(actionGap());
  const result = await reviewChapterDependencies(chapter, facts, actions);
  expect(result.facts).toBe(factPass);
  expect(result.defects).toEqual(['只有提出方案，没有对方接受或状态改变的证据']);
  expect(result.actionFailure?.report.status).toBe(422);
  expect(chapter.foreshadowingRecover[0].method).toBe('争议已经解除');
});
it('已修候选仍独立核查两道门，不能沿用修复前通过凭证', async () => {
  const facts = vi.fn().mockResolvedValueOnce(factPass).mockResolvedValueOnce({ consistent: false, contradictions: ['补丁改坏既有事实'], ledger: [] });
  const actions = vi.fn().mockRejectedValueOnce(actionGap()).mockResolvedValueOnce(undefined);
  await reviewChapterDependencies(chapter, facts, actions);
  const result = await reviewChapterDependencies({ ...chapter, content: '方案已被接受' }, facts, actions);
  expect(result.facts.consistent).toBe(false);
  expect(result.actionFailure).toBeNull();
  expect(result.defects).toEqual(['补丁改坏既有事实']);
  expect(facts).toHaveBeenCalledTimes(2);
  expect(actions).toHaveBeenCalledTimes(2);
});
it.each([new Error('Connection error'), Object.assign(actionGap(), { report: { status: 503, topic: 'outline_alignment', sections: ['审查未完成'] } })])('传输/未评估错误直接停止，不作为小说缺陷送去改写', async error => {
  await expect(reviewChapterDependencies(chapter, async () => factPass, async () => { throw error; })).rejects.toBe(error);
});
