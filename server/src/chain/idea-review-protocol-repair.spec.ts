import {describe,it,expect,vi} from 'vitest';
import {ideaReaderGoalRepairPlan,applyIdeaReaderGoalRepair,ideaMissingPresentationRowsPlan,applyIdeaMissingPresentationRows} from './idea-review-protocol-repair';
import {ideaReviewResponseExample,ideaPayoffBridgeIssues,ideaReviewEvidenceReferenceIssues,resolveIdeaReviewEvidence} from './idea-review-evidence';
import {presentationReviewIssues,shouldBatchIdeaPresentation} from './idea-presentation-review';
import {ChainController} from './chain.controller';
const card={title:'当面退回委托',hook:'她把错误订单退回，拒绝替别人签字。',description:'她到唯一出口等负责人下班。',setting:'负责人下班只能从此门经过。',ending:'她在门口等到负责人。'};
const fixture=()=>{
 const row=ideaReviewResponseExample().reviews[0];row.title=card.title;
 const value:any={reviews:[row]};value.reviews[0].readerGoals.immersion={supported:'',evidenceRef:'C1.description',reason:'她主动拒绝错误委托的选择与处境都有具体依据'};
 return value;
};
describe('five-card reader sharing citation regression (observed positions 1, 3, 5)',()=>{
 const fiveCards=Array.from({length:5},(_,i)=>({...card,title:'第'+(i+1)+'张不同题材',
  uniquePoint:'宣称有独特传播价值的主张，不能当故事证据'}));
 const response=()=>{
  const value:any=ideaReviewResponseExample(fiveCards);
  for(const p of [1,3,5]){
   value.reviews[p-1].readerGoals.sharing={
    status:'weak',reason:'故事事件虽可转述，但还缺值得读者主动讨论的真实关系取舍',
    evidenceRef:'C'+p+'.uniquePoint',
   };
  }
  return value;
 };
 it('repairs only three invalid evidence refs and retains all verdicts, including weak sharing',()=>{
  const original=response();
  const plan=ideaReaderGoalRepairPlan(original,fiveCards)!;
  expect(plan.targets.map(t=>[t.position,t.key])).toEqual([[1,'sharing'],[3,'sharing'],[5,'sharing']]);
  expect(plan.prompt).toContain('只补正evidenceRef');
  expect(plan.prompt).toContain('不能引用uniquePoint');
  const fixes={goalPatches:[1,3,5].map(position=>({position,key:'sharing',item:{evidenceRef:'C'+position+'.description'}}))};
  const repaired=applyIdeaReaderGoalRepair(plan,fixes);
  expect(ideaReviewEvidenceReferenceIssues(repaired,fiveCards)).toEqual([]);
  expect(presentationReviewIssues(resolveIdeaReviewEvidence(repaired,fiveCards),fiveCards,true)).toEqual([]);
  for(const position of [1,3,5]){
   expect(repaired.reviews[position-1].readerGoals.sharing.status).toBe('weak');
   expect(repaired.reviews[position-1].readerGoals.sharing.reason).toBe(original.reviews[position-1].readerGoals.sharing.reason);
  }
  const forged=applyIdeaReaderGoalRepair(plan,{goalPatches:[1,3,5].map(position=>({
   position,key:'sharing',item:{evidenceRef:'C'+position+'.uniquePoint'}}))});
  expect(ideaReviewEvidenceReferenceIssues(forged,fiveCards)).toHaveLength(3);
  expect(()=>applyIdeaReaderGoalRepair(plan,{goalPatches:[1,3,5].map(position=>({
   position,key:'sharing',item:{evidenceRef:'C'+position+'.description',status:'supported'}}))})).toThrow('不能改变');
 });
 it('uses just the existing one protocol correction call and does not turn weak goals into pass',async()=>{
  const c=Object.create(ChainController.prototype) as any;
  c.logger={warn:vi.fn(),error:vi.fn()};
  const requestCalls:any[]=[];
  c.realLLM={generate:vi.fn(async(request:any)=>{
   requestCalls.push(request);request.physicalCallBudget.remaining--;
   return {content:JSON.stringify(requestCalls.length===1?response():{
    goalPatches:[1,3,5].map(position=>({position,key:'sharing',item:{evidenceRef:'C'+position+'.description'}})),
   })};
  })};
  const result=await c.reviewIdeaPresentation(fiveCards,[],'',{remaining:2});
  expect(requestCalls).toHaveLength(2);
  expect(requestCalls[1].prompt).toContain('goalPatches');
  expect(result).toHaveLength(5);
  expect(result.filter((row:any)=>row.readerGoals.sharing.status==='weak')).toHaveLength(3);
 });
});
describe('mixed validity reader-goal targeted repair contracts',()=>{
 it('asks for a real status when it was absent, while citation-only targets cannot change good judgments',()=>{
  const cards=[{...card,title:'A题材'}, {...card,title:'B题材'}];
  const review:any=ideaReviewResponseExample(cards);
  delete review.reviews[0].readerGoals.click.status;
  review.reviews[0].readerGoals.click.reason='具体事件中读者利益与主角主动反击有足够证据可核实';
  review.reviews[1].readerGoals.sharing.evidenceRef='C2.uniquePoint';
  review.reviews[1].readerGoals.sharing.status='weak';
  review.reviews[1].readerGoals.sharing.reason='当前剧情缺少读者愿意转述的关系冲突和事件';
  const plan=ideaReaderGoalRepairPlan(review,cards)!;
  expect(plan.targets.map(row=>[row.position,row.key])).toEqual([[1,'click'],[2,'sharing']]);
  const example=JSON.parse(plan.prompt.split('【本次各位置的确切补正JSON形状（按实际字段缺失情况分别生成）】')[1].split('\n上方status')[0]);
  expect(example.goalPatches[0].item).toHaveProperty('status');
  expect(example.goalPatches[0].item).toHaveProperty('reason');
  expect(example.goalPatches[1].item).not.toHaveProperty('status');
  expect(example.goalPatches[1].item).not.toHaveProperty('reason');
  const patch={goalPatches:[
   {position:1,key:'click',item:{status:'weak',evidenceRef:'C1.hook',reason:'具体事件中读者利益与主角主动反击有足够证据可核实'}},
   {position:2,key:'sharing',item:{evidenceRef:'C2.description'}},
  ]};
  const merged=applyIdeaReaderGoalRepair(plan,patch);
  expect(merged.reviews[0].readerGoals.click.status).toBe('weak');
  expect(merged.reviews[1].readerGoals.sharing.status).toBe('weak');
  expect(merged.reviews[1].readerGoals.sharing.reason).toBe(review.reviews[1].readerGoals.sharing.reason);
  expect(ideaReviewEvidenceReferenceIssues(merged,cards)).toEqual([]);
  expect(presentationReviewIssues(resolveIdeaReviewEvidence(merged,cards),cards,true)).toEqual([]);
  expect(()=>applyIdeaReaderGoalRepair(plan,{goalPatches:[
   {position:1,key:'click',item:{evidenceRef:'C1.hook'}},
   {position:2,key:'sharing',item:{evidenceRef:'C2.description'}},
  ]})).toThrow('缺失的阅读目标状态未补齐');
 });
 it('repairs invalid unknown evidence without changing unknown verdict or fabricating a source',()=>{
  const row:any=ideaReviewResponseExample([card]);
  row.reviews[0].readerGoals.immersion={status:'unknown',evidenceRef:'C1.noveltyProof',quote:'模型自行编造的证明',reason:'原故事没有足够证据证明真实代入程度'};
  const plan=ideaReaderGoalRepairPlan(row,[card])!;
  expect(plan.targets.map(t=>t.key)).toEqual(['immersion']);
  expect(plan.prompt).toContain('unknown且无本卡支持事件时省略evidenceRef');
  const updated=applyIdeaReaderGoalRepair(plan,{goalPatches:[{position:1,key:'immersion',item:{}}]});
  expect(updated.reviews[0].readerGoals.immersion).toEqual({
   status:'unknown',quote:'',reason:row.reviews[0].readerGoals.immersion.reason});
  expect(ideaReviewEvidenceReferenceIssues(updated,[card])).toEqual([]);
  expect(presentationReviewIssues(resolveIdeaReviewEvidence(updated,[card]),[card],true)).toEqual([]);
 });
 it('consumes only the existing single bounded protocol repair on a missing status',async()=>{
  const c=Object.create(ChainController.prototype) as any;
  c.logger={warn:vi.fn(),error:vi.fn()};
  const initial:any=ideaReviewResponseExample([card]);
  delete initial.reviews[0].readerGoals.sharing.status;
  const calls:any[]=[];
  c.realLLM={generate:vi.fn(async(request:any)=>{
   calls.push(request);request.physicalCallBudget.remaining--;
   if(calls.length===2){
    expect(request.prompt).toContain('【本次各位置的确切补正JSON形状');
    return {content:JSON.stringify({goalPatches:[{position:1,key:'sharing',item:{
      status:'weak',reason:initial.reviews[0].readerGoals.sharing.reason,evidenceRef:'C1.description'}}]})};
   }
   return {content:JSON.stringify(initial)};
  })};
  const result=await c.reviewIdeaPresentation([card],[],'',{remaining:2});
  expect(calls).toHaveLength(2);
  expect(result[0].readerGoals.sharing.status).toBe('weak');
  expect(result[0].readerGoals.sharing.reason).toBe(initial.reviews[0].readerGoals.sharing.reason);
 });
});
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
  expect(requests[0].prompt).toContain(JSON.stringify(ideaReviewResponseExample(cards)));
  expect(requests[1].prompt).toContain('只返回position=[4]');
  expect(requests[1].prompt).not.toContain('reviews必须恰好4项');
  expect(requests[1].prompt).toContain('reviews必须恰好1项');
  expect(requests[1].prompt).toContain('其余已审卡只作同批差异参照');
  expect(requests[1].prompt).toContain('完整执行标准');
  expect(requests[1].prompt).toContain('题材');
 });
});


