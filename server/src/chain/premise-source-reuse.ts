import {type PremiseSelectionResult} from './idea-discovery-contract';
import {type PremiseSelectionReview, premiseSourceReviewIssues, premiseSelectionReviewIssues, materializePremiseSourceReview} from './premise-selection-review';
import {mergePremiseSourceBatches} from './premise-source-batches';
import {readGenerationBudgets} from '../config/generation-budgets';
import {independentReviewBatches, type ReviewCallBudget} from './independent-review-batches';
import {premisePayoffReviewIssues} from './premise-payoff-review';
import {premiseGenreFitIssues} from './premise-genre-fit';
import {premiseCategoryFitIssues} from './premise-category-fit';

type Receipt={selection:PremiseSelectionResult;review:PremiseSelectionReview};
/** Owned by one reconciliation only. Never persists or crosses discovery runs. */
export type PremiseSourceReceipts=Map<string,Receipt>;

/** Use precisely the same cache identity when preflighting a changed selection
 * and when executing its independent source review. */
const sourceReceiptKey = (selection:PremiseSelectionResult, scope:string,
  item:PremiseSelectionResult['selected'][number]) => JSON.stringify({scope,item,
    seed:selection.pool.find(seed=>seed.premiseId===item.premiseId)});

function singleReceipt(selection:PremiseSelectionResult,review:PremiseSelectionReview,index:number):Receipt {
 const item=selection.selected[index],prefix=`S${index+1}.`;
 const rebind=(value:string)=>value.startsWith(prefix)?'S1.'+value.slice(prefix.length):value;
 const rows=(values:any[]|undefined)=>values?.filter(row=>row.ref.startsWith(prefix)).map(row=>Object.fromEntries(
  Object.entries(row).map(([key,value])=>[key,(key==='ref'||/evidenceRef$/i.test(key))&&typeof value==='string'?rebind(value)
   :key==='links'&&Array.isArray(value)?value.map(link=>({...link,ref:rebind(link.ref)}))
    :key==='reversalCheck'&&value&&typeof value==='object'
      ?{...value,...(typeof (value as any).actionEvidenceRef==='string'?{actionEvidenceRef:rebind((value as any).actionEvidenceRef)}:{})}
      :value])));
 const issues=review.issues.filter(issue=>issue.premiseId===item.premiseId);
 return {selection:{...selection,selected:[item],pool:selection.pool.filter(seed=>seed.premiseId===item.premiseId)},
  review:{passed:issues.length===0,issues,sourceChecks:rows(review.sourceChecks),
   genreChecks:rows(review.genreChecks),categoryChecks:rows(review.categoryChecks),payoffChecks:rows(review.payoffChecks)} as PremiseSelectionReview};
}

/** Source/genre/category/payoff checks are local to one premise. Pairwise overlap
 * is deliberately not cached: changed cards must still be compared to retained cards. */
