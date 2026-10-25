import { describe, expect, it } from 'vitest';
import { ideaReviewEvidenceCatalog,resolveIdeaReviewEvidence,ideaReviewEvidenceReferenceIssues,ideaPayoffBridgeIssues } from './idea-review-evidence';
import { ChainController } from './chain.controller';
import { presentationGateIssues } from './idea-presentation-review';
import { vi } from 'vitest';
import { readerGoalReviewIssues } from './reader-goal-review';
import { ideaReviewResponseExample } from './idea-review-evidence';
import { presentationReviewIssues, targetIdeaReviews } from './idea-presentation-review';
const cards=[{title:'危险订单',hook:'她亲自退回赔款，决定查明停工的原因。',description:'停工让村民没了收入。她借走邻居的车去找负责人。',setting:'负责人下班必须经过唯一的大门。',ending:'她在大门等到了下班的负责人。',scopeBreakdown:[{summary:'负责人拒绝见她，她留在门口等到下班。'}],executionStandard:'非故事执行规则',lockedPremise:{storyCore:'旧胚子事实'}},
 {title:'第二张卡',hook:'其他卡真实原文不能作为第一张卡证据。'}];
describe('server-owned idea evidence references',()=>{
 it('validates the same complete response example included in the production prompt',()=>{
  const example=ideaReviewResponseExample();example.reviews[0].title=cards[0].title;
  expect(ideaPayoffBridgeIssues(example,[cards[0]])).toEqual([]);
  expect(ideaReviewEvidenceReferenceIssues(example,[cards[0]])).toEqual([]);
  expect(presentationReviewIssues(resolveIdeaReviewEvidence(example,[cards[0]]),[cards[0]],true)).toEqual([]);
 });
 it('shows the exact number of independent verdict rows with original titles and bound evidence refs',()=>{
  const batch=[cards[0],{...cards[0],title:'第二个完全不同的真实标题'}];
  const value=ideaReviewResponseExample(batch);
  expect(value.reviews.map(row=>[row.position,row.title])).toEqual([[1,cards[0].title],[2,batch[1].title]]);
  expect(value.reviews[1].storyEvidenceRef).toBe('C2.description');
  expect(value.reviews[1].payoffBridge.conditionEvidenceRef).toBe('C2.setting');
  expect(value.reviews[1].readerGoals.completion.evidenceRef).toBe('C2.description');
  expect(ideaReviewEvidenceReferenceIssues(value,batch)).toEqual([]);
  expect(ideaPayoffBridgeIssues(value,batch)).toEqual([]);
  expect(presentationReviewIssues(resolveIdeaReviewEvidence(value,batch),batch,true)).toEqual([]);
  expect(ideaReviewResponseExample().reviews).toHaveLength(1); // one-card callers unchanged
 });
 it('does not accept a claimed ending as its own causal condition',()=>{
  const valid={position:1,payoffCredible:true,payoffBridge:{status:'supported',actionEvidenceRef:'C1.description',
   resultEvidenceRef:'C1.ending',conditionEvidenceRef:'C1.setting',reason:'负责人下班只有一条通路，等候可以遇见本人'}};
  expect(ideaPayoffBridgeIssues({reviews:[valid]},cards)).toEqual([]);
  for(const ref of ['C1.ending','C2.hook','C1.invented'])
   expect(ideaPayoffBridgeIssues({reviews:[{...valid,payoffBridge:{...valid.payoffBridge,conditionEvidenceRef:ref}}]},cards).length).toBeGreaterThan(0);
  const gap={...valid,payoffCredible:false,payoffBridge:{...valid.payoffBridge,status:'gap',conditionEvidenceRef:undefined,
   reason:'当前故事没有交代行动能让目标结果发生的必要条件'}};
  expect(ideaPayoffBridgeIssues({reviews:[gap]},cards)).toEqual([]);
  expect(ideaPayoffBridgeIssues({reviews:[{...gap,payoffCredible:true}]},cards).join('；')).toContain('缺少必要条件');
  const resolved=resolveIdeaReviewEvidence({reviews:[valid]},cards).reviews[0].payoffBridge;
  expect(resolved.conditionEvidence).toBe(cards[0].setting);
  expect(resolved.resultEvidence).toBe(cards[0].ending);
 });
 it('catalogs actual recursive narrative fields without standards or reference premises',()=>{
  const entries=ideaReviewEvidenceCatalog(cards);
  expect(entries.find(e=>e.id==='C1.scopeBreakdown[0].summary')?.quote).toBe(cards[0].scopeBreakdown?.[0].summary);
  expect(entries.some(e=>e.field.includes('executionStandard')||e.field.includes('lockedPremise'))).toBe(false);
 });
 it('fills exact original text while preserving the semantic status and reason',()=>{
  const row={position:1,title:cards[0].title,platformEvidenceRef:'C1.hook',readerGoals:{completion:{status:'weak',evidenceRef:'C1.scopeBreakdown[0].summary',quote:'模型改写的句子',reason:'当前内容没有足够阶段兑现，读完倾向仍需改善'}}};
  const value={reviews:[row]}, result=resolveIdeaReviewEvidence(value,cards).reviews[0];
  expect(result.platformEvidence).toBe(cards[0].hook);
  expect(result.readerGoals.completion.quote).toBe(cards[0].scopeBreakdown?.[0].summary);
  expect(result.readerGoals.completion.status).toBe('weak');
  expect(result.readerGoals.completion.reason).toBe(row.readerGoals.completion.reason);
  expect(row.readerGoals.completion.quote).toBe('模型改写的句子');
 });
 it.each(['C2.hook','C1.executionStandard','C1.lockedPremise.storyCore','C1.invented','C1.title'])('rejects unrelated or non-story references %s',ref=>{
  const value={reviews:[{position:1,platformEvidenceRef:ref,platformEvidence:cards[0].hook}]};
  expect(ideaReviewEvidenceReferenceIssues(value,cards)).toHaveLength(1);
  expect(resolveIdeaReviewEvidence(value,cards).reviews[0].platformEvidence).toBe('');
 });
 it('rejects an invalid reference even if unknown would otherwise allow an empty quote',()=>{
  const value={reviews:[{position:1,readerGoals:{sharing:{status:'unknown',evidenceRef:'C2.hook',quote:'',reason:'当前卡尚无传播的足够依据，不标为高倾向'}}}]};
  expect(ideaReviewEvidenceReferenceIssues(value,cards)[0]).toContain('readerGoals.sharing.evidenceRef');
 });
 it('keeps historical direct quotations subject to the original exact-evidence check',()=>{
  const goals={completion:{status:'supported',quote:'停工让全村没了收入，借车追查负责人。',reason:'这是改写内容，不能当作原文引用'}};
  const result=resolveIdeaReviewEvidence({reviews:[{position:1,readerGoals:goals}]},cards);
  expect(readerGoalReviewIssues(result.reviews[0].readerGoals,cards[0].description).some(issue=>issue.includes('不能逐字定位'))).toBe(true);
 });
 it('uses the references in the production reviewer without upgrading a weak result',async()=>{
  const c=Object.create(ChainController.prototype) as any;
  const raw={position:1,title:cards[0].title,titleCompelling:true,openingCompelling:true,distinctFromBatch:true,
   storyCoherent:true,payoffCredible:true,platformFit:true,storyEvidenceRef:'C1.description',payoffEvidenceRef:'C1.description',platformEvidenceRef:'C1.hook',
   qualityReason:'按既定行动与必要因果核对，当前场景证据均来自此卡',readerQuestion:'她为何必须自己查清楚停工的原因？',issues:[],
   payoffBridge:{status:'supported',actionEvidenceRef:'C1.description',resultEvidenceRef:'C1.ending',conditionEvidenceRef:'C1.setting',reason:'大门是负责人下班唯一通路，等候可以遇见本人'},
   readerGoals:Object.fromEntries(['click','completion','sharing','immersion'].map(key=>[key,{status:key==='sharing'?'weak':'supported',evidenceRef:'C1.description',reason:'人物主动追查虽可理解，尚缺可讨论的独特取舍'}]))};
  const sharedBudget={remaining:3};let calls=0;
  c.llmCallWithRetry=vi.fn(async(_label:string,prompt:string,options:any)=>{
   expect(prompt).toContain('服务器证据编号目录');
   expect(prompt).toContain(JSON.stringify(ideaReviewResponseExample([cards[0]])));
   expect(options.physicalCallBudget.remaining).toBe(3-calls++);
   expect(options.physicalCallBudget.recoveryWithoutThinking).toBeUndefined();
   options.physicalCallBudget.remaining--;options.physicalCallBudget.recoveryWithoutThinking=true;
   expect(options.validate({reviews:[raw]})).toBe(true);
   const bad={...raw,readerGoals:{...raw.readerGoals,completion:{...raw.readerGoals.completion,evidenceRef:'C2.hook'}}};
   expect(options.validate({reviews:[bad]})).toBe(false);
   expect(options.describeValidation({reviews:[bad]}).join('；')).toContain('第1张题材审查：readerGoals.completion.evidenceRef');
   return {data:{reviews:[raw]}};
  });
  const [review]=await c.reviewIdeaPresentation([cards[0]],[],'',sharedBudget);
  await c.reviewIdeaPresentation([cards[0]],[],'',sharedBudget);
  expect(sharedBudget.remaining).toBe(1);expect(sharedBudget).not.toHaveProperty('recoveryWithoutThinking');
  expect(review.readerGoals.sharing.quote).toBe(cards[0].description);
  expect(review.readerGoals.sharing.status).toBe('weak');
  expect(presentationGateIssues(review).join('；')).toContain('传播倾向');
 });

 it('represents a genuinely unknown goal as absent evidence without inventing text',()=>{
  const value={reviews:[{position:1,readerGoals:{completion:{status:'unknown',reason:'缺少全篇后续材料，无法判定完整阅读的体验'}}}]};
  const result=resolveIdeaReviewEvidence(value,cards).reviews[0];
  expect(result.readerGoals.completion.quote).toBe('');
  expect(result.readerGoals.completion.status).toBe('unknown');
  expect(ideaReviewEvidenceReferenceIssues(value,cards)).toEqual([]);
 });

});

it('restores uniquely nested reader goals without changing weak verdicts or accepting conflicting envelopes',()=>{
 const payload:any=ideaReviewResponseExample(),row=payload.reviews[0];row.title=cards[0].title;
 row.readerGoals.sharing.status='weak';
 row.payoffBridge.readerGoals=row.readerGoals;row.payoffBridge.issues=row.issues;
 delete row.readerGoals;delete row.issues;
 const normalized=targetIdeaReviews(payload,[cards[0]],[]);
 const resolved=resolveIdeaReviewEvidence(normalized,[cards[0]]);
 expect(presentationReviewIssues(resolved,[cards[0]],true)).toEqual([]);
 expect(resolved.reviews[0].readerGoals.sharing.status).toBe('weak');
 expect(presentationGateIssues(resolved.reviews[0]).join('；')).toContain('传播倾向');
 expect(row.readerGoals).toBeUndefined();
 const conflict=structuredClone(payload);conflict.reviews[0].issues=['另一份阻断结论'];
 expect(()=>targetIdeaReviews(conflict,[cards[0]],[])).toThrow('内外的issues冲突');
});
