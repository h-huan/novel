import { validateCountdownReview, resolveTemporalClock, clockElapsedIntervals, durationMatchesInterval } from './countdown-review';
import { TEMPORAL_FACT_CONTINUITY_POLICY } from '../../shared/src/system-workflow-rules.registry';

function timeNumber(text: string): number {
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);
  const digits = '零一二三四五六七八九';
  const units: Record<string,number> = {十:10,百:100,千:1000};
  if (!/[十百千]/.test(text)) return Number([...text].map(c=>c==='两'?'2':String(digits.indexOf(c==='〇'?'零':c))).join(''));
  let total=0,current=0;
  for(const c of text) { if(units[c]) { total+=(current||1)*units[c];current=0; }
    else { const digit=c==='两'?2:digits.indexOf(c==='〇'?'零':c);if(digit<0)return NaN;current=digit; } }
  return total+current;
}

export function temporalNumbers(evidence: string) {
  const number = '[零〇一二两三四五六七八九十百千\\d]+(?:\\.\\d+)?';
  const durations: Array<{ original: string; minutes: number; minuteBounds?:{min:number;max:number}; operator: 'eq'|'lt'|'le'|'gt'|'ge'|'unknown' }> = [];
  const pattern = new RegExp(`(不到|不足|未满|不超过|至多|至少|不少于|超过|大约|大概|约|近|将近|差不多)?(${number})(?:来)?(?:个)?(多)?(小时|钟头|分钟|秒钟|秒)(不到|以内|以上|左右)?`, 'g');
  for (const match of evidence.matchAll(pattern)) {
    const n = timeNumber(match[2]); if (!Number.isFinite(n) || n < 0) continue;
    const operator = ['不到','不足','未满'].includes(match[1]) || match[5] === '不到' ? 'lt'
      : ['不超过','至多'].includes(match[1]) || match[5] === '以内' ? 'le'
      : ['至少','不少于'].includes(match[1]) || match[5] === '以上' ? 'ge'
      : match[1] === '超过' || match[3] ? 'gt'
      : ['约','大约','大概','近','将近','差不多'].includes(match[1]) || match[5] === '左右' || match[0].includes('来') ? 'unknown' : 'eq';
    const unit=['小时','钟头'].includes(match[4])?60:match[4]==='分钟'?1:1/60;
    // Consecutive Chinese numbers before a time unit mean a spoken range, not decimal concatenation.
    const pair=/^(?:一两|两三|二三|三四|四五|五六|六七|七八|八九)$/.test(match[2])?[...match[2]].map(timeNumber):null;
    const minuteBounds=pair?{min:pair[0]*unit,max:pair[1]*unit}:undefined;
    durations.push({ original:match[0],minutes:minuteBounds?.min??n*unit,...(minuteBounds?{minuteBounds}:{}),operator });
  }
  const countdowns:Array<{original:string;seconds:number}>=[];
  const digitalRanges:Array<[number,number]>=[];
  for(const match of evidence.matchAll(/(?<!\d)(?<!\d[:：])(\d{1,3})[:：]([0-5]\d)[:：]([0-5]\d)(?!\d|[:：]\d)/g)){
    countdowns.push({original:match[0],seconds:Number(match[1])*3600+Number(match[2])*60+Number(match[3])});
    digitalRanges.push([match.index!,match.index!+match[0].length]);
  }
  const clocks: Array<{ original: string; minutes: number; minuteOptions:number[]; minuteBounds?:{min:number;max:number}; relativeDay?:number }> = [];
  const clockPattern = new RegExp(`(${number})(?:点|时)(?:(半)|(?:过)?(${number})分?)?|([0-2]?\\d)[:：]([0-5]\\d)`, 'g');
  for (const match of evidence.matchAll(clockPattern)) {
    if(digitalRanges.some(([start,end])=>match.index!>=start&&match.index!<end))continue;
    let hour = timeNumber(match[1] ?? match[4]), minute = match[2] ? 30 : match[3] ? timeNumber(match[3]) : Number(match[5] ?? 0);
    const period=evidence.slice(Math.max(0,match.index!-4),match.index!);
    if(/下午|傍晚|晚上/.test(period)&&hour<12)hour+=12;
    if(/凌晨/.test(period)&&hour===12)hour=0;
    const explicitDay=evidence.slice(Math.max(0,match.index!-10),match.index!).match(/(今天|今日|明天|明日|后天|昨天|昨日|前天)(?:凌晨|清晨|清早|早上|上午|中午|下午|傍晚|晚上|夜里)?$/)?.[1];
    const relativeDay=explicitDay?({今天:0,今日:0,明天:1,明日:1,后天:2,昨天:-1,昨日:-1,前天:-2} as Record<string,number>)[explicitDay]:undefined;
    const suffix=evidence.slice(match.index!+match[0].length).match(/^(多|出头)/)?.[0];
    // Keep a conservative whole-hour interval; never invent an exact minute for 多/出头.
    const minuteBounds=suffix?{min:hour*60+minute,max:(hour+1)*60}:undefined;
    if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60) clocks.push({ original: match[0]+(suffix||''), minutes: hour * 60 + minute, ...(minuteBounds?{minuteBounds}:{}), ...(relativeDay===undefined?{}:{relativeDay}), minuteOptions: match[1] && hour<=12 && !/下午|傍晚|晚上|凌晨|清早|清晨|早上|上午/.test(period) ? [hour%12*60+minute,(hour%12+12)*60+minute] : [hour*60+minute] });
  }
  return { durations, clocks, countdowns };
}

