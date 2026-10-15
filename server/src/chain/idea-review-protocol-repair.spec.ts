import {describe,it,expect,vi} from 'vitest';
import {ideaReaderGoalRepairPlan,applyIdeaReaderGoalRepair} from './idea-review-protocol-repair';
import {ideaReviewResponseExample,ideaPayoffBridgeIssues} from './idea-review-evidence';
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
