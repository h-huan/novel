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

/** A second same-premise patch cannot fix an unchanged structural chapter/
 * differentiation deficit if its earlier verified local repair already left
 * precisely that same deterministic gate and all independent story verdicts
 * are sound. In this case compare a DIFFERENT, original-pool candidate with
 * the same independent gates, provided the caller can afford review. */
export function persistentStructureDeficitRequiresReplacement(
  assessments:readonly any[], premiseId:string
):boolean {
 const history=assessments.filter(a=>String(a?.sourcePremiseId)===premiseId);
 if(history.length<2)return false;
 const latest=history[history.length-1], previous=history[history.length-2];
 const reason='结构化题材的差异化与阶段推进同时不足，不能作为合格卡交付';
 const review=latest?.presentationReview;
 if(latest?.attempt!=='repair'||latest?.passed===true
   ||!Array.isArray(latest?.issues)||latest.issues.length!==1
   ||latest.issues[0]!==reason||!Array.isArray(previous?.issues)
   ||!previous.issues.includes(reason)||!review)return false;
 if(!['titleCompelling','openingCompelling','distinctFromBatch','storyCoherent','payoffCredible','platformFit']
   .every(key=>review[key]===true)||review.issues?.length)return false;
 const goals=review.readerGoals;
 return !!goals&&['click','completion','sharing','immersion']
   .every(key=>goals[key]?.status==='supported');
}

/** An explicitly evidenced intrinsic audience limitation cannot be changed by
 * wording-only edits of an immutable premise. It must compete as another
 * original-pool candidate under the same independent source, overlap and
 * presentation gates. Other sharing weaknesses are still repairable. */
export function readerGoalDeficitRequiresNewPremise(assessment:any):boolean{
 const review=assessment?.presentationReview;
 if(!review||!Array.isArray(review.issues)||review.issues.length) return false;
 if(!['titleCompelling','openingCompelling','distinctFromBatch','storyCoherent','payoffCredible','platformFit']
   .every(key=>review[key]===true))return false;
 const goals=review.readerGoals;
 if(!goals||goals.sharing?.status!=='weak'||!['click','completion','immersion'].every(key=>goals[key]?.status==='supported'))return false;
 // Independently true semantics are insufficient if the same card also fails
 // any deterministic Gate: that local defect must remain eligible for repair.
 const failures=discoveryFailureDimensions(assessment);
 if(failures.length!==1||failures[0]!=='readerGoals.sharing')return false;
 const reason=String(goals.sharing?.reason||'');
 // The observed rejection explicitly says that the specific genre's narrow
 // institutional setting limits shareability. Do not generalize to every weak
 // sharing goal; a missing relatable hook can be repaired in the same card.
 return /(?:题材|类型|门派|流派|设定|背景|规则|细节)/.test(reason)
   && /(?:较窄|小众|不如.+普适|受众.+狭窄|传播面.+窄)/.test(reason);
}

/** Fit only the positions that can each pay for generation AND the unchanged independent card review. 
 * Never stop a batch of two just because current budget covers only one. */
export function affordableIdeaReplacementCount(missing:number,pool:number,calls:number,reviewCalls:(count:number)=>number):number{
 for(let n=Math.min(missing,pool);n>=1;n--){if(calls>=n+reviewCalls(n))return n;}
 return 0;
}

/** Completion is governed by remaining work and shared allowances, not rounds.
 * The caller owns all model calls and immutable accepted cards. */
export async function fulfillDiscoveryGaps(options:{
 missing:()=>string[];hasCard:(id:string)=>boolean;canRepair:(ids:string[])=>boolean;
 repair:(ids:string[])=>Promise<string[]>;canReplace:()=>boolean;
 replace?:(id:string)=>Promise<'replaced'|'rejected'|'unavailable'>;
 replaceBatch?:(ids:string[])=>Promise<'replaced'|'rejected'|'unavailable'>;
 fingerprint:()=>string;repairScope?:(id:string)=>string;repairEligible?:(id:string)=>boolean;
 onError?:(phase:'repair'|'replace',error:unknown)=>void;
}){
 const stalled=new Set<string>();
 const key=(id:string)=>JSON.stringify([id,options.repairScope?.(id)||'story']);
 let replacementCursor=0;
 while(options.missing().length){
  const before=options.fingerprint(),stalledBefore=stalled.size,missing=options.missing();
  const patchable=missing.filter(id=>!stalled.has(key(id))&&options.hasCard(id)&&(options.repairEligible?.(id)??true));
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
