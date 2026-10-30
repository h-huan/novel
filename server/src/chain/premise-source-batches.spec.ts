import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import * as budgetConfig from '../config/generation-budgets';
beforeEach(()=>vi.spyOn(budgetConfig,'readGenerationBudgets').mockReturnValue({...budgetConfig.GENERATION_BUDGET_DEFAULTS,reviewGroupingMode:1}));
afterEach(()=>vi.restoreAllMocks());
import {ChainController} from './chain.controller';
import {SELECTED_PREMISE_FIELDS,normalizePremiseSelectionPayload} from './idea-discovery-contract';
import {premiseSourceComparisonCatalog,materializePremiseSourceReview,premiseReselectionPlan} from './premise-selection-review';
import {premiseSourceBatches,mergePremiseSourceBatches,premiseSourceCallBudget,reserveReviewBatchBudget,shouldBatchLargePremiseSourceReview} from './premise-source-batches';
import {quarantineIncompletePremiseReviews} from './premise-review-quarantine';

const selection=()=>normalizePremiseSelectionPayload({
 pool:['A','B','C','D','E'].map(premiseId=>({premiseId,workingTitle:'原题材'+premiseId,storyCore:'主角选择守住原有承诺并承担自己行动带来的真实后果'+premiseId})),
 selectedPremises:['A','B','C','D','E'].map(premiseId=>({premiseId,...Object.fromEntries(SELECTED_PREMISE_FIELDS.filter(key=>key!=='differentiation').map(key=>[key,'保留原题材的具体行动、后果与代价'+premiseId]))})),
},5,5);
const report=(batch:ReturnType<typeof selection>)=>({payoffChecks:batch.selected.map((_,index)=>({ref:'S'+(index+1)+'.payoff',status:'supported',actionEvidenceRef:'S'+(index+1)+'.activeChoice',reversalCheck:{status:'supported',actionEvidenceRef:'S'+(index+1)+'.activeChoice',reason:'此前实际行动与升级支持当前反转的成立条件'},reason:'逐项核对既定行动与必要条件后确认结果成立'})),sourceChecks:premiseSourceComparisonCatalog(batch).map(row=>({ref:row.ref,status:'preserved',reason:'当前展开事实兼容原池所述的行动方向与代价'}))});

