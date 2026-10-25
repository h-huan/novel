import {describe,it,expect,vi} from 'vitest';
import {ideaReaderGoalRepairPlan,applyIdeaReaderGoalRepair,ideaMissingPresentationRowsPlan,applyIdeaMissingPresentationRows} from './idea-review-protocol-repair';
import {ideaReviewResponseExample,ideaPayoffBridgeIssues} from './idea-review-evidence';
import {presentationReviewIssues} from './idea-presentation-review';
import {ChainController} from './chain.controller';
const card={title:'当面退回委托',hook:'她把错误订单退回，拒绝替别人签字。',description:'她到唯一出口等负责人下班。',setting:'负责人下班只能从此门经过。',ending:'她在门口等到负责人。'};
const fixture=()=>{
 const row=ideaReviewResponseExample().reviews[0];row.title=card.title;
 const value:any={reviews:[row]};value.reviews[0].readerGoals.immersion={supported:'',evidenceRef:'C1.description',reason:'她主动拒绝错误委托的选择与处境都有具体依据'};
 return value;
};
describe('one targeted reader-goal protocol correction',()=>{
 it('returns only the invalid field while keeping all negative findings and causal gaps',()=>{
  const base=fixture();base.reviews[0].payoffCredible=false;base.reviews[0].payoffBridge={status:'gap',actionEvidenceRef:'C1.description',resultEvidenceRef:'C1.ending',reason:'原故事没有建立使结果必然成立的必要条件'};
  base.reviews[0].issues=['必要兑现条件仍有实际缺口'];
  const plan=ideaReaderGoalRepairPlan(base,[card])!;
  expect(plan.targets.map(t=>t.key)).toEqual(['immersion']);
  const patch={goalPatches:[{position:1,key:'immersion',item:{status:'supported',evidenceRef:'C1.description',reason:base.reviews[0].readerGoals.immersion.reason}}]};
  const fixed=applyIdeaReaderGoalRepair(plan,patch);
  expect(fixed.reviews[0].payoffCredible).toBe(false);expect(fixed.reviews[0].payoffBridge.status).toBe('gap');
  expect(fixed.reviews[0].issues).toEqual(base.reviews[0].issues);expect(ideaPayoffBridgeIssues(fixed,[card])).toEqual([]);
  expect(()=>applyIdeaReaderGoalRepair(plan,{reviews:[]})).toThrow();
  expect(()=>applyIdeaReaderGoalRepair(plan,{goalPatches:[{...patch.goalPatches[0],key:'click'}]})).toThrow();
  expect(base.reviews[0].readerGoals.immersion.status).toBeUndefined();
 });
 it('rejects attempts to upgrade an existing weak status or change its valid reason',()=>{
  const base=fixture();base.reviews[0].readerGoals.immersion={status:'weak',evidenceRef:'C2.hook',reason:'当前人物处境缺少有作用的选择与真实代价'};
  const plan=ideaReaderGoalRepairPlan(base,[card])!;
  expect(()=>applyIdeaReaderGoalRepair(plan,{goalPatches:[{position:1,key:'immersion',item:{status:'supported',evidenceRef:'C1.hook',reason:base.reviews[0].readerGoals.immersion.reason}}]})).toThrow('不能改变');
 });
 it('uses the existing second physical call for a compact patch and fully validates the merged report',async()=>{
  const c=Object.create(ChainController.prototype) as any,base=fixture();
  c.logger={warn:vi.fn(),error:vi.fn()};const requests:any[]=[];
  c.realLLM={generate:vi.fn(async(request:any)=>{requests.push(request);request.physicalCallBudget.remaining--;
   return {content:JSON.stringify(requests.length===1?base:{goalPatches:[{position:1,key:'immersion',item:{status:'supported',evidenceRef:'C1.description',reason:base.reviews[0].readerGoals.immersion.reason}}]})};})};
  const budget={remaining:3};const result=await c.reviewIdeaPresentation([card],[],'',budget);
  expect(result[0].readerGoals.immersion.status).toBe('supported');expect(budget.remaining).toBe(1);
  expect(requests).toHaveLength(2);expect(requests[1].prompt).toContain('goalPatches');
  expect(requests[1].prompt).not.toContain('standardLines');
  expect(requests[1].prompt.length).toBeLessThan(requests[0].prompt.length);
 });
 it('does not route unrelated payoff or verdict protocol failures into the goal-only repair',()=>{
  const value=fixture();delete value.reviews[0].payoffBridge;
  expect(ideaReaderGoalRepairPlan(value,[card])).toBeNull();
 });
});


it('reports review-count contract failures with actual missing positions rather than a generic error',()=>{
 const cards=[{title:'卡片A'},{title:'卡片B'},{title:'卡片C'}];
 const issues=presentationReviewIssues({reviews:[{position:1,title:'卡片A'}]},cards);
 expect(issues).toHaveLength(1);
 expect(issues[0]).toContain('要求3项，实际1项，缺失位置=[2,3]');
});