/** Locates review material; it does not infer event identity or block from keywords. */
export function temporalReviewCatalog(content: string) {
  const numericTime = /(?:[零〇一二两三四五六七八九十百千\d]+(?:\.[\d]+)?(?:来)?(?:个)?(?:多)?(?:小时|钟头|分钟|秒钟|秒|年|个月|天|日|点|时)|\d{1,2}[:：]\d{2})/;
  return content.split(/\r?\n/).map(s => s.trim()).filter(s => s && (numericTime.test(s)||/(?:今天|今日|明天|明日|后天|昨天|昨日|前天)(?:凌晨|清晨|清早|早上|上午|中午|下午|傍晚|晚上|夜里)/.test(s)))
    .map((evidence, i) => {const numbers=temporalNumbers(evidence);return { id: `T${i + 1}`, evidence, ...numbers, clocks:numbers.clocks.map((clock,j)=>({...clock,id:`T${i+1}:C${j+1}`})), digitalClocks:numbers.countdowns.map((read,j)=>({id:`T${i+1}:D${j+1}`,original:read.original,minutes:read.seconds/60,minuteOptions:[read.seconds/60],precisionSeconds:1,readingIndex:j})).filter(clock=>clock.minutes<1440) };});
}

export function validateTemporalReview(audit: unknown, catalog: ReturnType<typeof temporalReviewCatalog>, content: string) {
  const errors: string[] = [], issues: string[] = [], unresolved:string[]=[];
  const value = audit as any;
  if (!catalog.length) return { verified: true, errors, issues, unresolved };
  if (!value || value.status !== 'evaluated' || !Array.isArray(value.checks)) {
    return { verified: false, errors: ['时间核对未完成：必须逐项返回服务端时间原文目录的检查结果'], issues, unresolved };
  }
  const seen = new Set<string>();
  const semanticIssues:Array<{ref:string;issue:string}>=[];
  for (const check of value.checks) {
    const entry = catalog.find(item => item.id === check?.ref);
    if (!entry || seen.has(check.ref)) { errors.push('时间核对包含未知或重复原文编号'); continue; }
    seen.add(check.ref);
    if (!['supported', 'conflict', 'unknown'].includes(check.status) || typeof check.reason !== 'string' || check.reason.trim().length < 8) {
      errors.push(`${check.ref}缺少明确状态与时间推理依据`); continue;
    }
    // Event identity remains a semantic decision. Once matching endpoints are explicitly
    // supplied, interval arithmetic is checked here, never accepted from model reasoning.
    if (entry.durations.length) {
      if (!Array.isArray(check.calculations) || check.calculations.length !== entry.durations.length) {
        errors.push(`${check.ref}缺少逐项时长计算或未知边界说明`); continue;
      }
      const indices = new Set<number>();
      for (const calc of check.calculations) {
        if (!Number.isInteger(calc?.quantityIndex) || !entry.durations[calc.quantityIndex] || indices.has(calc.quantityIndex)) {
          errors.push(`${check.ref}时长计算编号无效`); continue;
        }
        indices.add(calc.quantityIndex);
        if (calc.sameEndpoints === false) {
          if (typeof (calc.reason ?? check.reason) !== 'string' || (calc.reason ?? check.reason).trim().length < 8) errors.push(`${check.ref}未知起止边界缺少依据`);
          continue;
        }
        const start = calc.startClockId ? resolveTemporalClock(catalog,value,calc.startClockId)?.clock : catalog.find(c => c.id === calc.startRef)?.clocks[calc.startClockIndex];
        const end = calc.endClockId ? resolveTemporalClock(catalog,value,calc.endClockId)?.clock : catalog.find(c => c.id === calc.endRef)?.clocks[calc.endClockIndex];
        const dayDifference=start&&end?('relativeDay' in end?end.relativeDay??0:0)-('relativeDay' in start?start.relativeDay??0:0):0;
        const intervals=start&&end?clockElapsedIntervals(start,end,dayDifference):[];
        if (calc.sameEndpoints !== true || !start || !end || !intervals.length) {
          errors.push(`${check.ref}不能复算同一起止点，跨日或未知边界不得猜测`); continue;
        }
        const q = entry.durations[calc.quantityIndex];
        const satisfies = q.operator === 'unknown' ? null : intervals.some(({min,max})=>durationMatchesInterval(q,min,max)===true);
        if (satisfies === null) continue;
        const expected = satisfies ? 'supported' : 'conflict';
        const elapsed=[...new Set(intervals.map(({min,max})=>(min===max?String(min):`${Math.max(0,min)}–${max}`)+'分钟'))].join('或');
        if (calc.status !== undefined && calc.status !== expected) errors.push(`${check.ref}算术结论错误：${elapsed} ${q.operator} ${q.minutes}分钟应为${expected}`);
        if (!satisfies) issues.push(`【时间核对】${entry.evidence} | 同一起止点${start.original}至${end.original}为${elapsed}，不满足${q.original}`);
      }
    }
    if (check.status === 'conflict') {
      const refsValid = Array.isArray(check.comparisonRefs) && check.comparisonRefs.length > 0
        && check.comparisonRefs.every((ref: unknown) => typeof ref === 'string' && ref !== entry.id && catalog.some(c => c.id === ref));
      const comparison = refsValid ? check.comparisonRefs.map((ref: string) => catalog.find(c => c.id === ref)!.evidence).join(' | ') : check.comparisonEvidence;
      if (!refsValid && (typeof comparison !== 'string' || !comparison.trim()
        || !content.includes(comparison) || comparison === entry.evidence)) {
        errors.push(`${check.ref}时间冲突缺少另一处正文连续逐字依据`); continue;
      }
      semanticIssues.push({ref:entry.id,issue:`【时间核对】${check.reason} | 原文: ${entry.evidence} | 对照: ${comparison}`});
    }
  }
  for (const entry of catalog) if (!seen.has(entry.id)) errors.push(`时间核对漏项：${entry.id}`);
  const countdown=validateCountdownReview(value,catalog);
  errors.push(...countdown.errors);issues.push(...countdown.issues);unresolved.push(...countdown.unresolved);
  issues.push(...semanticIssues.filter(row=>!countdown.issueRefs.includes(row.ref)).map(row=>row.issue));
  return { verified: errors.length === 0, errors: [...new Set(errors)], issues: [...new Set(issues)], unresolved: [...new Set(unresolved)] };
}