export async function reviewChangedPremiseSources(selection:PremiseSelectionResult,scope:string,
 receipts:PremiseSourceReceipts,review:(pending:PremiseSelectionResult,budget?:ReviewCallBudget)=>Promise<PremiseSelectionReview>,
 observe?:(counts:{reused:number;reviewed:number})=>void,
 reviewPlanOnly?:(pending:PremiseSelectionResult,prior:PremiseSelectionReview,budget:ReviewCallBudget)=>Promise<PremiseSelectionReview>,
 sharedBudget?:ReviewCallBudget):Promise<PremiseSelectionReview> {
 const key=(item:PremiseSelectionResult['selected'][number])=>sourceReceiptKey(selection,scope,item);
 const requiredGenres=(()=>{try{const parsed=JSON.parse(scope);return Array.isArray(parsed?.requiredGenres)?parsed.requiredGenres as string[]:[];}catch{return [];}})();
 const hits=selection.selected.map(item=>receipts.get(key(item)));
 const pending=selection.selected.filter((_item,index)=>!hits[index]);
 observe?.({reused:selection.selected.length-pending.length,reviewed:pending.length});
 // A citation-only correction changes the causalPlan, not the already
 // independently checked source story, category or genre facts. Re-review its
 // payoff links, but do NOT repeat the full source/category/genre audit.
 // Only use the fast path when it replaces at least two existing source
 // partitions, so physical call count cannot grow. Other changes retain the
 // original complete independent review without any shortcut.
 const priorById=new Map<string,Receipt>();
 if(reviewPlanOnly&&sharedBudget){
  for(const item of pending){
   const seed=selection.pool.find(row=>row.premiseId===item.premiseId);
   for(const receipt of receipts.values()){
    const previous=receipt.selection.selected[0];
    if(!previous||previous.premiseId!==item.premiseId
      ||JSON.stringify(receipt.selection.pool[0])!==JSON.stringify(seed)
      ||JSON.stringify({...previous,causalPlan:undefined})!==JSON.stringify({...item,causalPlan:undefined})
      ||JSON.stringify(previous.causalPlan)===JSON.stringify(item.causalPlan)
      ||receipt.review.sourceChecks?.some(row=>row.status!=='preserved')
      ||!receipt.review.sourceChecks?.length
      ||receipt.review.genreChecks?.some(row=>row.status!=='fulfilled')
      ||receipt.review.categoryChecks?.some(row=>row.status!=='fulfilled')
      ||!receipt.review.payoffChecks?.length)continue;
    // The scope is part of the exact receipt key. A receipt from another
    // standard or manual genre selection is never a reusable proof.
    if(!receipts.has(sourceReceiptKey(receipt.selection,scope,previous)))continue;
    priorById.set(String(item.premiseId),receipt);break;
   }
  }
 }
 const planPending=pending.filter(row=>priorById.has(String(row.premiseId)));
 const fullPending=pending.filter(row=>!priorById.has(String(row.premiseId)));
 const batchSize=readGenerationBudgets().sourceBatchSize;
 const existingCallFloor=Math.ceil(pending.length/Math.max(1,batchSize));
 if(reviewPlanOnly&&sharedBudget&&planPending.length&&fullPending.length
    &&existingCallFloor>=2&&planPending.length<=batchSize&&fullPending.length<=batchSize
    &&sharedBudget.remaining>=2){
   const makeSelection=(items:typeof pending):PremiseSelectionResult=>({...selection,selected:items,
     pool:selection.pool.filter(seed=>items.some(item=>item.premiseId===seed.premiseId))});
   const cases=[{kind:'full' as const,selection:makeSelection(fullPending)},
     {kind:'plan' as const,selection:makeSelection(planPending)}];
   const parts=await independentReviewBatches(cases,sharedBudget,2,async ({kind,selection:part},_index,budget)=>{
    if(kind==='full')return {selection:part,review:await review(part,budget)};
    const prior=planPending.map(item=>priorById.get(String(item.premiseId))!);
    const base=mergePremiseSourceBatches(part,prior.map(row=>row.selection),prior.map(row=>row.review));
    return {selection:part,review:await reviewPlanOnly(part,base,budget)};
   });
   const reused=hits.filter((row):row is Receipt=>!!row);
   const merged=mergePremiseSourceBatches(selection,[...reused,...parts].map(row=>row.selection),
     [...reused,...parts].map(row=>row.review));
   // The complete final source and payoff coverage is checked by the same
   // materializer as the ordinary route. Nothing is marked passed by default.
   return merged;
 }
 let fresh:Receipt|undefined;
 if(pending.length){
  const input=pending.length===selection.selected.length?selection:{...selection,selected:pending,
   pool:selection.pool.filter(seed=>pending.some(item=>item.premiseId===seed.premiseId))};
  fresh={selection:input,review:await review(input)};
  // Every memoized verdict is bound to this exact premise and source/standard.
  // Reuse a complete, evidenced rejection too: re-scoring the very same failed
  // input cannot remove its defect. Unknown/incomplete results are never memoized.
  if(!premiseSourceReviewIssues({sourceChecks:fresh.review.sourceChecks},input).length){
   for(let index=0;index<input.selected.length;index++){
    const receipt=singleReceipt(input,fresh.review,index),r=receipt.review;
    // Complete negative evidence must remain a rejection after memoization;
    // mismatched semantic flags, fabricated reasons and unknowns cannot enter.
    let sourceIssuesMatch=false;
    try{
     const materialized=materializePremiseSourceReview({sourceChecks:r.sourceChecks},receipt.selection).issues;
     const recorded=r.issues.filter(issue=>issue.kind==='source_drift');
     const same=(a:typeof recorded[number],b:typeof recorded[number])=>
       a.premiseId===b.premiseId&&a.referencePremiseId===b.referencePremiseId
       &&a.field===b.field&&a.quote===b.quote&&a.referenceQuote===b.referenceQuote&&a.reason===b.reason;
     sourceIssuesMatch=materialized.length===recorded.length&&materialized.every(issue=>recorded.some(row=>same(issue,row)));
    }catch{}
    const hasKnownFailure=!!r.sourceChecks?.some(row=>row.status==='drift')
      ||!!r.payoffChecks?.some(row=>row.status==='gap'||(row.links||[]).some(link=>link.status==='gap'))
      ||!!r.genreChecks?.some(row=>row.status==='missing')
      ||!!r.categoryChecks?.some(row=>row.status==='missing');
    if(r.passed===(r.issues.length===0) && r.passed===!hasKnownFailure
      && sourceIssuesMatch&&!premiseSelectionReviewIssues(r,receipt.selection).length
      &&r.sourceChecks?.every(row=>row.status!=='unknown')
      &&r.payoffChecks?.length===1
      &&!premisePayoffReviewIssues({payoffChecks:r.payoffChecks},receipt.selection).length
      &&r.payoffChecks.every(row=>row.status!=='unknown'&&(row.links||[]).every(link=>link.status!=='unknown'))
      &&!premiseGenreFitIssues({genreChecks:r.genreChecks},receipt.selection,requiredGenres).length
      &&!premiseCategoryFitIssues({categoryChecks:r.categoryChecks},receipt.selection).length
      &&(r.genreChecks||[]).every(row=>row.status!=='unknown')
      &&(r.categoryChecks||[]).every(row=>row.status!=='unknown'))
     receipts.set(key(input.selected[index]),structuredClone(receipt));
   }
  }
 }
 if(!hits.some(Boolean))return fresh!.review;
 const parts=hits.filter((entry):entry is Receipt=>!!entry);
 if(fresh)parts.push(fresh);
 return mergePremiseSourceBatches(selection,parts.map(part=>part.selection),parts.map(part=>part.review));
}