describe('observed 4-card presentation report omitted rows',()=>{
 const cards=Array.from({length:4},(_,index)=>({...card,title:'独立题材'+(index+1)}));
 const verdict=(position:number)=>{
  const row=structuredClone(ideaReviewResponseExample().reviews[0]);
  row.position=position;row.title=cards[position-1].title;
  return JSON.parse(JSON.stringify(row).replace(/C1\./g,'C'+position+'.'));
 };
 it('completes only truly missing rows using the original second call, preserving valid negative judgments',async()=>{
  const first=[verdict(1),verdict(2),verdict(3)];
  first[1].payoffCredible=false;first[1].payoffBridge.status='gap';
  delete first[1].payoffBridge.conditionEvidenceRef;
  first[1].issues=['已审证据证明兑现缺少必要条件'];
  const plan=ideaMissingPresentationRowsPlan({reviews:first},cards);
  expect(plan?.missing).toEqual([4]);
  const merged=applyIdeaMissingPresentationRows(plan!,{reviews:[verdict(4)]},cards);
  expect(merged.reviews).toHaveLength(4);
  expect(merged.reviews[1]).toEqual(first[1]);
  expect(merged.reviews[1].payoffCredible).toBe(false);
  expect(()=>applyIdeaMissingPresentationRows(plan!,{reviews:[verdict(3)]},cards)).toThrow();
  expect(()=>applyIdeaMissingPresentationRows(plan!,{reviews:[]},cards)).toThrow();
 });
 it('does not accept incomplete, duplicated or invalid initial evidence as already reviewed',()=>{
  const rows=[verdict(1),verdict(2),verdict(3)];
  expect(ideaMissingPresentationRowsPlan({reviews:[]},cards)).toBeNull();
  expect(ideaMissingPresentationRowsPlan({reviews:[rows[0],rows[0]]},cards)).toBeNull();
  const invalid=structuredClone(rows);invalid[1].payoffBridge.status='gap';
  const gapPlan=ideaMissingPresentationRowsPlan({reviews:invalid},cards);
  expect(gapPlan?.missing).toEqual([2,4]);
  expect(gapPlan?.base.reviews.map((r:any)=>r.position)).toEqual([1,3]);
  const wrong=structuredClone(rows);wrong[2].readerGoals.click.evidenceRef='C1.hook';
  expect(ideaMissingPresentationRowsPlan({reviews:wrong},cards)?.missing).toEqual([3,4]);
 });
 it('rechecks only invalid and missing verdicts while retaining independent valid negatives',async()=>{
  const c=Object.create(ChainController.prototype) as any;
  c.logger={warn:vi.fn(),error:vi.fn()};
  const first=[verdict(1),verdict(2),verdict(3)];
  first[0].titleCompelling=false;first[0].issues=['标题只有抽象意象，没有实际利益冲突'];
  first[1].readerGoals.click.evidenceRef='C3.hook'; // invalid cross-card reference
  const requests:any[]=[];
  c.realLLM={generate:vi.fn(async(request:any)=>{
    requests.push(request);
    request.physicalCallBudget.remaining--;
    return {content:JSON.stringify(requests.length===1
      ?{reviews:first}:{reviews:[verdict(2),verdict(4)]})};
  })};
  const result=await c.reviewIdeaPresentation(cards,[],'',{remaining:2});
  expect(result).toHaveLength(4);
  expect(result[0]).toMatchObject({position:1,titleCompelling:false,issues:first[0].issues});
  expect(result[1].position).toBe(2);
  expect(requests).toHaveLength(2);
  expect(requests[1].prompt).toContain('只返回position=[2,4]');
  expect(requests[1].prompt).toContain('reviews必须恰好2项');
 });
 it('does not reuse ambiguous duplicated verdicts as approval',()=>{
  const duplicated=[verdict(1),verdict(2),verdict(2)];
  const plan=ideaMissingPresentationRowsPlan({reviews:duplicated},cards);
  expect(plan?.missing).toEqual([2,3,4]);
  expect(plan?.base.reviews.map((row:any)=>row.position)).toEqual([1]);
 });
 it('runs production review with one original call and one missing-row-only correction',async()=>{
  const c=Object.create(ChainController.prototype) as any;
  c.logger={warn:vi.fn(),error:vi.fn()};
  const requests:any[]=[];
  c.realLLM={generate:vi.fn(async(request:any)=>{
   requests.push(request);request.physicalCallBudget.remaining--;
   return {content:JSON.stringify(requests.length===1
    ?{reviews:[verdict(1),verdict(2),verdict(3)]}:{reviews:[verdict(4)]})};
  })};
  const result=await c.reviewIdeaPresentation(cards,[],'',{remaining:2});
  expect(result).toHaveLength(4);
  expect(result.map((row:any)=>row.position)).toEqual([1,2,3,4]);
  expect(requests).toHaveLength(2);
  expect(requests[1].prompt).toContain('只返回position=[4]');
  expect(requests[1].prompt).not.toContain('reviews必须恰好4项');
  expect(requests[1].prompt).toContain('reviews必须恰好1项');
  expect(requests[1].prompt).toContain('其余已审卡只作同批差异参照');
  expect(requests[1].prompt).toContain('完整执行标准');
  expect(requests[1].prompt).toContain('题材');
 });
});
