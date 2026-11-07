import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import * as budgetConfig from '../config/generation-budgets';
beforeEach(()=>vi.spyOn(budgetConfig,'readGenerationBudgets').mockReturnValue({...budgetConfig.GENERATION_BUDGET_DEFAULTS,reviewGroupingMode:1}));
afterEach(()=>vi.restoreAllMocks());
import {ChainController} from './chain.controller';
import {SELECTED_PREMISE_FIELDS,normalizePremiseSelectionPayload} from './idea-discovery-contract';
import {premiseSourceComparisonCatalog,materializePremiseSourceReview,premiseReselectionPlan} from './premise-selection-review';
import {premiseSourceBatches,mergePremiseSourceBatches,premiseSourceCallBudget,reserveReviewBatchBudget,shouldBatchLargePremiseSourceReview} from './premise-source-batches';
import {quarantineIncompletePremiseReviews} from './premise-review-quarantine';
import { independentOutcomeStubReceipts } from './premise-payoff-review.fixture';

const selection=()=>normalizePremiseSelectionPayload({
 pool:['A','B','C','D','E'].map(premiseId=>({premiseId,workingTitle:'原题材'+premiseId,storyCore:'主角选择守住原有承诺并承担自己行动带来的真实后果'+premiseId})),
 selectedPremises:['A','B','C','D','E'].map(premiseId=>({premiseId,...Object.fromEntries(SELECTED_PREMISE_FIELDS.filter(key=>key!=='differentiation').map(key=>[key,'保留原题材的具体行动、后果与代价'+premiseId]))})),
},5,5);
const report=(batch:ReturnType<typeof selection>)=>({payoffChecks:batch.selected.map((_,index)=>({ref:'S'+(index+1)+'.payoff',status:'supported',unmappedChecks:independentOutcomeStubReceipts(batch,index),actionEvidenceRef:'S'+(index+1)+'.activeChoice',reversalCheck:{status:'supported',actionEvidenceRef:'S'+(index+1)+'.activeChoice',reason:'此前实际行动与升级支持当前反转的成立条件'},reason:'逐项核对既定行动与必要条件后确认结果成立'})),sourceChecks:premiseSourceComparisonCatalog(batch).map(row=>({ref:row.ref,status:'preserved',reason:'当前展开事实兼容原池所述的行动方向与代价'}))});

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
  const raw=batches.map(report),badBatch=batches.findIndex(batch=>batch.selected.some(item=>item.premiseId==='D'));
  const local=batches[badBatch].selected.findIndex(item=>item.premiseId==='D')+1;
  raw[badBatch].sourceChecks.find(row=>row.ref==='S'+local+'.payoff')!.status='drift';
  (raw[badBatch].payoffChecks[local-1] as any).unmappedChecks=[{ordinal:1,status:'supported',actionEvidenceRef:'S'+local+'.activeChoice',actionEvidenceQuote:'此前已有独立行动',reason:'局部已发生的独立行动仍需引用原身份坐标'}];
  const merged=mergePremiseSourceBatches(original,batches,raw.map((value,index)=>({
    ...materializePremiseSourceReview(value,batches[index]),
    payoffChecks:value.payoffChecks,
  })));
  expect(merged.passed).toBe(false);expect(merged.sourceChecks).toHaveLength(50);
  expect(merged.sourceChecks!.find(row=>row.ref==='S4.payoff')?.status).toBe('drift');
 expect(merged.payoffChecks?.find(row=>row.ref==='S4.payoff')?.reversalCheck?.actionEvidenceRef).toBe('S4.activeChoice');
 expect(merged.payoffChecks?.find(row=>row.ref==='S4.payoff')?.unmappedChecks?.[0].actionEvidenceRef).toBe('S4.activeChoice');
  expect(merged.issues[0].premiseId).toBe('D');expect(JSON.stringify(original)).toBe(before);
 });
 it('ignores server-only transport duplication when balancing source partitions',()=>{
   const base=selection(),plain=premiseSourceBatches(base).map(batch=>batch.selected.map(item=>item.premiseId));
   const withExtras=structuredClone(base);
   withExtras.selected[0].sourceBindings={duplicate:'not transmitted to source audit'.repeat(500)};
   withExtras.selected[0].serverDebug='private transport marker'.repeat(500);
   const after=premiseSourceBatches(withExtras).map(batch=>batch.selected.map(item=>item.premiseId));
   expect(after).toEqual(plain);
   expect(after.flat().sort()).toEqual(base.selected.map(item=>item.premiseId).sort());
 });
 it('uses already-required causal audit complexity to avoid a slow two-card bottleneck',()=>{
   const original=selection();
   const heavy={...original.selected[1],causalPlan:Array.from({length:7},()=>({
     action:{field:'activeChoice',quote:'主角选择承担当面冲突和直接损失'},
     conditions:[{field:'escalation',quote:'原池已建立下一阶段必须行动的条件'}],
     result:{field:'payoff',quote:'原池已确认执行后的实际改变与代价'},
   }))};
   const input={...original,selected:original.selected.map((item,index)=>index===1?heavy:item)};
   const before=JSON.stringify(input);
   const batches=premiseSourceBatches(input);
   expect(batches.find(batch=>batch.selected.some(item=>item.premiseId==='B'))!.selected).toHaveLength(2);
   expect(JSON.stringify(input)).toBe(before);
   expect(batches.flatMap(batch=>batch.selected).map(item=>item.premiseId).sort()).toEqual(original.selected.map(item=>item.premiseId).sort());
   expect(batches).toHaveLength(2); // exactly the SAME two paid model reviews
 });
 it('balances uneven review material without increasing calls, changing order or dropping any source evidence',()=>{
   const original=selection();
   const heavy={...original.selected[0],activeChoice:'主角亲自完成不可替代的实际行动'.repeat(220)};
   const input={...original,selected:[heavy,...original.selected.slice(1)]};
   const batches=premiseSourceBatches(input);
   expect(batches.map(batch=>batch.selected.length)).toEqual([2,3]);
   expect(batches.flatMap(batch=>batch.selected.map(item=>item.premiseId)).sort()).toEqual(['A','B','C','D','E']);
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
  const unknown=structuredClone(reviews),unknownBatch=batches.findIndex(batch=>batch.selected.some(item=>item.premiseId==='D'));
  const unknownLocal=batches[unknownBatch].selected.findIndex(item=>item.premiseId==='D')+1;
  unknown[unknownBatch].sourceChecks!.find(row=>row.ref==='S'+unknownLocal+'.protagonistSituation')!.status='unknown';
  const partial=mergePremiseSourceBatches(original,batches,unknown);
   expect(partial.passed).toBe(false);
   expect(partial.issues).toEqual([expect.objectContaining({kind:'selection_fit',premiseId:'D',repairMode:'replace_from_pool'})]);
   expect(partial.sourceChecks?.find(row=>row.ref==='S4.protagonistSituation')?.status).toBe('unknown');
 });
 it('deduplicates a source unknown already included in the scoped review',()=>{
    const original=selection(),batches=premiseSourceBatches(original);
    const reviews=batches.map(batch=>{
      const raw=report(batch);
      const local=batch.selected.findIndex(item=>item.premiseId==='D')+1;
      if(local>0)raw.sourceChecks.find(row=>row.ref==='S'+local+'.protagonistSituation')!.status='unknown';
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
 it('does not mint, reset or corrupt shared source-review call credits',()=>{
  const parent={remaining:2},budget=premiseSourceCallBudget(parent);
  expect(()=>{budget.remaining=3;}).toThrow('不得透支或重置');
  expect(()=>{budget.remaining=-1;}).toThrow('不得透支或重置');
  expect(()=>{budget.remaining=1.5;}).toThrow('不得透支或重置');
  expect(()=>{budget.remaining=Number.NaN;}).toThrow('不得透支或重置');
  expect(parent.remaining).toBe(2);expect(budget.remaining).toBe(2);
  budget.remaining=1;expect(parent.remaining).toBe(1);
  budget.remaining=0;expect(parent.remaining).toBe(0);
  expect(()=>{budget.remaining=1;}).toThrow('不得透支或重置');
  expect(parent.remaining).toBe(0);
  expect(()=>budget.refundReservedCalls(-1)).toThrow('退款额度无效');
  expect(()=>budget.refundReservedCalls(0.5)).toThrow('退款额度无效');
  expect(parent.remaining).toBe(0);
  const failedParent={remaining:1,refundReservedCalls:(_amount:number)=>{throw Error('upstream refused');}};
  const nested=premiseSourceCallBudget(failedParent);
  expect(()=>nested.refundReservedCalls(1)).toThrow('upstream refused');
  expect(nested.remaining).toBe(1);
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

it('separates heavy adjacent identities within the same four two-card reviews and preserves all eighty field receipts',()=>{
 (budgetConfig.readGenerationBudgets as any).mockReturnValue({...budgetConfig.GENERATION_BUDGET_DEFAULTS,sourceBatchSize:2,reviewGroupingMode:1});
 const base=selection();
 const selected='ABCDEFGH'.split('').map((premiseId,index)=>({...base.selected[index%5],premiseId,
  ...(index<2?{activeChoice:'主角实际采取必要行动并造成新的真实后果'.repeat(150-index*10)}:{})}));
 const input={...base,selected,pool:selected.map(item=>({premiseId:item.premiseId,workingTitle:String(item.workingTitle),storyCore:String(item.storyCore)}))};
 const before=JSON.stringify(input),batches=premiseSourceBatches(input,4);
 expect(batches).toHaveLength(4);expect(batches.every(batch=>batch.selected.length===2)).toBe(true);
 expect(batches.find(batch=>batch.selected.some(item=>item.premiseId==='A'))!.selected.some(item=>item.premiseId==='B')).toBe(false);
 expect(batches.flatMap(batch=>batch.selected.map(item=>item.premiseId)).sort()).toEqual('ABCDEFGH'.split(''));
 const reports=batches.map(report),bad=batches.findIndex(batch=>batch.selected.some(item=>item.premiseId==='B'));
 const local=batches[bad].selected.findIndex(item=>item.premiseId==='B')+1;
 reports[bad].sourceChecks.find(row=>row.ref==='S'+local+'.payoff')!.status='drift';
 const merged=mergePremiseSourceBatches(input,batches,reports.map((value,index)=>({...materializePremiseSourceReview(value,batches[index]),payoffChecks:value.payoffChecks})));
 expect(merged.sourceChecks).toHaveLength(80);expect(merged.sourceChecks!.find(row=>row.ref==='S2.payoff')?.status).toBe('drift');
 expect(merged.issues.map(item=>item.premiseId)).toEqual(['B']);expect(merged.passed).toBe(false);expect(JSON.stringify(input)).toBe(before);
});