describe('bounded premise source review batches',()=>{

 it('isolates one malformed premise receipt while keeping a peer verdict and without another review call',async()=>{
  const c=Object.create(ChainController.prototype) as any;
  const original={...selection(),selected:selection().selected.slice(0,2)};
  const raw=report(original);
  raw.sourceChecks=raw.sourceChecks.filter(row=>row.ref!=='S1.activeChoice');
  raw.payoffChecks[0].actionEvidenceRef='S2.activeChoice';
  c.llmCallWithRetry=vi.fn(async(_label:string,_prompt:string,options:any)=>{
    expect(options.validate(raw)).toBe(true);
    return {data:raw};
  });
  const reviewed=await c.reviewPremiseSelection(original,'现有标准','source_drift',{remaining:1},true);
  expect(c.llmCallWithRetry).toHaveBeenCalledTimes(1);
  expect(reviewed.passed).toBe(false);
  expect(reviewed.issues.every((issue:any)=>issue.premiseId==='A')).toBe(true);
  const recovery=premiseReselectionPlan(original,reviewed);
  expect(recovery.repairSlots).toHaveLength(1);
  expect(recovery.repairSlots[0]).toMatchObject({replacesPremiseId:'A',mode:'replace_from_pool'});
  expect(recovery.availableCandidates.every(row=>row.premiseId!=='A')).toBe(true);
  expect(reviewed.sourceChecks!.filter(row=>row.ref.startsWith('S2.')).every(row=>row.status==='preserved')).toBe(true);
  expect(reviewed.sourceChecks!.find(row=>row.ref==='S1.activeChoice')?.reason).toContain('尚未核查');
  expect(reviewed.payoffChecks?.find(row=>row.ref==='S1.payoff')?.reason).toContain('审核证据跨题材引用');
  expect(reviewed.payoffChecks?.find(row=>row.ref==='S2.payoff')?.status).toBe('supported');
 });
 it('a malformed payoff protocol preserves independently valid source, category and peer review evidence',()=>{
  const original={...selection(),selected:selection().selected.slice(0,2)};
  original.selected.forEach(row=>row.storyCategory='悬疑惊悚');
  const raw:any=report(original);
  raw.categoryChecks=[
    {ref:'S1.category',status:'fulfilled',evidenceRef:'S1.activeChoice',reason:'主角选择与行动在此分类下形成具体调查机制'},
    {ref:'S2.category',status:'fulfilled',evidenceRef:'S2.activeChoice',reason:'主角选择与行动在此分类下形成具体调查机制'},
  ];
  raw.payoffChecks[0]={...raw.payoffChecks[0],
    gapRepair:'restore_source_conditions',sourceConditionQuote:'原池实际已经满足必要条件'};
  const result=quarantineIncompletePremiseReviews(raw,original,[]);
  expect(result.payoffChecks.find((row:any)=>row.ref==='S1.payoff')?.status).toBe('unknown');
  expect(result.payoffChecks.find((row:any)=>row.ref==='S1.payoff')?.protocolIncomplete).toBe(true);
  expect(result.payoffChecks.find((row:any)=>row.ref==='S2.payoff')?.status).toBe('supported');
  expect(result.sourceChecks.every((row:any)=>row.status==='preserved')).toBe(true);
  expect(result.categoryChecks.every((row:any)=>row.status==='fulfilled')).toBe(true);
 });
 it('a missing source field does not erase its separately verified payoff receipt',()=>{
  const original={...selection(),selected:selection().selected.slice(0,2)};
  const raw:any=report(original);
  raw.sourceChecks=raw.sourceChecks.filter((row:any)=>row.ref!=='S1.activeChoice');
  const result=quarantineIncompletePremiseReviews(raw,original,[]);
  expect(result.sourceChecks.find((row:any)=>row.ref==='S1.activeChoice')?.status).toBe('unknown');
  expect(result.payoffChecks.every((row:any)=>row.status==='supported')).toBe(true);
  expect(result.sourceChecks.filter((row:any)=>row.ref.startsWith('S2.'))
    .every((row:any)=>row.status==='preserved')).toBe(true);
 });
 it('keeps unattributable review rows as a protocol failure',()=>{
  const original={...selection(),selected:selection().selected.slice(0,2)};
  const raw=report(original);
  raw.sourceChecks.push({ref:'S9.activeChoice',status:'preserved',reason:'无法定位到实际题材的额外审核结论'});
  expect(quarantineIncompletePremiseReviews(raw,original,[])).toBe(raw);
 });
 it('isolates wrong-card category evidence and preserves a peer causal gap',()=>{
  const original={...selection(),selected:selection().selected.slice(0,2)};
  original.selected.forEach(row=>row.storyCategory='悬疑惊悚');
  const raw:any=report(original);
  raw.categoryChecks=[
    {ref:'S1.category',status:'fulfilled',evidenceRef:'S1.activeChoice',reason:'主角行动落实分类所需的主线调查机制'},
    {ref:'S2.category',status:'fulfilled',evidenceRef:'S1.activeChoice',reason:'错误地借用另一张卡的行动作为分类证据'},
  ];
  raw.payoffChecks[0]={...raw.payoffChecks[0],status:'gap',gapRepair:'replace_from_pool',
    reason:'现有行动尚未建立取得决定性证据的必要条件',protocolIncomplete:true};
  const normalized=quarantineIncompletePremiseReviews(raw,original,[]);
  expect(normalized.payoffChecks[0]).toMatchObject({ref:'S1.payoff',status:'gap',gapRepair:'replace_from_pool'});
  expect(normalized.payoffChecks[0].protocolIncomplete).toBeUndefined();
  expect(normalized.categoryChecks.find((row:any)=>row.ref==='S2.category')).toMatchObject({status:'unknown'});
  expect(normalized.sourceChecks.filter((row:any)=>row.ref.startsWith('S1.')).every((row:any)=>row.status==='preserved')).toBe(true);
 });
 it('partitions large source sets whenever each independent batch has one funded call',()=>{
  expect(shouldBatchLargePremiseSourceReview(5,0,3,10)).toBe(true);
  expect(shouldBatchLargePremiseSourceReview(8,0,3,3)).toBe(true);
  expect(shouldBatchLargePremiseSourceReview(8,0,3,2)).toBe(false);
  expect(shouldBatchLargePremiseSourceReview(8,0,4,2)).toBe(true);
  expect(shouldBatchLargePremiseSourceReview(4,0,3,3)).toBe(true);
  expect(shouldBatchLargePremiseSourceReview(3,0,3,10)).toBe(false);
  expect(shouldBatchLargePremiseSourceReview(5,0,3,2)).toBe(true);
  expect(shouldBatchLargePremiseSourceReview(5,1,3,10)).toBe(false);
 });
 it('keeps full facts in 3+2 batches and rebinds all fifty checks without losing a real drift',()=>{
  const original=selection(),before=JSON.stringify(original),batches=premiseSourceBatches(original);
  expect(batches.map(batch=>batch.selected.length)).toEqual([3,2]);
  const raw=batches.map(report);raw[1].sourceChecks.find(row=>row.ref==='S1.payoff')!.status='drift';
  const merged=mergePremiseSourceBatches(original,batches,raw.map((value,index)=>({
    ...materializePremiseSourceReview(value,batches[index]),
    payoffChecks:value.payoffChecks,
  })));
  expect(merged.passed).toBe(false);expect(merged.sourceChecks).toHaveLength(50);
  expect(merged.sourceChecks!.find(row=>row.ref==='S4.payoff')?.status).toBe('drift');
 expect(merged.payoffChecks?.find(row=>row.ref==='S4.payoff')?.reversalCheck?.actionEvidenceRef).toBe('S4.activeChoice');
  expect(merged.issues[0].premiseId).toBe('D');expect(JSON.stringify(original)).toBe(before);
 });
 it('balances uneven review material without increasing calls, changing order or dropping any source evidence',()=>{
   const original=selection();
   const heavy={...original.selected[0],activeChoice:'主角亲自完成不可替代的实际行动'.repeat(220)};
   const input={...original,selected:[heavy,...original.selected.slice(1)]};
   const batches=premiseSourceBatches(input);
   expect(batches.map(batch=>batch.selected.length)).toEqual([2,3]);
   expect(batches.flatMap(batch=>batch.selected.map(item=>item.premiseId))).toEqual(['A','B','C','D','E']);
   expect(batches).toHaveLength(2);
   const reports=batches.map(report);
   const merged=mergePremiseSourceBatches(input,batches,reports.map((value,index)=>({
     ...materializePremiseSourceReview(value,batches[index]),payoffChecks:value.payoffChecks,
   })));
   expect(merged.sourceChecks).toHaveLength(50);
   expect(merged.payoffChecks?.map(row=>row.ref)).toEqual(['S1.payoff','S2.payoff','S3.payoff','S4.payoff','S5.payoff']);
   expect(merged.passed).toBe(true);
 });
 it('rejects missing batches, missing or duplicate checks and unknown outcomes',()=>{
  const original=selection(),batches=premiseSourceBatches(original);
  const reviews=batches.map(batch=>materializePremiseSourceReview(report(batch),batch));
  expect(()=>mergePremiseSourceBatches(original,batches,reviews.slice(1))).toThrow('批次未完成');
  const missing=structuredClone(reviews);missing[1].sourceChecks!.pop();
  expect(()=>mergePremiseSourceBatches(original,batches,missing)).toThrow('覆盖未完成');
  const duplicate=structuredClone(reviews);duplicate[1].sourceChecks![1]=duplicate[1].sourceChecks![0];
  expect(()=>mergePremiseSourceBatches(original,batches,duplicate)).toThrow();
  const unknown=structuredClone(reviews);unknown[1].sourceChecks![0].status='unknown';
  const partial=mergePremiseSourceBatches(original,batches,unknown);
   expect(partial.passed).toBe(false);
   expect(partial.issues).toEqual([expect.objectContaining({kind:'selection_fit',premiseId:'D',repairMode:'replace_from_pool'})]);
   expect(partial.sourceChecks?.find(row=>row.ref==='S4.protagonistSituation')?.status).toBe('unknown');
 });
 it('deduplicates a source unknown already included in the scoped review',()=>{
    const original=selection(),batches=premiseSourceBatches(original);
    const reviews=batches.map(batch=>{
      const raw=report(batch);
      if(batch.selected[0]?.premiseId==='D')raw.sourceChecks[0].status='unknown';
      const source=materializePremiseSourceReview(raw,batch);
      return {...source,payoffChecks:raw.payoffChecks};
    });
    const merged=mergePremiseSourceBatches(original,batches,reviews);
    expect(merged.passed).toBe(false);
    expect(merged.issues.filter(issue=>issue.premiseId==='D')).toHaveLength(1);
    expect(merged.issues[0]).toMatchObject({kind:'selection_fit',premiseId:'D'});
  });
 it('shares the two-call cap with a live external allowance',()=>{
  const parent={remaining:3},budget=premiseSourceCallBudget(parent);
  expect(budget.remaining).toBe(3);budget.remaining--;expect(parent.remaining).toBe(2);
  parent.remaining--;expect(budget.remaining).toBe(1);budget.remaining--;
  expect(parent.remaining).toBe(0);expect(budget.remaining).toBe(0);
 });
 it('runs two source batches through the existing review helper with the same physical allowance',async()=>{
  const c=Object.create(ChainController.prototype) as any,original=selection(),batches=premiseSourceBatches(original);let calls=0;
  const budgets:any[]=[];
  c.llmCallWithRetry=vi.fn(async(_label:string,_prompt:string,options:any)=>{
   budgets.push(options.physicalCallBudget);options.physicalCallBudget.remaining--;
   const data=report(batches[calls++]);expect(options.validate(data)).toBe(true);return {data};
  });
  const result=await c.reviewPremiseSelection(original,'全部原有标准','source_drift',{remaining:2});
  expect(result.sourceChecks).toHaveLength(50);expect(calls).toBe(2);
  expect(budgets[0]).not.toBe(budgets[1]);expect(budgets.map(item=>item.remaining)).toEqual([0,0]);
 });
 it('each concurrently started batch keeps its first-call allowance and cannot spend a peer reservation retrying',async()=>{
  const c=Object.create(ChainController.prototype) as any,original=selection(),first=premiseSourceBatches(original)[0];
  c.llmCallWithRetry=vi.fn(async(_label:string,_prompt:string,options:any)=>{
   expect(options.physicalCallBudget.remaining).toBe(1);options.physicalCallBudget.remaining--;return {data:null,validationIssues:['原池storyCore不能替代已选展开证据']};
  });
  await expect(c.reviewPremiseSelection(original,'','source_drift',{remaining:2})).rejects.toThrow('原池storyCore不能替代已选展开证据');
  expect(c.llmCallWithRetry).toHaveBeenCalledTimes(2);
 });
});

