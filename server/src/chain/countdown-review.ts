/** Relation is between each clock event and its corresponding timer observation. */
export function countdownConstraintFromRelations(start:string,end:string):'eq'|'ge'|'le'|null {
 if(start==='at_reading'&&end==='at_reading')return 'eq';
 if(['before_reading','at_reading'].includes(start)&&['after_reading','at_reading'].includes(end))return 'le';
 if(['after_reading','at_reading'].includes(start)&&['before_reading','at_reading'].includes(end))return 'ge';
 return null;
}
/** Approximate duration bounds share one compatibility calculation with clock and timer review. */
export function durationMatchesInterval(quantity:{minutes:number;minuteBounds?:{min:number;max:number};operator:string},min:number,max:number):boolean|null {
 const bounds=quantity.minuteBounds||{min:quantity.minutes,max:quantity.minutes};
 switch(quantity.operator){
  case 'eq':return max>=bounds.min-1e-9&&min<=bounds.max+1e-9;
  case 'lt':return min<bounds.max-1e-9;
  case 'le':return min<=bounds.max+1e-9;
  case 'gt':return max>bounds.min+1e-9;
  case 'ge':return max>=bounds.min-1e-9;
  default:return null;
 }
}
type Entry = {id:string; evidence:string; durations?:Array<{original:string;minutes:number;minuteBounds?:{min:number;max:number};operator:string}>; clocks:Array<{id?:string;original:string;minutes:number;minuteOptions?:number[];minuteBounds?:{min:number;max:number}}>; digitalClocks?:Array<{id:string;original:string;minutes:number;minuteOptions:number[];precisionSeconds:number;readingIndex:number}>; countdowns?:Array<{original:string;seconds:number}>};
/** Shared clock intervals, preserving both ambiguous phases and explicit approximate wording. */
export function clockElapsedIntervals(start:{minutes:number;minuteOptions?:number[];minuteBounds?:{min:number;max:number}},end:typeof start,dayDifference=0) {
  const intervals=(clock:typeof start)=>(clock.minuteOptions||[clock.minutes]).map(value=>{
    const offset=value-clock.minutes;
    return clock.minuteBounds?{min:clock.minuteBounds.min+offset,max:clock.minuteBounds.max+offset}:{min:value,max:value};
  });
  return intervals(start).flatMap(a=>intervals(end).map(b=>({min:b.min-a.max+dayDifference*1440,max:b.max-a.min+dayDifference*1440})).filter(value=>value.max>=0));
}
/** A seconds display becomes a wall clock only after its role is explicitly reviewed. */
export function resolveTemporalClock(catalog: Entry[], audit:any, id:unknown) {
  if(typeof id!=='string')return null;
  for(const entry of catalog){
    const clock=entry.clocks.find(c=>c.id===id);if(clock)return {entry,clock:{...clock,precisionSeconds:60}};
    const digital=entry.digitalClocks?.find(c=>c.id===id);
    const role=audit?.checks?.find((c:any)=>c?.ref===entry.id)?.countdownCalculations?.find((c:any)=>c?.readingIndex===digital?.readingIndex);
    if(digital&&role?.relation==='not_countdown'&&typeof role.reason==='string'&&role.reason.trim().length>=8)return {entry,clock:digital};
  }
  return null;
}
/** Bind identities semantically; perform remaining-time arithmetic only on server values. */
export function validateCountdownReview(audit: any, catalog: Entry[]) {
  const errors:string[]=[],issues:string[]=[],unresolved:string[]=[],issueRefs:string[]=[];
  const observations=new Map<string,Set<string>>();
  for(const entry of catalog) {
    if(!entry.countdowns?.length)continue;
    const check=audit?.checks?.find((row:any)=>row?.ref===entry.id);
    const rows=check?.countdownCalculations;
    if(!Array.isArray(rows)||rows.length!==entry.countdowns.length){errors.push(entry.id+'缺少逐个数字读数的倒计时身份与经过时长核对');continue;}
    const seen=new Set<number>();
    for(const row of rows){
      const read=entry.countdowns[row?.readingIndex];
      if(!Number.isInteger(row?.readingIndex)||!read||seen.has(row.readingIndex)){errors.push(entry.id+'倒计时读数编号重复或无效');continue;}seen.add(row.readingIndex);
      if(!['baseline','elapsed','unknown','not_countdown'].includes(row.relation)||typeof row.reason!=='string'||row.reason.trim().length<8){errors.push(entry.id+'缺少倒计时关系与具体依据');continue;}
      if(row.relation==='not_countdown')continue;
      if(typeof row.timerId!=='string'||!row.timerId.trim()){errors.push(entry.id+'缺少同一计时器身份');continue;}
      const prior=observations.get(row.timerId);
      const boundEarlier=catalog.find(x=>x.id===row.earlierRef);
      const boundRead=Number.isInteger(row.earlierReadingIndex)?boundEarlier?.countdowns?.[row.earlierReadingIndex]:undefined;
      // Unknown elapsed duration still permits a direction check when the reviewer
      // explicitly binds forward observations of the same timer. No guessed identity.
      if(row.relation==='unknown'&&boundRead&&prior?.has(row.earlierRef+':'+row.earlierReadingIndex)
        &&(catalog.indexOf(boundEarlier!)<catalog.indexOf(entry)||(boundEarlier===entry&&row.earlierReadingIndex<row.readingIndex))&&read.seconds>boundRead.seconds) {
        issueRefs.push(entry.id);
        issues.push('【时间核对】已绑定同一计时器的前后读数从'+boundRead.original+'增加到'+read.original+'，与持续倒计时方向不兼容。 | 原文: '+boundEarlier!.evidence+' | '+entry.evidence);
      }
      const readings=new Set(prior);readings.add(entry.id+':'+row.readingIndex);observations.set(row.timerId,readings);
      if(row.relation==='unknown'){if(check.status!=='unknown')errors.push(entry.id+'倒计时边界未知不能标为已验证supported/conflict');unresolved.push(entry.id+'倒计时经过时间尚未验证：'+row.reason+'；复核同一事件的回溯钟表及先后上下界，不得忽略已提供边界，也不得编造未知端点');continue;}
      if(row.relation==='baseline'){if(prior)errors.push(entry.id+'同一倒计时已有读数，不能反复重置基准绕过计算');continue;}
      const earlier=catalog.find(x=>x.id===row.earlierRef);
      const previous=earlier?.countdowns?.[row.earlierReadingIndex];
      const earlierPosition=catalog.indexOf(earlier!);
      const startBinding=resolveTemporalClock(catalog,audit,row.startClockId);
      const endBinding=resolveTemporalClock(catalog,audit,row.endClockId);
      const startEntry=startBinding?.entry,endEntry=endBinding?.entry;
      const start=startBinding?.clock,end=endBinding?.clock;
      if(!prior||!prior.has(row.earlierRef+':'+row.earlierReadingIndex)||!previous
        ||earlierPosition>catalog.indexOf(entry)||(earlier===entry&&row.earlierReadingIndex>=row.readingIndex)
        ||!Number.isInteger(row.earlierReadingIndex)){
        errors.push(entry.id+'倒计时无法复算：须绑定同一计时器的前次读数，不能猜跨日或重置');continue;
      }
      const decrease=previous.seconds-read.seconds;
      if(row.elapsedDurationRef!==undefined){
        const durationEntry=catalog.find(x=>x.id===row.elapsedDurationRef);
        const quantity=Number.isInteger(row.elapsedQuantityIndex)?durationEntry?.durations?.[row.elapsedQuantityIndex]:undefined;
        if(!quantity||!['eq','lt','le','gt','ge'].includes(quantity.operator)||row.startClockId||row.endClockId){
          errors.push(entry.id+'明确经过时长无法复算：须绑定原文数量及同一事件，不混用钟表端点或宽泛估计');continue;
        }
        const compatible=decrease>=0&&durationMatchesInterval(quantity,decrease/60,decrease/60)===true;
        if(!compatible){issueRefs.push(entry.id);issues.push('【时间核对】同一倒计时从'+previous.original+'到'+read.original+'经过'+decrease+'秒，不满足原文明确时长'+quantity.original+'。 | 原文: '+earlier!.evidence+' | '+entry.evidence+' | 对照: '+durationEntry!.evidence);}
        continue;
      }
      if(typeof row.startClockId!=='string'||typeof row.endClockId!=='string'||!start||!end||(row.startRelation===undefined&&row.endRelation===undefined&&!['eq','ge','le'].includes(row.elapsedConstraint))){
        errors.push(entry.id+'倒计时无法复算：须绑定已确认同日钟表边界或明确经过时长，不能猜跨日或重置');continue;
      }
      let effectiveConstraint=row.elapsedConstraint;
      if(row.elapsedConstraint!=='eq'||row.startRelation!==undefined||row.endRelation!==undefined) {
        const derived=countdownConstraintFromRelations(row.startRelation,row.endRelation);
        if(!derived){errors.push(entry.id+'倒计时上下界合同不成立：须说明钟点相对读数的before_reading/at_reading/after_reading关系，由程序推导约束，不把上界写成下界');continue;}
        effectiveConstraint=derived;
      }
      const elapsedOptions=clockElapsedIntervals(start,end);
      if(!elapsedOptions.length){errors.push(entry.id+'钟表没有可成立的同日先后组合，跨日或未知时段不得猜测');continue;}
      // Keep all valid 12-hour candidates and minute-resolution margins; do not invent a phase.
      const compatible=decrease>=0&&elapsedOptions.some(interval=>{
        const margin=Math.max(start.precisionSeconds,end.precisionSeconds)-1;
        const lower=Math.max(0,interval.min*60-margin),upper=interval.max*60+margin;
        return effectiveConstraint==='eq'?decrease>=lower&&decrease<=upper
          :effectiveConstraint==='ge'?decrease>=lower:decrease<=upper;
      });
      if(!compatible){issueRefs.push(entry.id);issues.push('【时间核对】同一倒计时从'+previous.original+'到'+read.original+'读数减少'+decrease+'秒，与已确认钟表'+start.original+'至'+end.original+'的'+effectiveConstraint+'约束不兼容。 | 原文: '+earlier!.evidence+' | '+entry.evidence+' | 对照: '+startEntry!.evidence+' | '+endEntry!.evidence);}
    }
  }
  return {errors,issues,unresolved,issueRefs};
}
