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

/** Bind a supported verdict to an actual prior/current chapter task anchor when
 * the reviewer names the acquisition in prose but omits the address. This is a
 * transport binding, not a new verdict: the reviewer already said supported and
 * the matched chapter responsibility must contain the cited phrase. */
function namedChapterNumbers(reason: string): number[] {
  const chinese: Record<string, number> = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
  const result: number[] = [];
  for (const match of reason.matchAll(/第\s*([0-9一二三四五六七八九十]+)\s*章/g)) {
    const raw = match[1];
    const value = /^\d+$/.test(raw) ? Number(raw) : chinese[raw];
    if (Number.isInteger(value) && value > 0) result.push(value);
  }
  return [...new Set(result)];
}

function acquisitionPhrase(reason: string, responsibility: string): string | null {  const clean = (value: string) => value.replace(/[，。；、,.!?！？:：\s"'“”‘’（）()]/g, '');
  const source = clean(reason);
  const target = clean(responsibility);
  if (!source || !target) return null;
  const stop = new Set(['本章', '前章', '当前', '已经', '实际', '完成', '结果', '条件', '行动', '责任', '规划', '有效', '证明', '取得', '缺口', '评审', '未给', '对应', '需要', '可以', '不能', '本章或前章', '当前或前章', '当时', '状态', '既定', '延续', '解释', '原文', '正文', '字段', '章纲', '动作', '操作', '成立', '没有', '第二', '一件', '外部', '独立', '锚点', '反应', '内在', '克制']);
  for (let length = Math.min(8, source.length); length >= 2; length--) {
    for (let start = 0; start + length <= source.length; start++) {
      const phrase = source.slice(start, start + length);
      if (stop.has(phrase)) continue;
      if (target.includes(phrase)) return phrase;
    }
  }
  return null;
}

/** A "supported" row that provides no executed acquisition action is not proof.
 * Downgrade it to gap (in place) so the existing plan-repair path handles it,
 * instead of failing the whole creation on one reviewer omission. If the reason
 * explicitly names an acquisition already in a prior/current responsibility, bind
 * that chapter's real task anchor instead of downgrading a truthful verdict.
 * Structural errors (bad chapter number/status) are left untouched so they still retry. */
export function coerceUnprovenConditionChecks(value:any,plan:any[],sources:string,
 resolveAnchors:false|((check:any)=>boolean)=false,requireExitState=false):any{
 if(!value||typeof value!=='object'||!Array.isArray(value.conditionChecks))return value;
 let coerced=false;
 for(const check of value.conditionChecks){
  if(!check||typeof check!=='object'||check.status!=='supported')continue;
  const n=check.chapter;
  if(!Number.isInteger(n)||n<1||n>plan.length)continue;
  const valid=Array.isArray(check.bridgeAnchorIds)
   ?typeof resolveAnchors==='function'&&resolveAnchors(check)
   :(check.bridgeSource===undefined||check.bridgeSource==='body')
     &&resolveQualityEvidence(JSON.stringify({
       chapterResponsibilities:plan.slice(0,n).map(({responsibility}:any)=>({responsibility}))
     }),check.bridgeEvidence).verified;
  if(valid)continue;
  let bound=false;
  if(!Array.isArray(check.bridgeAnchorIds)||!check.bridgeAnchorIds.length){
   const named=namedChapterNumbers(String(check.reason||''))
     .filter(chapter=>chapter>=1&&chapter<=n)
     .map(chapter=>chapter-1);
   const candidates=[...named,...Array.from({length:n},(_,i)=>n-1-i)];
   for(const index of [...new Set(candidates)]){
    if(bound)break;
    const phrase=acquisitionPhrase(String(check.reason||''),String(plan[index]?.responsibility||''));
    if(!phrase)continue;
    check.bridgeAnchorIds=[`chapter:c${index+1}:task`];
    check.bridgeEvidence=String(plan[index]?.responsibility||'');
    bound=typeof resolveAnchors!=='function'||resolveAnchors(check);
   }
  }
  if(bound)continue;
  check.status='gap';
  check.reason=((typeof check.reason==='string'&&check.reason.trim())?check.reason.trim()+' | ':'')
   +'评审未给出当前或前章已执行的条件取得动作，按未证明缺口进入规划修复';
  coerced=true;
 }
 if(coerced&&value.consistent===true)value.consistent=false;
 return value;
}

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
