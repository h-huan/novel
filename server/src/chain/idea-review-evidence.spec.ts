import { describe, expect, it } from 'vitest';
import { ideaReviewEvidenceCatalog,resolveIdeaReviewEvidence,ideaReviewEvidenceReferenceIssues } from './idea-review-evidence';
import { ChainController } from './chain.controller';
import { presentationGateIssues } from './idea-presentation-review';
import { vi } from 'vitest';
import { readerGoalReviewIssues } from './reader-goal-review';
const cards=[{title:'危险订单',hook:'她亲自退回赔款，决定查明停工的原因。',description:'停工让村民没了收入。她借走邻居的车去找负责人。',scopeBreakdown:[{summary:'负责人拒绝见她，她留在门口等到下班。'}],executionStandard:'非故事执行规则',lockedPremise:{storyCore:'旧胚子事实'}},
 {title:'第二张卡',hook:'其他卡真实原文不能作为第一张卡证据。'}];
describe('server-owned idea evidence references',()=>{
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
   readerGoals:Object.fromEntries(['click','completion','sharing','immersion'].map(key=>[key,{status:key==='sharing'?'weak':'supported',evidenceRef:'C1.description',reason:'人物主动追查虽可理解，尚缺可讨论的独特取舍'}]))};
  c.llmCallWithRetry=vi.fn(async(_label:string,prompt:string,options:any)=>{
   expect(prompt).toContain('服务器证据编号目录');
   expect(options.validate({reviews:[raw]})).toBe(true);
   const bad={...raw,readerGoals:{...raw.readerGoals,completion:{...raw.readerGoals.completion,evidenceRef:'C2.hook'}}};
   expect(options.validate({reviews:[bad]})).toBe(false);
   expect(options.describeValidation({reviews:[bad]}).join('；')).toContain('第1张题材审查：readerGoals.completion.evidenceRef');
   return {data:{reviews:[raw]}};
  });
  const [review]=await c.reviewIdeaPresentation([cards[0]]);
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