describe('five-card bounded semantic review preserves independent gates and full batch comparisons',()=>{
 it('uses the already-bounded scheduler without re-reviewing a card or dropping any peer reference',async()=>{
  const cards=Array.from({length:5},(_,index)=>({...card,
    title:'第'+(index+1)+'个独立题材',
    uniquePoint:'由人物的选择和代价而非名称形成的区别'}));
  const prompts:any[]=[];
  const c=Object.create(ChainController.prototype) as any;
  c.logger={warn:vi.fn(),error:vi.fn()};
  c.realLLM={generate:vi.fn(async(request:any)=>{
   const section=request.prompt.split('【实际题材卡与已通过参考卡】')[1]?.split('\n若存在standardLines')[0];
   if(!section)throw Error('丢失完整卡和参考卡');
   const input=JSON.parse(section);
   prompts.push(input);
   request.physicalCallBudget.remaining-=1;
   return {content:JSON.stringify(ideaReviewResponseExample(input.cards))};
  })};
  const reviews=await c.reviewIdeaPresentation(cards,[],'',{remaining:3},false,true);
  expect(prompts.map(row=>row.cards.length).sort()).toEqual([1,2,2]);
  expect(prompts.map(row=>row.references.length).sort()).toEqual([3,3,4]);
  for(const input of prompts){
   const observed=[...input.cards,...input.references].map(row=>row.title);
   expect(new Set(observed)).toEqual(new Set(cards.map(row=>row.title)));
  }
  expect(reviews).toHaveLength(5);
  expect(reviews.map(row=>row.title)).toEqual(cards.map(row=>row.title));
  expect(reviews.every(row=>row.payoffCredible&&row.storyCoherent&&row.platformFit&&!!row.readerGoals)).toBe(true);
 });
});

