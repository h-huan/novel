import { describe, expect, it, vi } from 'vitest';
import { buildCanonPolicyDirective } from '../modules/canon/canon-policy';
import { canonicalBriefForAudit, storyHierarchyForAudit, applyCrossStageFieldPatch, describeCrossStagePatchValidation } from './cross-stage-patch';
import { presentationReviewIssues, presentationGateIssues, targetIdeaReviews } from './idea-presentation-review';
import { applyOrderedIdeaRepairPatches } from './idea-discovery-contract';
import { ChainController } from './chain.controller';

const bundle = { worldProfiles: [{id:'frozen', hierarchy_rules:'冻结规则'}], chapters: Array.from({length:5},(_,i)=>({id:'chapter'+i,content:'伏笔设置：第三章回收。'})), foreshadowings:[{id:'clue',planned_recovery_chapter_index:3}] };
const patch = {entityType:'foreshadowing',entityId:'clue',field:'planned_recovery_chapter_index',match:'3',replacement:'5'};
const cards = [{title:'铁印打在军刀上',hook:'我接到一批菜刀订单，却发现铁料会折断边军的刀。'}];
const verdict = {position:1,title:cards[0].title,titleCompelling:false,openingCompelling:true,distinctFromBatch:true,
 storyCoherent:true,payoffCredible:true,platformFit:true,storyEvidence:cards[0].hook,payoffEvidence:cards[0].hook,platformEvidence:cards[0].hook,
 readerGoals:Object.fromEntries(['click','completion','sharing','immersion'].map(key=>[key,{status:'supported',quote:cards[0].hook,reason:'此处既定人物选择带来可理解的风险与追问'}])),
 qualityReason:'根据实际卡片的已有行动和因果判定，不补充小说事实。',readerQuestion:'谁在故意让边军的刀折断？',issues:['标题只有道具意象，未展示人的风险。']};

