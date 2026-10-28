import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import * as budgetConfig from '../config/generation-budgets';
beforeEach(()=>vi.spyOn(budgetConfig,'readGenerationBudgets').mockReturnValue({...budgetConfig.GENERATION_BUDGET_DEFAULTS,reviewGroupingMode:1}));
afterEach(()=>vi.restoreAllMocks());
import {ChainController} from './chain.controller';
import {SELECTED_PREMISE_FIELDS,normalizePremiseSelectionPayload} from './idea-discovery-contract';
import {premiseSourceComparisonCatalog,materializePremiseSourceReview} from './premise-selection-review';
import {premiseSourceBatches,mergePremiseSourceBatches,premiseSourceCallBudget,reserveReviewBatchBudget,shouldBatchLargePremiseSourceReview} from './premise-source-batches';

const selection=()=>normalizePremiseSelectionPayload({
 pool:['A','B','C','D','E'].map(premiseId=>({premiseId,workingTitle:'原题材'+premiseId,storyCore:'主角选择守住原有承诺并承担自己行动带来的真实后果'+premiseId})),
 selectedPremises:['A','B','C','D','E'].map(premiseId=>({premiseId,...Object.fromEntries(SELECTED_PREMISE_FIELDS.filter(key=>key!=='differentiation').map(key=>[key,'保留原题材的具体行动、后果与代价'+premiseId]))})),
},5,5);
const report=(batch:ReturnType<typeof selection>)=>({payoffChecks:batch.selected.map((_,index)=>({ref:'S'+(index+1)+'.payoff',status:'supported',actionEvidenceRef:'S'+(index+1)+'.activeChoice',reversalCheck:{status:'supported',actionEvidenceRef:'S'+(index+1)+'.activeChoice',reason:'此前实际行动与升级支持当前反转的成立条件'},reason:'逐项核对既定行动与必要条件后确认结果成立'})),sourceChecks:premiseSourceComparisonCatalog(batch).map(row=>({ref:row.ref,status:'preserved',reason:'当前展开事实兼容原池所述的行动方向与代价'}))});

describe('bounded premise source review batches',()=>{
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
  const merged=mergePremiseSourceBatches(original,batches,raw.map((value,index)=>materializePremiseSourceReview(value,batches[index])));
  expect(merged.passed).toBe(false);expect(merged.sourceChecks).toHaveLength(50);
  expect(merged.sourceChecks!.find(row=>row.ref==='S4.payoff')?.status).toBe('drift');
 expect(merged.payoffChecks?.find(row=>row.ref==='S4.payoff')?.reversalCheck?.actionEvidenceRef).toBe('S4.activeChoice');
  expect(merged.issues[0].premiseId).toBe('D');expect(JSON.stringify(original)).toBe(before);
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
  expect(()=>mergePremiseSourceBatches(original,batches,unknown)).toThrow('仍未确认');
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
