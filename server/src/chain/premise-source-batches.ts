import {type ReviewCallBudget} from './independent-review-batches';
import {readGenerationBudgets} from '../config/generation-budgets';
import { type PremiseSelectionResult } from './idea-discovery-contract';
import { materializePremiseSourceReview, premiseSourceComparisonCatalog, premiseSourceReviewIssues, premiseSourceAuditView, type PremiseSelectionReview } from './premise-selection-review';

/** Source/payoff/genre/category reviews are premise-local. Independently review
 * every disjoint group concurrently, keeping cross-card overlap in its separate
 * original Gate. When the remaining shared budget covers exactly one first call
 * per group, splitting is still cheaper than a single eight-card monolith:
 * protocol failure then stops honestly instead of fabricating a recovery credit.
 * No gate, physical-call allowance or timeout is increased. */
export function shouldBatchLargePremiseSourceReview(
  count:number, groupingMode:number, batchSize:number, availableCalls:number,
):boolean{
  const partitions=Math.ceil(count/Math.max(1,batchSize));
  return groupingMode===0&&count>=4&&batchSize>=1&&partitions>=2
    &&availableCalls>=partitions;
}
export function premiseSourceBatches(selection: PremiseSelectionResult,groupCount?:number): PremiseSelectionResult[] {
  const size=readGenerationBudgets().sourceBatchSize;
  const items=selection.selected, count=items.length;
  if(!count)return [];
  // A slow large partition dictates wall time even when smaller peers finish
  // in parallel. Balance actual transmitted story material while preserving
  // premise identity, each existing batch-size cap and EXACTLY the
  // chosen number of funded review calls. No field or Gate is omitted.
  const groups=groupCount??Math.ceil(count/size);
  if(!Number.isInteger(groups)||groups<Math.ceil(count/size)||groups>count)throw Error('来源审核分组不能越过批次大小或实际数量');
  // Partition by exactly the story evidence actually transmitted to the
  // independent source review, not by server-only metadata or duplicated
  // sourceBindings. This avoids allocating a long prompt to one unlucky group.
  const weights=items.map(item=>{
    const source=selection.pool.find(seed=>seed.premiseId===item.premiseId);
    const sent=premiseSourceAuditView({...selection,selected:[item]})[0];
    const materialLength=JSON.stringify({selected:sent,pool:source}).length;
    // Model review time is also driven by the NUMBER of independent causal
    // judgments, not just bytes. A short story with several causal links
    // and separately claimed outcomes can be slower than a longer, simple
    // story. Include their already-required audit work when balancing the
    // SAME funded groups; neither calls nor quality checks are added.
    const links=Array.isArray(item.causalPlan)?item.causalPlan:[];
    const linksWork=links.reduce((total:number,link:any)=>
      total+1+(Array.isArray(link?.conditions)?link.conditions.length:0),0);
    const outcomeClauses=['reversalEffect','payoff'].reduce((total,key)=>
      total+String(item[key]||'').split(/[。；！？\n]+/u).filter(v=>v.trim().length>=6).length,0);
    return materialLength+linksWork*360+outcomeClauses*150;
  });
  // Premise-local judgments have no adjacency dependency. Pairwise judgments
  // remain in the separate original Gate. Spread the heaviest actual workloads
  // across the SAME funded groups, respecting the configured per-group cap.
  const buckets=Array.from({length:groups},()=>({indices:[] as number[],weight:0}));
  const ranked=weights.map((weight,index)=>({weight,index})).sort((a,b)=>b.weight-a.weight||a.index-b.index);
  for(const item of ranked){
    const target=buckets.filter(bucket=>bucket.indices.length<size)
      .sort((a,b)=>a.weight-b.weight||a.indices.length-b.indices.length)[0];
    if(!target)throw Error('来源审核批次没有原有容量');
    target.indices.push(item.index);target.weight+=item.weight;
  }
  const parts=buckets.map(bucket=>bucket.indices.sort((a,b)=>a-b))
    .sort((a,b)=>a[0]-b[0]).map(indices=>indices.map(index=>items[index]));
  return parts.map(selected=>({
    ...selection,selected,pool:selection.pool.filter(row=>selected.some(item=>item.premiseId===row.premiseId)),
  }));
}