describe('batch allowance reservation',()=>{
 it('allows corrections only from surplus and cannot overspend or replenish',()=>{
  const parent={remaining:3},first=reserveReviewBatchBudget(parent,1);
  expect(first.remaining).toBe(2);first.remaining--;expect(parent.remaining).toBe(2);
  first.remaining--;expect(parent.remaining).toBe(1);expect(first.remaining).toBe(0);
  expect(()=>first.remaining--).toThrow('不得透支');expect(parent.remaining).toBe(1);
  const last=reserveReviewBatchBudget(parent,0);last.remaining--;expect(parent.remaining).toBe(0);
  expect(()=>last.remaining=1).toThrow('不得透支');
 });
});

it('composes real source partitions with the independent overlap reservation in manual grouping mode',async()=>{
 const {independentReviewBatches}=await import('./independent-review-batches');
 const c=Object.create(ChainController.prototype) as any,original=selection(),batches=premiseSourceBatches(original);let calls=0;
 c.llmCallWithRetry=vi.fn(async(_label:string,_prompt:string,options:any)=>{
  options.physicalCallBudget.remaining--;return {data:report(batches[calls++])};
 });
 const parent={remaining:5};
 const results=await independentReviewBatches(['source','overlap'],parent,2,async(mode,_i,budget)=>{
  if(mode==='source')return c.reviewPremiseSelection(original,'','source_drift',budget);
  budget.remaining--;return {passed:true,issues:[]};
 });
 expect(results[0].sourceChecks).toHaveLength(50);expect(calls).toBe(2);expect(parent.remaining).toBe(2);
});