function temporalNearbyClockCandidates(catalog: ReturnType<typeof temporalReviewCatalog>, targets: string[]) {
  return catalog.filter(entry=>targets.includes(entry.id)&&entry.countdowns.length).map(entry=>{
    const index=catalog.indexOf(entry);
    return {ref:entry.id,previousClockCandidates:catalog.slice(0,index+1).filter(row=>row.clocks.length).slice(-2),followingClockCandidates:catalog.slice(index).filter(row=>row.clocks.length).slice(0,2)};
  });
}
const TEMPORAL_CLOCK_BINDING_GUIDANCE='仔细区分“确实无钟点”和“钟点在相邻段落”：同一连续场景中紧邻显示的电子钟、看表和订单时刻，若事件身份与叙述先后成立，可以说明理由后绑定，不要求钟点和读数在同一句。不得凭分段宣称缺边界。邻接读数无钟点时，可选择同一计时器更早且有已确认钟表边界的读数，不能只盯上一条数字。已有钟点在当前读数之前可给经过下界ge，之后可给上界le；确在同一显示事件才eq。分钟分辨率余量由程序处理，不能把分钟钟表当精确秒表。不需排除作者未写过的暂停、重置或跨日来拒绝明确同日连续场景；确有时间跳转、回溯或身份不确定仍unknown。';
export function temporalReviewPriorBindings(audit:any,targets:string[]=[]) {
 const rows=Array.isArray(audit?.checks)?audit.checks:[];
 return '跨批已返回的读数身份（审查记录，不是新增故事事实；仍须按正文确认事件）：'+JSON.stringify(rows.filter((row:any)=>!targets.includes(row.ref)&&row.countdownCalculations?.length).map((row:any)=>({ref:row.ref,reason:row.reason,countdownCalculations:row.countdownCalculations})))+'\n若正文确认当前读数与其中某读数属于同一计时器，必须复用其timerId原字符串；不能为同一对象重新起名。不同对象或身份未确认不得强行合并。已确认ge或le单侧经过约束时，用elapsed及对应约束，由程序检查读数差是否兼容；不要求再凭空补另一侧上界或下界。unknown用于无法确认任何可用经过约束，不用于仅缺另一侧边界。';
}

