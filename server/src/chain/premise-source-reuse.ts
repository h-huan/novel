import {type PremiseSelectionResult} from './idea-discovery-contract';
import {type PremiseSelectionReview, premiseSourceReviewIssues, premiseSelectionReviewIssues, materializePremiseSourceReview} from './premise-selection-review';
import {mergePremiseSourceBatches} from './premise-source-batches';
import {premisePayoffReviewIssues} from './premise-payoff-review';
import {premiseGenreFitIssues} from './premise-genre-fit';
import {premiseCategoryFitIssues} from './premise-category-fit';

type Receipt={selection:PremiseSelectionResult;review:PremiseSelectionReview};
/** Owned by one reconciliation only. Never persists or crosses discovery runs. */
export type PremiseSourceReceipts=Map<string,Receipt>;

function singleReceipt(selection:PremiseSelectionResult,review:PremiseSelectionReview,index:number):Receipt {
 const item=selection.selected[index],prefix=`S${index+1}.`;
 const rebind=(value:string)=>value.startsWith(prefix)?'S1.'+value.slice(prefix.length):value;
 const rows=(values:any[]|undefined)=>values?.filter(row=>row.ref.startsWith(prefix)).map(row=>Object.fromEntries(
  Object.entries(row).map(([key,value])=>[key,(key==='ref'||/EvidenceRef$/.test(key))&&typeof value==='string'?rebind(value)
   :key==='links'&&Array.isArray(value)?value.map(link=>({...link,ref:rebind(link.ref)})):value])));
 const issues=review.issues.filter(issue=>issue.premiseId===item.premiseId);
 return {selection:{...selection,selected:[item],pool:selection.pool.filter(seed=>seed.premiseId===item.premiseId)},
  review:{passed:issues.length===0,issues,sourceChecks:rows(review.sourceChecks),
   genreChecks:rows(review.genreChecks),categoryChecks:rows(review.categoryChecks),payoffChecks:rows(review.payoffChecks)} as PremiseSelectionReview};
}

/** Source/genre/category/payoff checks are local to one premise. Pairwise overlap
 * is deliberately not cached: changed cards must still be compared to retained cards. */
export async function reviewChangedPremiseSources(selection:PremiseSelectionResult,scope:string,
 receipts:PremiseSourceReceipts,review:(pending:PremiseSelectionResult)=>Promise<PremiseSelectionReview>,
 observe?:(counts:{reused:number;reviewed:number})=>void):Promise<PremiseSelectionReview> {
 const key=(item:PremiseSelectionResult['selected'][number])=>JSON.stringify({scope,item,
  seed:selection.pool.find(seed=>seed.premiseId===item.premiseId)});
 const requiredGenres=(()=>{try{const parsed=JSON.parse(scope);return Array.isArray(parsed?.requiredGenres)?parsed.requiredGenres as string[]:[];}catch{return [];}})();
 const hits=selection.selected.map(item=>receipts.get(key(item)));
 const pending=selection.selected.filter((_item,index)=>!hits[index]);
 observe?.({reused:selection.selected.length-pending.length,reviewed:pending.length});
 let fresh:Receipt|undefined;
 if(pending.length){
  const input=pending.length===selection.selected.length?selection:{...selection,selected:pending,
   pool:selection.pool.filter(seed=>pending.some(item=>item.premiseId===seed.premiseId))};
  fresh={selection:input,review:await review(input)};
  // The production reviewer validates all contracts before returning. Require a
  // complete, positive receipt as well; absent/failed/unknown receipts never reuse.
  if(!premiseSourceReviewIssues({sourceChecks:fresh.review.sourceChecks},input).length){
   for(let index=0;index<input.selected.length;index++){
    const receipt=singleReceipt(input,fresh.review,index),r=receipt.review;
    // Complete failed reviews are evidence, not passes: reuse the same rejection
    // only while the premise, source, standards and required genres are identical.
    // Never cache unknown, incomplete or contradictory review contracts.
    let sourceIssuesMatch=false;
    try{
     const materialized=materializePremiseSourceReview({sourceChecks:r.sourceChecks},receipt.selection).issues;
     const recorded=r.issues.filter(issue=>issue.kind==='source_drift');
     const same=(a:typeof recorded[number],b:typeof recorded[number])=>
       a.premiseId===b.premiseId&&a.referencePremiseId===b.referencePremiseId
       &&a.field===b.field&&a.quote===b.quote&&a.referenceQuote===b.referenceQuote&&a.reason===b.reason;
     sourceIssuesMatch=materialized.length===recorded.length&&materialized.every(issue=>recorded.some(row=>same(issue,row)));
    }catch{}
    if(sourceIssuesMatch&&!premiseSelectionReviewIssues(r,receipt.selection).length
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
