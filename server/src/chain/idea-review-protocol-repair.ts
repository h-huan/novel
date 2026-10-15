import {fictionNarrativeText} from '../../shared/src/fiction-naming';
import {readerGoalReviewIssues,READER_GOAL_LABELS} from './reader-goal-review';
import {targetIdeaReviews,presentationReviewIssues} from './idea-presentation-review';
import {ideaReviewEvidenceReferenceIssues,ideaPayoffBridgeIssues,resolveIdeaReviewEvidence,ideaReviewEvidenceCatalog} from './idea-review-evidence';

/** Reuse the existing single protocol correction, retaining every valid judgment. */
export function ideaReaderGoalRepairPlan(value:any,cards:readonly any[],references:readonly any[]=[]){
 const base=targetIdeaReviews(value,cards,references);
 const resolved=resolveIdeaReviewEvidence(base,cards);
 if(!Array.isArray(resolved?.reviews))return null;
 const withoutGoals={reviews:resolved.reviews.map(({readerGoals,...rest}:any)=>rest)};
 if(presentationReviewIssues(withoutGoals,cards).length||ideaPayoffBridgeIssues(base,cards).length
  ||ideaReviewEvidenceReferenceIssues(base,cards).some(error=>!error.includes('readerGoals.')))return null;
 const targets:{position:number;key:string;previous:any}[]=resolved.reviews.flatMap((row:any)=>{
  const errors=readerGoalReviewIssues(row.readerGoals,fictionNarrativeText(cards[row.position-1]));
  return Object.keys(READER_GOAL_LABELS).filter(key=>errors.some(error=>error.startsWith(key+'（')))
   .map(key=>({position:row.position,key,previous:base.reviews.find((item:any)=>item.position===row.position)?.readerGoals?.[key]}));
 });
 if(!targets.length)return null;
 const positions=new Set(targets.map(target=>target.position));
 return {base,targets,prompt:'只补正点名的readerGoals协议项，不重新审整批，不改故事或其它判断。'
  +'原有效status、reason必须原样保留；缺失状态须按实际故事判断，不能从错误字段名推定通过。'
  +'每项返回status(supported|weak|unknown)、本卡evidenceRef、至少8字reason；真实薄弱处保持weak/unknown。'
  +'\n【待补正固定位置】'+JSON.stringify(targets)
  +'\n【这些卡的完整故事证据目录】'+JSON.stringify(ideaReviewEvidenceCatalog(cards).filter(row=>positions.has(row.position)))
  +'\n只输出JSON:{"goalPatches":[{"position":实际位置,"key":"点名项","item":{"status":"supported|weak|unknown","evidenceRef":"本卡编号","reason":"具体理由"}}]}。每个点名项恰好一条，其它项不返回。'};
}
export function applyIdeaReaderGoalRepair(plan:NonNullable<ReturnType<typeof ideaReaderGoalRepairPlan>>,value:any){
 const patches=value?.goalPatches;
 if(!Array.isArray(patches)||patches.length!==plan.targets.length)throw Error('阅读目标补正须恰好覆盖点名位置，不返回整批reviews');
 const seen=new Set<string>();const next=structuredClone(plan.base);
 for(const patch of patches){
  const target=plan.targets.find(row=>row.position===patch?.position&&row.key===patch?.key);
  const key=patch?.position+':'+patch?.key;
  if(!target||seen.has(key)||!patch.item||typeof patch.item!=='object'||Array.isArray(patch.item))throw Error('阅读目标补正位置未知、重复或缺少item');
  seen.add(key);
  const before=target.previous;
  if(before&&['supported','weak','unknown'].includes(before.status)&&patch.item.status!==before.status)
   throw Error('协议补正不能改变原有效阅读目标状态');
  if(typeof before?.reason==='string'&&before.reason.trim().length>=8&&patch.item.reason!==before.reason)
   throw Error('协议补正不能改写原有效阅读目标理由');
  next.reviews.find((row:any)=>row.position===target.position).readerGoals={
   ...next.reviews.find((row:any)=>row.position===target.position).readerGoals,[target.key]:patch.item};
 }
 return next;
}