export function temporalReviewPrompt(content: string, catalog: ReturnType<typeof temporalReviewCatalog>, outline: string, context: string, errors: string[] = [], includePolicy = true, targetRefs = catalog.map(entry=>entry.id), priorAudit:any=null) {
  const contract={temporalAudit:{status:'evaluated',checks:catalog.filter(entry=>targetRefs.includes(entry.id)).map(entry=>({ref:entry.id,status:'unknown',comparisonRefs:[],reason:'',calculations:entry.durations.map((_,quantityIndex)=>({quantityIndex,sameEndpoints:false,reason:''})),countdownCalculations:entry.countdowns.map((_,readingIndex)=>({readingIndex,timerId:'',relation:'unknown',reason:''}))}))}};
  return `只核对时间事件的身份、起止点和当前叙述时刻，不评分、不改稿、不转录引文、不做算术。判据：${includePolicy ? TEMPORAL_FACT_CONTINUITY_POLICY : "按已注入CTX-008时间判据执行。"}
本批只审查并返回这些编号：${JSON.stringify(targetRefs)}。其余目录仍可作为跨批起止点或较早读数依据，不返回其检查行。
${temporalReviewPriorBindings(priorAudit,targetRefs)}
全章时间原文目录（数量类型、分钟和时钟已由程序解析）：${JSON.stringify(catalog)}
status=evaluated只用于temporalAudit顶层；每条checks.status只能supported、conflict或unknown。首次读数baseline不需要更早读数或经过时长边界，不能因缺少更早读数改成unknown；这仅确认计时基准，不代表后续读数已核算通过。
unknown仅表示经过边界未知：若能确认同一计时器前后观察，仍用earlierRef和earlierReadingIndex绑定已确认较早读数，程序检查递减方向。回溯截图、他人设备或身份不确定不得按当前同一计时器前后观察绑定；缺精确间隔不等于可以忽略读数反向增加。
钟表定位候选（仅定位，不是已确认绑定）：${JSON.stringify(temporalNearbyClockCandidates(catalog,catalog.map(c=>c.id)))}
${TEMPORAL_CLOCK_BINDING_GUIDANCE}
本章合同：${outline.slice(0,12000)}
前文与世界规则：${context.slice(0,14000)}
完整正文：${content}
${errors.length ? `上次合同错误，仅允许本次纠错：${JSON.stringify(errors)}` : ''}
只返回单个完整JSON，下面是按本次目录生成的必填骨架（reason为空和unknown仅为占位，必须据原文审查，不得直接复制当结论）：${JSON.stringify(contract)}。
已确认同一事件时长起止点的calculations使用完整行{"quantityIndex":0,"sameEndpoints":true,"startClockId":"目录真实clocks.id","endClockId":"目录真实clocks.id","reason":"原文如何支持同一事件及起止边界"}；true必须包含两个钟表编号，reason里提到编号或算式不能代替字段。minuteBounds为程序保留的保守区间，同一事件可绑定近似钟点，不因为缺精确分钟回避计算；确无可绑定事件边界才sameEndpoints=false。comparisonRefs只能引用目录T编号，不能填带:C的钟表编号。
已确认同一计时器与钟表边界的countdownCalculations使用完整行{"readingIndex":0,"timerId":"前后相同的计时器身份","relation":"elapsed","earlierRef":"真实较早读数T编号","earlierReadingIndex":0,"startClockId":"真实clocks.id","endClockId":"真实clocks.id","startRelation":"before_reading|at_reading|after_reading","endRelation":"before_reading|at_reading|after_reading","reason":"原文如何支持同一事件和此上下界"}；startRelation是起点钟表事件相对较早读数，endRelation是终点钟表事件相对本次读数；两端at_reading得到eq，起点before_reading且终点at_reading/after_reading得到le，起点at_reading/after_reading且终点before_reading得到ge。评价或送达记录早于首次观察时只限制最多经过多少，不能反写至少经过；两个clock事件都早于各自读数等不形成单一上下界时，换有依据的边界或unknown。程序从startRelation/endRelation推导方向，elapsedConstraint是兼容旧报告的字段，不覆盖事件关系；模型不得任选符号绕过读数错误。首次baseline，边界未知unknown、非倒计时not_countdown各按后文判据执行。原文明确经过时长可替代钟表端点：使用elapsedDurationRef与elapsedQuantityIndex绑定目录durations中的数量，不能自报数字；保留earlierRef、earlierReadingIndex、timerId、relation=elapsed与reason，说明这段时长为何正好限定同一计时器的两次读数。不同时填写钟表和时长端点；宽泛估计不能当精确时长。
真正的HH:MM:SS钟表以not_countdown声明原文依据，才能用digitalClocks.id绑定时长计算的startClockId/endClockId；尚未确认角色或确属倒计时的数字不可作为钟表。本批每个T编号恰检查一次，每个durations的quantityIndex恰一条calculations；无durations则calculations为空。有countdowns的条目还必须返回countdownCalculations，每个readingIndex恰一次：{"readingIndex":0,"timerId":"同一计时器使用同一身份","relation":"baseline|elapsed|unknown|not_countdown","reason":"至少8字说明读数所在事件和钟表边界"}。baseline只准同一计时器首次读数；后续读数须elapsed并附earlierRef、earlierReadingIndex（同一计时器已有读数，可选有明确钟表边界的较早读数）、startClockId、endClockId（只能选择clocks中服务端提供的独立id；HH:MM:SS确认not_countdown后才可选择digitalClocks.id，不填下标、不把倒计时当钟表）、startRelation/endRelation（各钟点相对对应读数的先后，程序推导经过约束）。识别正文回溯订单完成时刻与首次显示读数的同一事件，用后续钟表已发生事件约束读数所在时刻，不能把倒计时当钟表或仅逐点supported而不联结。不得编造暂停、重置、变速；缺边界时unknown并将该条status标unknown，确为普通数字时钟才not_countdown且说明原文依据。未明示上午/下午的12小时口语钟点由程序保留minuteOptions候选，不自行补成05点或17点；同日先后约束下有兼容候选则不武断报冲突。钟表只精确到分钟时程序保留59秒分辨率余量；跨日未知不擅自环绕。有多个重复显示读数可绑定同一已确认钟表边界；不同对象用不同timerId，不凭格式猜同一对象。
同一事件起止点且同一叙述时刻可以确认时，引用起止时钟编号，算式和是否满足约束由程序计算，不能另写相反算术结论。边界不同或未知时返回{"quantityIndex":0,"sameEndpoints":false,"reason":"具体说明缺少哪端时刻或不是同一事件"}；不能把明确入库到操作间隔当未知，也不能以操作时钟冒充章末时钟。算术问题由calculations表达；status=conflict仅用于其它时间语义冲突，必须用comparisonRefs引用真实目录，程序回填原文，禁止编造编号或拼接引文。不能将上界解释为精确值；兼容上界不互斥。时长起止钟点的relativeDay仅由程序提取原文明示的今天、明天、后天或昨天；明确次日时刻不当作同日零分钟，不得自造跨日或未知时点。模糊化数字不允许偷换上午下午、今天明天或既定事件时间段。`;
}

