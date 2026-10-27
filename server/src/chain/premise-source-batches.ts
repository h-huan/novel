import {type ReviewCallBudget} from './independent-review-batches';
import {readGenerationBudgets} from '../config/generation-budgets';
import { type PremiseSelectionResult } from './idea-discovery-contract';
import { materializePremiseSourceReview, premiseSourceComparisonCatalog, premiseSourceReviewIssues, type PremiseSelectionReview } from './premise-selection-review';

/** When a complete unchanged selection exceeds the existing source batch size,
 * the source/payoff/genre/category checks are premise-local. Run the same full
 * checklist on disjoint premise groups concurrently; the separate overlap
 * review retains cross-card responsibility. Leave a protocol-correction credit
 * or use the original aggregate path rather than compromising recoverability.
 * This never increases the shared maximum number of physical calls. */
export function shouldBatchLargePremiseSourceReview(
  count:number, groupingMode:number, batchSize:number, availableCalls:number,
):boolean{
  const partitions=Math.ceil(count/Math.max(1,batchSize));
  return groupingMode===0&&count>=4&&batchSize>=1&&partitions>=2
    &&availableCalls>=partitions+1;
}
export function premiseSourceBatches(selection: PremiseSelectionResult): PremiseSelectionResult[] {
  const size=readGenerationBudgets().sourceBatchSize;
  const parts:Array<typeof selection.selected>=[];for(let start=0;start<selection.selected.length;start+=size)parts.push(selection.selected.slice(start,start+size));
  return parts.map(selected => ({
    ...selection, selected, pool: selection.pool.filter(row => selected.some(item => item.premiseId === row.premiseId)),
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
  result.issues.push(...reviews.flatMap(review=>review.issues.filter(issue=>issue.kind==='selection_fit')));
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
      ...(check.links?{links:check.links.map(link=>({...link,ref:rebind(link.ref)}))}:{})};
  }));
  result.passed=result.issues.length===0;return result;
}

/** Share the live parent allowance; a batch never resets the two-call source cap. */
export function premiseSourceCallBudget(parent?: ReviewCallBudget) {
  let remaining: number = readGenerationBudgets().sourceMaxPhysicalCalls;
  return {
    refundReservedCalls(amount:number) {
      remaining+=amount;
      if(parent?.refundReservedCalls)parent.refundReservedCalls(amount);
      else if(parent)parent.remaining+=amount;
    },
    get remaining() { return Math.min(remaining, parent?.remaining ?? remaining); },
    set remaining(value: number) {
      const used = this.remaining - value;
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
