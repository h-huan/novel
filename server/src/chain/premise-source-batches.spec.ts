import {describe,it,expect,vi} from 'vitest';
import {ChainController} from './chain.controller';
import {SELECTED_PREMISE_FIELDS,normalizePremiseSelectionPayload} from './idea-discovery-contract';
import {premiseSourceComparisonCatalog,materializePremiseSourceReview} from './premise-selection-review';
import {premiseSourceBatches,mergePremiseSourceBatches,premiseSourceCallBudget} from './premise-source-batches';

const selection=()=>normalizePremiseSelectionPayload({
 pool:['A','B','C','D','E'].map(premiseId=>({premiseId,workingTitle:'原题材'+premiseId,storyCore:'主角选择守住原有承诺并承担自己行动带来的真实后果'+premiseId})),
 selectedPremises:['A','B','C','D','E'].map(premiseId=>({premiseId,...Object.fromEntries(SELECTED_PREMISE_FIELDS.filter(key=>key!=='differentiation').map(key=>[key,'保留原题材的具体行动、后果与代价'+premiseId]))})),
},5,5);
const report=(batch:ReturnType<typeof selection>)=>({sourceChecks:premiseSourceComparisonCatalog(batch).map(row=>({ref:row.ref,status:'preserved',reason:'当前展开事实兼容原池所述的行动方向与代价'}))});

describe('bounded premise source review batches',()=>{
 it('keeps full facts in 3+2 batches and rebinds all fifty checks without losing a real drift',()=>{
  const original=selection(),before=JSON.stringify(original),batches=premiseSourceBatches(original);
  expect(batches.map(batch=>batch.selected.length)).toEqual([3,2]);
  const raw=batches.map(report);raw[1].sourceChecks.find(row=>row.ref==='S1.payoff')!.status='drift';
  const merged=mergePremiseSourceBatches(original,batches,raw.map((value,index)=>materializePremiseSourceReview(value,batches[index])));
  expect(merged.passed).toBe(false);expect(merged.sourceChecks).toHaveLength(50);
  expect(merged.sourceChecks!.find(row=>row.ref==='S4.payoff')?.status).toBe('drift');
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
  expect(budget.remaining).toBe(2);budget.remaining--;expect(parent.remaining).toBe(2);
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
  const result=await c.reviewPremiseSelection(original,'全部原有标准','source_drift');
  expect(result.sourceChecks).toHaveLength(50);expect(calls).toBe(2);
  expect(budgets[0]).toBe(budgets[1]);expect(budgets[0].remaining).toBe(0);
 });
 it('stops if the first batch uses the remaining calls for protocol correction',async()=>{
  const c=Object.create(ChainController.prototype) as any,original=selection(),first=premiseSourceBatches(original)[0];
  c.llmCallWithRetry=vi.fn(async(_label:string,_prompt:string,options:any)=>{
   options.physicalCallBudget.remaining-=2;return {data:report(first)};
  });
  await expect(c.reviewPremiseSelection(original,'','source_drift')).rejects.toThrow('预算已耗尽');
  expect(c.llmCallWithRetry).toHaveBeenCalledTimes(1);
 });
});
