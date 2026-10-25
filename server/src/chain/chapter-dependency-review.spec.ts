import { expect, it, vi } from 'vitest';
import { reviewChapterDependencies, chapterActionRepairEvidence, planningChapterForCausalReview } from './chapter-dependency-review';
import { causalEvidenceAnchorOptions } from '../modules/writing-quality/causal-review';

const chapter = { content: '提出新的处理方案', foreshadowingRecover: [{ method: '争议已经解除' }] };
const factPass = { consistent: true, contradictions: [], ledger: ['既有事实'] };
const actionGap = () => Object.assign(new Error('行动不足以支持已解决的结果'), {
  gateRejection: true as const, report: { status: 422, topic: 'outline_alignment', sections: ['只有提出方案，没有对方接受或状态改变的证据'] },
});
it('local patch evidence uses precisely the same numbered body as the independent action audit',()=>{
 const raw={chapterFunction:null,content:'进店后她问老板谁放的药，老板一直没有回答。',
  characterActions:[{character:'老板',action:'他没有回应',result:'当场亲口承认药是他放的'}]};
 const normalized=planningChapterForCausalReview(raw,3,'climax');
 const anchors=causalEvidenceAnchorOptions(JSON.stringify([normalized]),{});
 const result=anchors.find(item=>item.path==='0.characterActions.0.result');
 const action=anchors.find(item=>item.path==='0.characterActions.0.action');
 expect(result?.id).toBeTruthy();
 expect(action?.id).toBeTruthy();
 const failure=Object.assign(actionGap(),{planningActionAudit:{transitions:[{
   status:'gap',resultAnchorId:result?.id,actionAnchorId:action?.id,
   resultEvidence:result?.text,actionEvidence:action?.text,reason:'沉默不能作为承认'}]}});
 const correct=chapterActionRepairEvidence(normalized,failure);
 expect(correct.gaps).toEqual([expect.objectContaining({
   actionPath:'characterActions.0.action',resultPath:'characterActions.0.result',
   resultEvidence:result?.text})]);
 // A raw, non-canonical body is NOT guaranteed to share its serialized
 // evidence IDs: the server-inserted chapterFunction can change indexes.
 const wrong=chapterActionRepairEvidence(raw,failure);
 expect(wrong.gaps[0].resultPath).not.toBe('characterActions.0.result');
 expect(raw.chapterFunction).toBeNull();
 expect(normalized.chapterFunction).toBe('climax');
});
it('同一候选的两项独立审核并行启动，仍须全部结束才能返回', async () => {
  let releaseFacts!: () => void, releaseActions!: () => void;
  const started: string[] = [];
  const running = reviewChapterDependencies(chapter, async value => {
    expect(value).toBe(chapter); started.push('facts'); await new Promise<void>(resolve => { releaseFacts = resolve; }); return factPass;
  }, async value => {
    expect(value).toBe(chapter); started.push('actions'); await new Promise<void>(resolve => { releaseActions = resolve; });
  });
  await Promise.resolve(); expect(started).toEqual(['facts', 'actions']);
  let done = false; const outcome = running.then(value => { done = true; return value; });
  releaseFacts(); await Promise.resolve(); expect(done).toBe(false);
  releaseActions(); expect((await outcome).facts).toBe(factPass);
});
it('事实审核失败时等待已启动的行动审核结束，不遗留后台调用或把故障当缺陷修复', async () => {
  const failure = new Error('Connection error'); let release!: () => void, done = false;
  const running = reviewChapterDependencies(chapter, async () => { throw failure; }, async () => {
    await new Promise<void>(resolve => { release = resolve; });
  });
  const outcome = running.catch(error => { done = true; return error; });
  await Promise.resolve(); await Promise.resolve(); expect(done).toBe(false);
  release(); expect(await outcome).toBe(failure);
});
it('从原因果账目定位具体结果字段和全部结果索引，不猜测未知证据位置', () => {
  const candidate = { content: '主角提出调解，被对方明确拒绝。', characterActions: [{ action: '提出调解', result: '纠纷已解除' }],
    characterStates: [{ stateAfter: '双方已经达成协议' }], foreshadowingRecover: [{ method: '纠纷已解除' }] };
  const anchors = causalEvidenceAnchorOptions(JSON.stringify([candidate]), {});
  const failure = Object.assign(actionGap(), { planningActionAudit: { transitions: [
    { status: 'gap', actionAnchorId: anchors.find(a => a.path === '0.characterActions.0.action')!.id,
      resultAnchorId: anchors.find(a => a.path === '0.characterActions.0.result')!.id,
      actionEvidence: '提出调解', resultEvidence: '纠纷已解除', reason: '提出不等于对方接受' },
    { status: 'gap', resultAnchorId: 'body:unknown', resultEvidence: '未知位置', reason: '保持实际缺口' },
    { status: 'supported', reason: '通过项不能列成缺口' },
  ] } });
  const result = chapterActionRepairEvidence(candidate, failure);
  expect(result.gaps).toEqual([expect.objectContaining({ actionPath: 'characterActions.0.action', resultPath: 'characterActions.0.result', reason: '提出不等于对方接受' }),
    expect.objectContaining({ resultPath: null, resultEvidence: '未知位置' })]);
  expect(result.resultFields).toEqual(expect.arrayContaining(['characterActions.0.result', 'characterStates.0.stateAfter', 'foreshadowingRecover.0.method']));
  expect(candidate.characterActions[0].result).toBe('纠纷已解除');
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