/** Correction is scoped to failed or unresolved catalog entries; preserve validated checks. */
export function temporalReviewRepairTargets(errors:string[],catalog:ReturnType<typeof temporalReviewCatalog>) {
  return [...new Set(errors.flatMap(error=>{const match=error.match(/^(T\d+)\b|时间核对漏项：(T\d+)/);return match?[match[1]||match[2]]:[];}))].filter(ref=>catalog.some(c=>c.id===ref));
}
export function temporalReviewRepairPrompt(audit:any,targets:string[],errors:string[],catalog:ReturnType<typeof temporalReviewCatalog>,content:string,outline:string) {
  const nearbyClocks=temporalNearbyClockCandidates(catalog,targets);
  return '按已注入CTX-008判据，仅复核下列尚未验证的时间行，保留已验证行，不改正文、不虚构钟点。\n待处理行：'+JSON.stringify(audit?.checks?.filter((row:any)=>targets.includes(row.ref)))
    +'\n'+temporalReviewPriorBindings(audit,targets)+'\n具体错误与待核边界：'+JSON.stringify(errors)+'\n可选目录（clocks.id为钟表编号，countdowns为剩余读数）：'+JSON.stringify(catalog)
    +'\n当前正文：'+content+'\n本章合同：'+outline.slice(0,12000)
    +'\n重点查本章后文回溯的订单/任务完成钟点是否就是开头触发计时器的同一事件；后续明确钟点和叙述先后是否提供读数所在时刻的上界或下界。不能因为钟点在后文才交代就忽略；如果不能确认同一事件则保留unknown。每个待处理ref恰好返回一行，已验证其它ref不返回。'
    +'\n保留同一行内已经成立的读数角色：首次baseline无需更早读数或经过边界，不得因为缺少更早读数改成unknown。relation允许baseline|elapsed|unknown|not_countdown；baseline仅确认首次读数，不能用于后续重置；not_countdown须有普通钟表依据。行status仅supported|conflict|unknown，不得写evaluated（该值只用于审查顶层）。一个时长字段或行status格式错误不等于该行已确认baseline失效。'
    +'\n即使经过时长未知，只要同一计时器的前后观察已确认，仍绑定earlierRef和earlierReadingIndex，由程序核对递减方向；回溯截图、不同设备和身份未确认不要绑定为当前同一计时器的前后观察。不能因缺精确间隔忽略反向增加。'
    +'\n钟表定位候选（仅定位，不是已确认绑定）：'+JSON.stringify(nearbyClocks)
    +'\n'+TEMPORAL_CLOCK_BINDING_GUIDANCE
    +'\n只输出JSON:{"repairs":[{"ref":"待处理T编号","status":"supported|conflict|unknown","reason":"实际依据至少8字","comparisonRefs":[],"calculations":[],"countdownCalculations":[{"readingIndex":0,"timerId":"保留原计时器身份","relation":"baseline|elapsed|unknown|not_countdown","earlierRef":"同一计时器较早T编号","earlierReadingIndex":0,"startClockId":"目录真实clocks.id","endClockId":"目录真实clocks.id","startRelation":"before_reading|at_reading|after_reading","endRelation":"before_reading|at_reading|after_reading","reason":"原文如何支持同一事件和边界"}]}]}。修复时长行时calculations补原quantityIndex与sameEndpoints；sameEndpoints=true必须同时填写startClockId和endClockId（目录实际clocks.id），不能只在reason里提编号或写算式。近似钟点沿minuteBounds参与计算，事件身份仍须由原文确认。comparisonRefs仅T编号，不填:C钟表编号；无时长则calculations为空。边界仍未知的读数relation=unknown、行status=unknown，说明具体缺哪端，不能用未知声称完整通过。无论是否仍有冲突，只修绑定，程序计算数值与秒级余量，不做算术，不以倒计时作钟表，不猜时段和跨日。';
}
export function applyTemporalReviewRepairs(audit:any,targets:string[],value:any) {
  const rows=Array.isArray(value?.repairs)?value.repairs:value?.temporalAudit?.checks?.filter((row:any)=>targets.includes(row?.ref));
  if(!Array.isArray(audit?.checks)||!Array.isArray(rows)||rows.length!==targets.length||new Set(rows.map((row:any)=>row?.ref)).size!==targets.length||rows.some((row:any)=>!targets.includes(row?.ref)))return audit;
  const checks=audit.checks.map((row:any)=>rows.find((fixed:any)=>fixed.ref===row.ref)||row);
  for(const row of rows)if(!checks.some((item:any)=>item.ref===row.ref))checks.push(row);
  return {...audit,checks};
}


/** Bound response size while retaining stable global clock and timer identities. */
export function temporalReviewBatches(catalog:ReturnType<typeof temporalReviewCatalog>,targets=catalog.map(row=>row.id),size=12) {
 if(!Number.isInteger(size)||size<1||new Set(targets).size!==targets.length||targets.some(ref=>!catalog.some(row=>row.id===ref)))throw new Error('时间审查批次包含无效或重复编号');
 return Array.from({length:Math.ceil(targets.length/size)},(_,index)=>targets.slice(index*size,(index+1)*size));
}
export function mergeTemporalReviewBatch(audit:any,targets:string[],value:any) {
 const rows=value?.temporalAudit?.checks??value?.repairs;
 if(!Array.isArray(rows)||rows.length!==targets.length||new Set(rows.map((row:any)=>row?.ref)).size!==targets.length||rows.some((row:any)=>!targets.includes(row?.ref))||rows.some((row:any)=>audit.checks.some((old:any)=>old.ref===row.ref)))throw new Error('时间审查批次漏项或未完整返回点名行，不能合并为通过');
 if(value?.temporalAudit&&value.temporalAudit.status!=='evaluated')throw new Error('时间审查批次尚未完成');
 return {status:'evaluated',checks:[...audit.checks,...rows]};
}
