export interface IdeaScopeAllocationPlan {
  plannedChapters: number;
  stages: Array<{position:number;arc:string}>;
}

export function ideaScopeAllocationRepairPlan(card: Record<string, any>): IdeaScopeAllocationPlan | undefined {
  const total=Number(card.plannedChapters),stages=card.scopeBreakdown;
  if(!Number.isInteger(total)||total<=0||!Array.isArray(stages)||!stages.length||stages.length>total
    ||stages.some(stage=>!stage||typeof stage!=='object'||!stage.arc||!stage.reason))return;
  const counts=stages.map(stage=>Number(stage.chapters));
  if(counts.every(count=>Number.isInteger(count)&&count>0)&&counts.reduce((a,b)=>a+b,0)===total)return;
  return {plannedChapters:total,stages:stages.map((stage,index)=>({position:index+1,arc:String(stage.arc)}))};
}

/** Correct only the provable ordinal/count mix-up. No proportional guessing. */
export function bindUniqueIdeaScopeAllocation<T extends Record<string, any>>(card:T):T {
  const plan=ideaScopeAllocationRepairPlan(card);
  if(!plan||plan.stages.length!==plan.plannedChapters)return card;
  const stages=card.scopeBreakdown as Array<Record<string,any>>;
  if(!stages.every((stage,index)=>Number(stage.chapters)===index+1))return card;
  // Explicit prose chapter allocations require authoring/semantic review rather
  // than silently changing the numbers while leaving contrary narrative text.
  if(stages.some(stage=>['arc','reason','outcome'].some(key=>typeof stage[key]==='string'&&stage[key].includes('章'))))return card;
  return {...card,scopeBreakdown:stages.map(stage=>({...stage,chapters:1}))};
}

/** Counts are the sole editable values; total, events, order and identity freeze. */
export function applyIdeaScopeAllocation(card:Record<string,any>,counts:unknown,plan:IdeaScopeAllocationPlan):Record<string,any>{
  const stages=card.scopeBreakdown;
  if(Number(card.plannedChapters)!==plan.plannedChapters||!Array.isArray(stages)||stages.length!==plan.stages.length
    ||stages.some((stage,index)=>String(stage.arc)!==plan.stages[index].arc))throw Error('章节分配修复上下文已变化，不能套用旧位置');
  if(!Array.isArray(counts)||counts.length!==stages.length||counts.some(n=>!Number.isInteger(n)||n<=0)
    ||counts.reduce((a,b)=>a+b,0)!==plan.plannedChapters)throw Error('scopeAllocation须按原阶段顺序提供正整数组成的数量数组，合计等于冻结总章数');
  return {...card,scopeBreakdown:stages.map((stage,index)=>({...stage,chapters:counts[index]}))};
}