describe('semantic review batching honors the original physical-call ceiling',()=>{
 it('preserves aggregate review when three partitions cannot be funded',()=>{
  expect(shouldBatchIdeaPresentation(5,0,2,2)).toBe(false);
  expect(shouldBatchIdeaPresentation(5,0,2,3)).toBe(true);
  expect(shouldBatchIdeaPresentation(5,0,2,1)).toBe(false);
  expect(shouldBatchIdeaPresentation(4,0,2,12)).toBe(false);
  expect(shouldBatchIdeaPresentation(5,1,2,12)).toBe(false);
 });
 it('falls back to one full independent semantic review with one available call',async()=>{
  const cards=Array.from({length:5},(_,i)=>({...card,title:'低额度题材'+(i+1)}));
  const c=Object.create(ChainController.prototype) as any;
  c.logger={warn:vi.fn(),error:vi.fn()};
  const llm=vi.fn(async(req:any)=>{
    req.physicalCallBudget.remaining--;
    return {content:JSON.stringify(ideaReviewResponseExample(cards))};
  });
  c.realLLM={generate:llm};
  const budget={remaining:1};
  const rows=await c.reviewIdeaPresentation(cards,[],'',budget,false,true);
  expect(rows).toHaveLength(5);
  expect(llm).toHaveBeenCalledOnce();
  expect(budget.remaining).toBe(0);
 });
});