/** Rebind local batch coordinates to original positions without changing judgments or reasons. */
export function mergePremiseSourceBatches(selection: PremiseSelectionResult, batches: PremiseSelectionResult[], reviews: PremiseSelectionReview[]) {
  if (reviews.length !== batches.length) throw new Error('来源审核批次未完成，不能锁定任何题材');
  const sourceChecks = batches.flatMap((batch, index) => {
    const review = reviews[index];
    const errors = premiseSourceReviewIssues({ sourceChecks: review.sourceChecks }, batch);
    if (errors.length) throw new Error('来源审核批次覆盖未完成：' + errors.join('；'));
    const catalog = premiseSourceComparisonCatalog(batch);
    return review.sourceChecks!.map(check => {
      const entry = catalog.find(row => row.ref === check.ref)!;
      const position = selection.selected.findIndex(row => row.premiseId === entry.premiseId);
      if (position < 0) throw new Error('来源审核批次包含未知原题材身份');
      return { ...check, ref: `S${position + 1}.${entry.field}` };
    });
  });
  const result=materializePremiseSourceReview({ sourceChecks }, selection);
  // A source "unknown" is materialized from merged sourceChecks. Avoid
  // counting the exact same independent negative receipt a second time.
  for(const issue of reviews.flatMap(review=>review.issues.filter(issue=>issue.kind==='selection_fit'))){
    if(!result.issues.some(existing=>existing.kind===issue.kind&&existing.premiseId===issue.premiseId
      &&existing.referencePremiseId===issue.referencePremiseId&&existing.reason===issue.reason
      &&existing.quote===issue.quote&&existing.referenceQuote===issue.referenceQuote))
      result.issues.push(issue);
  }
  result.genreChecks=batches.flatMap((batch,index)=>(reviews[index].genreChecks||[]).map(check=>{
    const local=Number(/^S(\d+)\./.exec(check.ref)?.[1])-1;
    const position=selection.selected.findIndex(item=>item.premiseId===batch.selected[local]?.premiseId);
    if(position<0)throw Error('流派审核批次编号无法绑定原题材');
    return {...check,ref:check.ref.replace(/^S\d+\./,'S'+(position+1)+'.'),...(check.evidenceRef?{evidenceRef:check.evidenceRef.replace(/^S\d+\./,'S'+(position+1)+'.')}:{})};
  }));
  result.categoryChecks=batches.flatMap((batch,index)=>(reviews[index].categoryChecks||[]).map(check=>{
    const local=Number(/^S(\d+)\./.exec(check.ref)?.[1])-1;
    const position=selection.selected.findIndex(item=>item.premiseId===batch.selected[local]?.premiseId);
    if(position<0)throw Error('分类审核批次编号无法绑定原题材');
    return {...check,ref:check.ref.replace(/^S\d+\./,'S'+(position+1)+'.'),...(check.evidenceRef?{evidenceRef:check.evidenceRef.replace(/^S\d+\./,'S'+(position+1)+'.')}:{})};
  }));
  result.payoffChecks=batches.flatMap((batch,index)=>(reviews[index].payoffChecks||[]).map(check=>{
    const local=Number(/^S(\d+)\./.exec(check.ref)?.[1])-1;
    const position=selection.selected.findIndex(item=>item.premiseId===batch.selected[local]?.premiseId);
    if(position<0)throw Error('兑现审核编号无法绑定原题材');
    const rebind=(ref:string)=>ref.replace(/^S\d+\./,'S'+(position+1)+'.');
    return {...check,ref:rebind(check.ref),...(check.actionEvidenceRef?{actionEvidenceRef:rebind(check.actionEvidenceRef)}:{}),
      ...(check.conditionEvidenceRef?{conditionEvidenceRef:rebind(check.conditionEvidenceRef)}:{}),
      ...(check.reversalCheck?{reversalCheck:{...check.reversalCheck,
        ...(check.reversalCheck.actionEvidenceRef?{actionEvidenceRef:rebind(check.reversalCheck.actionEvidenceRef)}:{})}}:{}),
      ...(check.links?{links:check.links.map(link=>({...link,ref:rebind(link.ref)}))}:{})};
  }));
  const owner=(row:{ref:string})=>Number(/^S(\d+)\./.exec(row.ref)?.[1]||0);
  for(const rows of [result.sourceChecks,result.payoffChecks,result.genreChecks,result.categoryChecks])rows?.sort((a,b)=>owner(a)-owner(b));
  result.passed=result.issues.length===0;return result;
}

/** Share the live parent allowance; a batch never resets the two-call source cap. */
export function premiseSourceCallBudget(parent?: ReviewCallBudget) {
  let remaining: number = readGenerationBudgets().sourceMaxPhysicalCalls;
  return {
    refundReservedCalls(amount:number) {
      if(!Number.isSafeInteger(amount)||amount<0)throw Error('来源审核退款额度无效');
      // Refund the upstream reservation first: a rejected parent refund must
      // not leave the local allowance artificially increased.
      if(parent?.refundReservedCalls)parent.refundReservedCalls(amount);
      else if(parent)parent.remaining+=amount;
      remaining+=amount;
    },
    get remaining() { return Math.min(remaining, parent?.remaining ?? remaining); },
    set remaining(value: number) {
      const available=this.remaining;
      if(!Number.isSafeInteger(value)||value<0||value>available)
        throw Error('来源审核调用预算不得透支或重置');
      const used = available - value;
      remaining -= used;
      if (parent) parent.remaining -= used;
    },
  };
}

/** Leave one physical call for every batch that has not run yet.
 * A protocol recovery may use only the surplus, never the next batch's allowance. */
export function reserveReviewBatchBudget(parent:{remaining:number},pendingBatches:number){
 return {
  get remaining(){return Math.max(0,parent.remaining-pendingBatches);},
  set remaining(value:number){
   const available=this.remaining;
   if(value<0||value>available)throw Error('审核批次调用预算不得透支或重置');
   parent.remaining-=available-value;
  },
 };
}
