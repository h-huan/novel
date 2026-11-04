import {resolveQualityEvidence} from '../modules/writing-quality/quality-issue';
/** Same condition coverage for short and long preflight; unknown never passes. */
export function chapterConditionReviewIssues(value:any,plan:any[],sources:string,resolveAnchors:false|((check:any)=>boolean)=false,requireExitState=false):string[]{
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
   ||(check.status==='supported'&&!(Array.isArray(check.bridgeAnchorIds)?typeof resolveAnchors==='function'&&resolveAnchors(check)
    :check.bridgeSource==='body'&&resolveQualityEvidence(JSON.stringify({chapterResponsibilities:plan.slice(0,check.chapter).map(({exitState:_result,...actions}:any)=>actions)}),check.bridgeEvidence).verified));
 })?['逐章条件核对缺少取得路径、有效性证据或完整覆盖；supported需要当前计划的实际取得路径，不能只引用世界规则']:[];
}

/** Resolve actual server-owned addresses against the current/past action view.
 * A model flag, a future chapter, or an exit/result assertion cannot grant proof. */
export function chapterConditionBridgeAnchorsVerified(check:any,plan:any[],byId:ReadonlyMap<string,{source:string;text:string;path?:string}>,sources:string):boolean{
 const chapter=Number(check?.chapter);
 if(!Number.isInteger(chapter)||chapter<1||chapter>plan.length||!Array.isArray(check?.bridgeAnchorIds))return false;
 const picked=check.bridgeAnchorIds.map((id:unknown)=>typeof id==='string'?byId.get(id):undefined);
 const action=(anchor:any)=>{
  if(anchor?.source!=='body')return false;
  const task=/^chapter:c([1-9]\d*):task$/.exec(anchor.id||'');
  const field=/^chapterResponsibilities\.(\d+)\.responsibility$/.exec(anchor.path||'');
  const index=task?Number(task[1])-1:field?Number(field[1]):-1;
  return index>=0&&index<chapter&&anchor.text===plan[index]?.responsibility;
 };
 const allowedBody=JSON.stringify({chapterResponsibilities:plan.slice(0,chapter).map(({exitState:_result,...actions}:any)=>actions)});
 return picked.some(action)&&picked.every((anchor:any)=>{
  if(!anchor)return false;
  if(anchor.source!=='body')return resolveQualityEvidence(sources,anchor.text).verified;
  const task=/^chapter:c([1-9]\d*):task$/.exec(anchor.id||'');
  const field=/^chapterResponsibilities\.(\d+)\.(title|function|responsibility|prerequisites(?:\.\d+)?|timeline)$/.exec(anchor.path||'');
  const index=task?Number(task[1])-1:field?Number(field[1]):-1;
  return index>=0&&index<chapter&&resolveQualityEvidence(allowedBody,anchor.text).verified;
 });
}