describe('creation failure regressions',()=>{
 it('preserves the original coordinate failure after retry and salvage reject another shape',async()=>{
  const controller=Object.create(ChainController.prototype) as any;
  controller.logger={warn:vi.fn(),error:vi.fn()};
  controller.realLLM={generate:vi.fn().mockResolvedValueOnce({content:JSON.stringify({patches:[{...patch,replacement:'0'}]})})
   .mockResolvedValueOnce({content:JSON.stringify({patches:[{...patch,entityType:'foreshadowings',replacement:'0'}]})})};
  const result=await controller.llmCallWithRetry('一致性修订','原始修订任务',{
   validate:(value:any)=>describeCrossStagePatchValidation(value,bundle).length===0,
   describeValidation:(value:any)=>describeCrossStagePatchValidation(value,bundle),
  });
  expect(result.data).toBeNull();
  expect(result.warnings.join('；')).toContain('第一章=1');
  expect(result.warnings.join('；')).toContain('真实字段名');
 });
 it('keeps patch correction on the complete repair task and explains rejected zero-based chapter coordinates',async()=>{
  const controller=Object.create(ChainController.prototype) as any;
  controller.logger={warn:vi.fn(),error:vi.fn()};
  const wrong={patches:[{...patch,match:'3',replacement:'0'}]};
  const fixed={patches:[patch]};
  controller.realLLM={generate:vi.fn().mockResolvedValueOnce({content:JSON.stringify(wrong)})
   .mockImplementationOnce(async(options:any)=>{
    expect(options.prompt).toContain('第一章=1');
    expect(options.prompt).toContain('逐项保留真实故事问题');
    expect(options.prompt).not.toContain('同步更新所有引用同一事件的content');
    return {content:JSON.stringify(fixed)};
   })};
  const result=await controller.llmCallWithRetry('一致性修订','修复关系和转学两个故事问题',{
   validate:(value:any)=>describeCrossStagePatchValidation(value,bundle).length===0,
   describeValidation:(value:any)=>describeCrossStagePatchValidation(value,bundle),
   retryInstruction:'逐项保留真实故事问题，返回完整patches。',
  });
  expect(result.data).toEqual(fixed);expect(controller.realLLM.generate).toHaveBeenCalledTimes(2);
 });
 it('deduplicates only identical confirmed story copies without losing unique facts',()=>{
  const story={title:'铁印打在军刀上',protagonist:'赵石',coreConflict:'妹妹在守将府受威胁'};
  const result=JSON.parse(canonicalBriefForAudit(JSON.stringify({confirmedStory:story,projectCard:{confirmedStory:story,pov:'第三人称限知'}})));
  expect(result.confirmedStory).toEqual(story);expect(result.projectCard).toEqual({pov:'第三人称限知'});
  const different={confirmedStory:story,projectCard:{confirmedStory:{...story,extra:'独有事实'}}};
  expect(JSON.parse(canonicalBriefForAudit(JSON.stringify(different)))).toEqual(different);
 });
 it('excludes exact application policy while preserving actual fictional hierarchy',()=>{
  const original='边军不得越级调兵。\n'+buildCanonPolicyDirective();
  expect(storyHierarchyForAudit(original,buildCanonPolicyDirective())).toBe('边军不得越级调兵。');
  expect(storyHierarchyForAudit('唯一 Canon是这个世界的古老铭文',buildCanonPolicyDirective())).toContain('古老铭文');
  expect(original).toContain(buildCanonPolicyDirective());
 });
 it('repairs integer recovery chapter without stringifying stored numbers',()=>{
  expect(describeCrossStagePatchValidation({patches:[patch]},bundle)).toEqual([]);
  expect(applyCrossStageFieldPatch(3,'3','5')).toBe(5);
  for(const replacement of ['0','6','5.5','05']) expect(describeCrossStagePatchValidation({patches:[{...patch,replacement}]},bundle).length).toBeGreaterThan(0);
 });
 it('rejects invented content labels and immutable world repair before candidate review',()=>{
  expect(describeCrossStagePatchValidation({patches:[{...patch,entityType:'chapter',entityId:'chapter0',field:'伏笔设置'}]},bundle).length).toBeGreaterThan(0);
  expect(describeCrossStagePatchValidation({patches:[{...patch,entityType:'worldProfile',entityId:'frozen',field:'hierarchy_rules'}]},bundle).length).toBeGreaterThan(0);
 });
 it('requires actual titles, complete independent verdicts and concrete failure evidence',()=>{
  expect(presentationReviewIssues({reviews:[verdict]},cards)).toEqual([]);
  expect(presentationGateIssues(verdict).join('；')).toContain('点击承诺');
  expect(presentationReviewIssues({reviews:[{...verdict,title:'偷换后的标题'}]},cards).length).toBeGreaterThan(0);
  expect(presentationReviewIssues({reviews:[{...verdict,issues:[]}]},cards).length).toBeGreaterThan(0);
  expect(presentationGateIssues(undefined)).toHaveLength(1);
  expect(presentationReviewIssues({ reviews: [{ ...verdict, payoffEvidence: '捏造的结局' }] }, cards).length).toBeGreaterThan(0);
  expect(presentationReviewIssues({ reviews: [{ ...verdict, storyCoherent: undefined }] }, cards).length).toBeGreaterThan(0);
  expect(presentationGateIssues({ ...verdict, payoffCredible: false }).join('；')).toContain('可信兑现');
 });
 it('allows title correction only for gate-authorized positions and preserves premise identity',()=>{
  const card={title:'铁印打在军刀上',sourcePremiseId:'P1',hook:'原来的故事钩子'};
  const patch={title:'这批菜刀，明天要杀我妹妹',sourcePremiseId:'P2'};
  expect(applyOrderedIdeaRepairPatches([card],[patch])[0].title).toBe(card.title);
  const repaired=applyOrderedIdeaRepairPatches([card],[patch],[0])[0];
  expect(repaired.title).toBe(patch.title);expect(repaired.sourcePremiseId).toBe('P1');expect(repaired.hook).toBe(card.hook);
 });
 it('actually invokes semantic review and validates its binding to submitted cards',async()=>{
  const controller=Object.create(ChainController.prototype) as any;
  controller.llmCallWithRetry=vi.fn(async(_name:any,prompt:any,options:any)=>{
   expect(prompt).toContain(cards[0].title);
   expect(options.validate({reviews:[verdict]})).toBe(true);
   expect(options.validate({reviews:[]})).toBe(false);
   expect(options.scenario).toBe('idea_generate');
   expect(options.stepKey).toBe('idea_presentation_review');
   return {data:{reviews:[verdict]}};
  });
  expect(await controller.reviewIdeaPresentation(cards)).toEqual([verdict]);
  expect(controller.llmCallWithRetry).toHaveBeenCalledOnce();
 });
 it('pinpoints platform-rule quotations and keeps review failure separate from story failure',async()=>{
  const wrong={...verdict,platformEvidence:'分类：男频脑洞 —— 必须执行：事件类型、场景与冲突必须落在「男频脑洞」范围内'};
  const issues=presentationReviewIssues({reviews:[wrong]},cards);
  expect(issues).toHaveLength(1);
  expect(issues[0]).toContain('第1张题材审查：platformEvidence');
  expect(issues[0]).toContain('不得引用executionStandard');
  const controller=Object.create(ChainController.prototype) as any;
  controller.generationMetrics={beginRun:vi.fn(()=>({id:'review-failed'})),finishRun:vi.fn(),record:vi.fn()};
  controller.llmCallWithRetry=vi.fn(async(_name:any,prompt:any,options:any)=>{
   expect(prompt).toContain('platformEvidence引用体现平台机制的故事事件');
   expect(options.retryInstruction).toContain('不改故事');
   return {data:null,validationIssues:issues,warnings:[]};
  });
  await expect(controller.reviewIdeaPresentation(cards)).rejects.toThrow('审查协议错误，不代表故事不合格');
  expect(controller.generationMetrics.finishRun).toHaveBeenCalledWith('review-failed','failed',expect.any(Number),undefined,expect.stringContaining('platformEvidence'));
 });
 it('rejects contradictory all-pass blocking reasons while keeping explicit suggestions nonblocking',()=>{
  const pass={...verdict,titleCompelling:true,issues:[],warnings:['正文可以进一步澄清电话时点。']};
  expect(presentationReviewIssues({reviews:[pass]},cards)).toEqual([]);
  expect(presentationGateIssues(pass)).toEqual([]);
  expect(presentationReviewIssues({reviews:[{...pass,issues:['建议明确同一时点生死互斥。']}]},cards).join('；')).toContain('结论互斥');
  const actualConflict={...pass,storyCoherent:false,issues:['同一时点的生死明确互斥。']};
  expect(presentationReviewIssues({reviews:[actualConflict]},cards)).toEqual([]);
  expect(presentationGateIssues(actualConflict).length).toBeGreaterThan(0);
 });
 it('ignores only known reference verdicts without accepting unknown or duplicate target rows',()=>{
  const reference={title:'已通过参考卡'};
  const payload={reviews:[verdict,{...verdict,title:reference.title,position:2}]};
  expect(targetIdeaReviews(payload,cards,[reference]).reviews).toEqual([verdict]);
  expect(presentationReviewIssues(targetIdeaReviews(payload,cards,[]),cards).length).toBeGreaterThan(0);
  expect(presentationReviewIssues(targetIdeaReviews({reviews:[verdict,verdict]},cards,[reference]),cards).length).toBeGreaterThan(0);
 });
});
