import {presentationGateIssues} from './idea-presentation-review';
/** Only independently verified reduction in blocked dimensions justifies
 * another patch to the same card. Wording changes are not progress. */
export function discoveryFailureDimensions(assessment:any):string[]{
 const review=assessment?.presentationReview,dimensions:string[]=[];
 for(const key of ['titleCompelling','openingCompelling','distinctFromBatch','storyCoherent','payoffCredible','platformFit'])
  if(review?.[key]===false)dimensions.push(key);
 for(const [key,value] of Object.entries(review?.readerGoals||{}))if((value as any)?.status!=='supported')dimensions.push('readerGoals.'+key);
 // Keep deterministic failures too; do not call a card improved by hiding a
 // configuration/shape failure behind an otherwise positive semantic review.
 const semanticIssues=new Set(presentationGateIssues(review));
 for(const issue of assessment?.issues||[])if(typeof issue==='string'&&!semanticIssues.has(issue))dimensions.push(issue);
 return [...new Set(dimensions)].sort();
}
export function discoveryFailureImproved(before:any,after:any){
 if(after?.passed===true)return true;
 const prior=discoveryFailureDimensions(before),next=discoveryFailureDimensions(after);
 return prior.length>0&&next.length<prior.length&&next.every(key=>prior.includes(key));
}

/** Completion is governed by remaining work and shared allowances, not rounds.
 * The caller owns all model calls and immutable accepted cards. */
export async function fulfillDiscoveryGaps(options:{
 missing:()=>string[];hasCard:(id:string)=>boolean;canRepair:(ids:string[])=>boolean;
 repair:(ids:string[])=>Promise<string[]>;canReplace:()=>boolean;
 replace?:(id:string)=>Promise<'replaced'|'rejected'|'unavailable'>;
 replaceBatch?:(ids:string[])=>Promise<'replaced'|'rejected'|'unavailable'>;
 fingerprint:()=>string;repairScope?:(id:string)=>string;
 onError?:(phase:'repair'|'replace',error:unknown)=>void;
}){
 const stalled=new Set<string>();
 const key=(id:string)=>JSON.stringify([id,options.repairScope?.(id)||'story']);
 let replacementCursor=0;
 while(options.missing().length){
  const before=options.fingerprint(),stalledBefore=stalled.size,missing=options.missing();
  const patchable=missing.filter(id=>!stalled.has(key(id))&&options.hasCard(id));
  if(patchable.length&&options.canRepair(patchable)){
   const repairKeys=new Map(patchable.map(id=>[id,key(id)]));
   let improved=new Set<string>();
   try { improved=new Set(await options.repair(patchable)); }
   catch(error) { options.onError?.('repair',error); }
   for(const id of patchable)if(!improved.has(id))stalled.add(repairKeys.get(id)!);
  }else{
   if(!options.canReplace())return 'budget_or_original_pool_exhausted';
   let outcome:'replaced'|'rejected'|'unavailable'='rejected';
   try {
    if(options.replaceBatch)outcome=await options.replaceBatch(missing);
    else if(options.replace)outcome=await options.replace(missing[replacementCursor++%missing.length]);
    else throw Error('缺额补齐未配置换选入口');
   }
   catch(error) { options.onError?.('replace',error); }
   if(outcome==='unavailable')return 'budget_or_original_pool_exhausted';
   // A rejected preselection consumes its identity/allowance but never creates
   // a complete card. Try a different original-pool candidate if affordable.
  }
  if(options.missing().length&&before===options.fingerprint()&&stalled.size===stalledBefore)return 'no_material_progress';
 }
 return 'requested_quantity_verified';
}
