import {resolveQualityEvidence} from '../modules/writing-quality/quality-issue';
/** Same condition coverage for short and long preflight; unknown never passes. */
export function chapterConditionReviewIssues(value:any,plan:any[],sources:string,allowResolvedAnchors=false,requireExitState=false):string[]{
 const contradictions=Array.isArray(value?.contradictions)?value.contradictions:[];
 const checks=value?.conditionChecks;
 if(!Array.isArray(checks)||checks.length!==plan.length||new Set(checks.map((row:any)=>row?.chapter)).size!==plan.length)return ['逐章条件核对缺少取得路径、有效性证据或完整覆盖'];
 return checks.some((check:any)=>{
  const chapter=plan[Number(check?.chapter)-1];
  return !Number.isInteger(check?.chapter)||!chapter
   ||!resolveQualityEvidence(chapter.responsibility,check.taskEvidence).verified
   ||(requireExitState&&!resolveQualityEvidence(chapter.exitState,check.exitStateEvidence).verified)
   ||typeof check.reason!=='string'||check.reason.trim().length<8
   ||!['supported','gap','not_required'].includes(check.status)
   ||(check.status==='gap'&&!contradictions.some((finding:any)=>finding.chapter===check.chapter))
   ||(check.status==='supported'&&!(Array.isArray(check.bridgeAnchorIds)?allowResolvedAnchors&&check.anchoredBridgeVerified===true
    :check.bridgeSource==='body'&&resolveQualityEvidence(JSON.stringify({chapterResponsibilities:plan.slice(0,check.chapter).map(({exitState:_result,...actions}:any)=>actions)}),check.bridgeEvidence).verified));
 })?['逐章条件核对缺少取得路径、有效性证据或完整覆盖；supported需要当前计划的实际取得路径，不能只引用世界规则']:[];
}
