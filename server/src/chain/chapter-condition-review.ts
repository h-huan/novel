import {resolveQualityEvidence} from '../modules/writing-quality/quality-issue';
/** Server binding is limited to an explicitly cited known chapter.
 * Never manufacture a check/status/bridge or replace a contradictory quote.
 * The semantic reviewer still must cover every chapter and provide an actual
 * acquisition action (or a real gap) to get through the unchanged Gate. */
export function materializeChapterConditionSources(value:any,plan:readonly any[]):any{
 if(!value||!Array.isArray(value.conditionChecks))return value;
 return {...value,conditionChecks:value.conditionChecks.map((row:any)=>{
  if(!row||typeof row!=='object'||!Number.isInteger(row.chapter)||row.chapter<1||row.chapter>plan.length)return row;
  const source=plan[row.chapter-1];
  return {...row,
   // A chapter number uniquely binds the immutable task and exit fields:
   // their text is a source projection, NOT a separate model judgment.
   // A wrong supplied quote or an invalid supplied anchor remains an error.
   ...(row.taskEvidence===undefined
      &&(row.taskAnchorId===undefined||row.taskAnchorId===`chapter:c${row.chapter}:task`)
     ?{taskEvidence:source.responsibility}:{}),
   ...(row.exitStateEvidence===undefined
      &&(row.exitStateAnchorId===undefined||row.exitStateAnchorId===`chapter:c${row.chapter}:exit`)
     ?{exitStateEvidence:source.exitState}:{})};
 })};
}

/** Reuse one exact source directory across the short and long preflight paths. */
export function chapterConditionTaskAnchors(plan:readonly any[]){
 return plan.map((row:any)=>({
  id:`chapter:c${row.chapter}:task`,source:'body',text:String(row.responsibility||''),
 }));
}

const CONDITION_ERROR='逐章条件核对缺少取得路径、有效性证据或完整覆盖；supported需要当前计划的实际取得路径，不能只引用世界规则';

/** Same fail-closed semantic contract for short and long preflight. Keep a
 * precise per-chapter reason so the EXISTING validation retry can correct
 * transport errors instead of repeating an opaque entire-plan rejection. */
export function chapterConditionReviewIssues(value:any,plan:any[],sources:string,
 resolveAnchors:false|((check:any)=>boolean)=false,requireExitState=false):string[]{
 const checks=value?.conditionChecks;
 if(!Array.isArray(checks))return [CONDITION_ERROR,'conditionChecks不是逐章数组，须每章恰好一项'];
 const details:string[]=[];
 if(checks.length!==plan.length)details.push(`conditionChecks数量${checks.length}，预期${plan.length}（缺失或多出章节）`);
 const seen=new Set<number>();
 for(const check of checks){
  const n=check?.chapter;
  if(!Number.isInteger(n)||n<1||n>plan.length){
   details.push(`conditionChecks中出现无效章号${String(n)}`);continue;
  }
  if(seen.has(n))details.push(`第${n}章conditionChecks重复`);
  seen.add(n);
  const chapter=plan[n-1];
  if(!resolveQualityEvidence(chapter.responsibility,check.taskEvidence).verified)
   details.push(`第${n}章taskEvidence未逐字对应本章responsibility或taskAnchorId不合法`);
  if(requireExitState&&!resolveQualityEvidence(chapter.exitState,check.exitStateEvidence).verified)
   details.push(`第${n}章exitStateEvidence未逐字对应完整exitState`);
  if(typeof check.reason!=='string'||check.reason.trim().length<8)
   details.push(`第${n}章缺少实际条件取得和出口结果的解释`);
  if(!['supported','gap','not_required'].includes(check.status))
   details.push(`第${n}章conditionChecks.status必须是supported、gap或not_required`);
  // A missing acquisition action is a real planning gap even when it does
  // not violate a frozen CR rule. The caller must route every gap into the
  // existing plan repair, never upgrade it to a passed audit.
  if(check.status==='supported'){
   const valid=Array.isArray(check.bridgeAnchorIds)
    ?typeof resolveAnchors==='function'&&resolveAnchors(check)
    :(check.bridgeSource===undefined||check.bridgeSource==='body')
      &&resolveQualityEvidence(JSON.stringify({
        chapterResponsibilities:plan.slice(0,n).map(({responsibility}:any)=>({responsibility}))
      }),check.bridgeEvidence).verified;
   if(!valid)details.push(`第${n}章supported缺少当前或前章responsibility中已执行的条件取得动作；prerequisites、未来任务、exitState结果与世界许可本身均不构成行动证据`);
  }
 }
 for(let n=1;n<=plan.length;n++)if(!seen.has(n))details.push(`第${n}章缺少conditionChecks`);
 return details.length?[CONDITION_ERROR,...details]:[];
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

/** Planning gaps are blocking repair inputs, not fabricated CR violations.
 * Structural validation happens in chapterConditionReviewIssues; the project
 * creation caller must reject these even when contradictions is empty. */
export function chapterConditionPlanningGapIssues(value:any,plan:readonly any[]):string[]{
 if(!Array.isArray(value?.conditionChecks))return [];
 return value.conditionChecks.filter((check:any)=>check?.status==='gap'
   &&Number.isInteger(check.chapter)&&check.chapter>=1&&check.chapter<=plan.length)
  .map((check:any)=>{
   const original=plan[check.chapter-1];
   return `第${check.chapter}章条件取得缺口：${String(check.reason||'').trim()}；当前规划动作：${String(original?.responsibility||'').trim()}；预定出口：${String(original?.exitState||'').trim()}。须在本章或有效前章规划可执行的取得动作，不能凭出口断言自证。未建立的独立结果不得提前兑现。`;
  });
}
