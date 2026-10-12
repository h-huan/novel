import { temporalNumbers } from './temporal-review-coverage';
/** A numeric mention elsewhere in the outline is not the current timer baseline. */
function currentCountdownBases(text: string): number[] {
  const numbers = temporalNumbers(text);
  const quantities = [
    ...numbers.durations.filter(q => q.operator === 'eq' && !q.minuteBounds).map(q => ({ original: q.original, seconds: q.minutes * 60 })),
    ...numbers.countdowns.map(q => ({ original: q.original, seconds: q.seconds })),
  ];
  return quantities.filter(q => {
    const escaped = q.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Restrict the connection to an explicit display/remaining-value statement;
    // do not match a retrospective window such as “倒推出24小时里的记录”.
    return new RegExp('(?:倒计时(?:显示|还剩|剩余|剩|还有|为|是|初值为|当前值为|仅剩|只有|：|:|\\s)*' + escaped + '|' + escaped + '\\s*(?:的)?倒计时)').test(text);
  }).map(q => q.seconds);
}
export function chapterTimePlanRequest(outline: string, context: string) {
  if(!/倒计时/.test(outline)) return null;
  // A mention alone is not a computable timer. Existing semantic review still owns it.
  const bases = currentCountdownBases(outline);
  if(!bases.length) return null;
  return '为本章生成候选时间计划，尚未写入故事资料。只按当前章纲安排事件，不改变已确认期限、日期、时钟与先后关系，不消费后章事件。返回JSON {"timers":[{"id":"计时对象","basisEvidence":"章纲中包含倒计时或期限及数值的连续逐字引文","initialSeconds":'+bases[0]+',"steps":[{"eventEvidence":"章纲中该事件的连续逐字引文","elapsedSeconds":0}]}]}。initialSeconds是本章有精确依据的起点剩余秒数，不是整个故事最初总期限。示例值取自当前章纲可定位的精确倒计时，仅对应其引用对象；每个对象仍须逐字来源。elapsedSeconds是从本章计时基线累计经过的秒数。已有精确时间必须沿用；章纲未写死的间隔可作为本次创作候选安排，不冒充已确认事实。只选需要正文呈现的关键节点，正常动作、对白不逐句计时。不能重置计时器；同一计时器节点依次递增且不超过期限。程序负责计算剩余读数，正文禁止自造第二套数字；不要求正文展示计划、算式或额外解释。资料冲突或无法形成计划时返回{"timers":[],"reason":"具体缺口"}。\n【当前章纲】\n'+outline+'\n【当前写作上下文】\n'+context;
}
export function validateChapterTimePlan(value: any, outline: string) {
  if(!Array.isArray(value?.timers)||!value.timers.length||value.timers.length>12) throw new Error('生成前时间计划未完成：'+(value?.reason||'缺少可计算的计时对象'));
  const ids=new Set<string>();
  return value.timers.map((timer:any)=>{
    if(typeof timer.id!=='string'||!timer.id.trim()||ids.has(timer.id)) throw new Error('时间计划计时对象重复或无效');ids.add(timer.id);
    if(typeof timer.basisEvidence!=='string'||!timer.basisEvidence.trim()||!outline.includes(timer.basisEvidence)) throw new Error('时间计划期限来源不能定位当前章纲');
    const bases=currentCountdownBases(timer.basisEvidence);
    if(!Number.isInteger(timer.initialSeconds)||timer.initialSeconds<=0||!bases.some(n=>Math.abs(n-timer.initialSeconds)<1e-7)) throw new Error('时间计划初值与章纲期限不符');
    if(!Array.isArray(timer.steps)||!timer.steps.length||timer.steps.length>12) throw new Error('时间计划缺少关键事件');
    let previous=-1;const seen=new Set<string>();
    const steps=timer.steps.map((step:any)=>{
      if(typeof step.eventEvidence!=='string'||!step.eventEvidence.trim()||!outline.includes(step.eventEvidence)||seen.has(step.eventEvidence)) throw new Error('时间计划事件无来源或重复');seen.add(step.eventEvidence);
      if(!Number.isInteger(step.elapsedSeconds)||step.elapsedSeconds<0||step.elapsedSeconds<previous||step.elapsedSeconds>timer.initialSeconds) throw new Error('时间计划经过时长倒退、越过期限或无效');previous=step.elapsedSeconds;
      const remainingSeconds=timer.initialSeconds-step.elapsedSeconds;
      const display=[Math.floor(remainingSeconds/3600),Math.floor(remainingSeconds%3600/60),remainingSeconds%60].map(n=>String(n).padStart(2,'0')).join(':');
      return {eventEvidence:step.eventEvidence,elapsedSeconds:step.elapsedSeconds,remainingSeconds,display};
    });
    return {id:timer.id,basisEvidence:timer.basisEvidence,initialSeconds:timer.initialSeconds,steps};
  });
}
export function chapterTimePlanDirective(plan: ReturnType<typeof validateChapterTimePlan>) {
  return '\n\n【本次候选时间计划·程序计算】\n'+JSON.stringify(plan)+'\n这是本次创作候选，不覆盖已确认故事事实。生成、扩写和复检共用；需要精确倒计时读数时消费对应节点，不自造其他读数。每次显示新读数前，先确认读数属于哪个事件，与前一读数之间的实际经过是否成立；未计划的细碎显示用自然概述，不随机编造秒数。计划节点不要求正文全部显示：即使计划有精确读数，正文也须有独立的钟点、经过时长或有效上下界支持；只靠两次读数相减不能证明实际经过。无法在真实场景里自然提供独立边界时，改用倒计时仍在减少等自然概述，保留时限压力，不为精确数字补解释或凑报时。必要钟点或经过时长可通过人物正常看表、订单记录、行程交代自然呈现，不要求逐步报时。回溯送达时刻不等于首次看见倒计时的时刻，除非本章确实写明同一事件；不得为绑定核算偷换触发点。正文不展示计划或算式，不为核算堆解释。最终仍按正文及当前资料核对真实经过时长、身份、边界和上下界。';
}

/** These are consumption risks, not proof that every seconds display is a timer defect. */
export function unplannedChapterTimeDisplays(content:string,plan:ReturnType<typeof validateChapterTimePlan>) {
  const permitted=new Set<number>(plan.flatMap((timer:any)=>[timer.initialSeconds,...timer.steps.map((step:any)=>step.remainingSeconds)]));
  return [...new Set(temporalNumbers(content).countdowns.filter(read=>!permitted.has(read.seconds)).map(read=>read.original))];
}

/** Being present in a candidate plan does not prove elapsed time in the actual prose. */
export function chapterTimeDisplaysForEvidenceReview(content:string,plan:ReturnType<typeof validateChapterTimePlan>) {
 const initial=new Set(plan.map((timer:any)=>timer.initialSeconds));
 return [...new Set(temporalNumbers(content).countdowns.filter((read,index)=>index!==0||!initial.has(read.seconds)).map(read=>read.original))];
}
