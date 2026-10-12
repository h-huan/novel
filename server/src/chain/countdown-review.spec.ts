import { countdownConstraintFromRelations, durationMatchesInterval } from './countdown-review';
import {describe,it,expect} from 'vitest';
import {temporalNumbers,temporalReviewCatalog,validateTemporalReview} from './temporal-review-coverage';
it('does not hide a bound timer increase behind unknown elapsed duration or guess unbound identity',()=>{
 const body='倒计时22:47:03。\n倒计时23:39:12。';const catalog=temporalReviewCatalog(body);
 const value:any={status:'evaluated',checks:catalog.map((c,i)=>({ref:c.id,status:i?'unknown':'supported',reason:'核对同一计时器的前后观察，间隔尚不明确。',calculations:[],countdownCalculations:[{readingIndex:0,timerId:'one',relation:i?'unknown':'baseline',...(i?{earlierRef:'T1',earlierReadingIndex:0}:{}),reason:'已确认同一计时器后次观察，但缺经过时长边界。'}]}))};
 const result=validateTemporalReview(value,catalog,body);expect(result.issues).toHaveLength(1);expect(result.issues[0]).toContain('22:47:03增加到23:39:12');expect(result.unresolved).toHaveLength(1);
 delete value.checks[1].countdownCalculations[0].earlierRef;expect(validateTemporalReview(value,catalog,body).issues).toEqual([]);
 value.checks[1].countdownCalculations[0].earlierRef='T1';value.checks[1].countdownCalculations[0].timerId='another';expect(validateTemporalReview(value,catalog,body).issues).toEqual([]);
});
const text='倒计时23:59:58。\n送达时间下午两点十一分。\n保安说现在十八点三十四。\n倒计时23:12:47。';
const entries=temporalReviewCatalog(text);
const audit=()=>({status:'evaluated',checks:entries.map((e,i)=>({ref:e.id,status:'supported',reason:'按同一单送达后开始的同一倒计时与现场时刻核对',calculations:[],countdownCalculations:e.countdowns.map((_,readingIndex)=>i===0?{readingIndex,timerId:'one',relation:'baseline',reason:'首次显示读数，与该单送达属于同一时刻'}:{readingIndex,timerId:'one',relation:'elapsed',earlierRef:'T1',earlierReadingIndex:0,startClockId:'T2:C1',endClockId:'T3:C1',startRelation:'at_reading',endRelation:'before_reading',elapsedConstraint:'ge',reason:'后次显示发生在现场明确钟点之后，已经至少经过该区间'})}))});
describe('countdown continuity arithmetic',()=>{
 it('keeps remaining time separate from wall clocks and interprets explicit periods',()=>{expect(temporalNumbers('23:59:58').clocks).toEqual([]);expect(temporalNumbers('23:59:58').countdowns[0].seconds).toBe(86398);expect(entries[1].clocks[0].minutes).toBe(851);expect(temporalNumbers('下午三点半').clocks[0].minutes).toBe(930);});
 it('rejects the historic single-point-supported report as missing arithmetic coverage',()=>{const value=audit();delete (value.checks[0] as any).countdownCalculations;expect(validateTemporalReview(value,entries,text).verified).toBe(false);});
 it('computes the actual contradiction from server readings and clock bounds',()=>{const result=validateTemporalReview(audit(),entries,text);expect(result.verified).toBe(true);expect(result.issues.join('')).toContain('2831秒');expect(result.issues.join('')).toContain('两点十一分');});
 it('accepts consistent countdowns and preserves minute resolution margin',()=>{const correct=text.replace('23:12:47','19:36:58');expect(validateTemporalReview(audit(),temporalReviewCatalog(correct),correct).issues).toEqual([]);const near=correct.replace('19:36:58','19:37:10');const value=audit();value.checks[3].countdownCalculations[0].elapsedConstraint='eq';value.checks[3].countdownCalculations[0].endRelation='at_reading';expect(validateTemporalReview(value,temporalReviewCatalog(near),near).issues).toEqual([]);});
 it('does not invent cross-day, timer identity, or a repeated baseline',()=>{for(const change of [{timerId:'other'},{endClockId:'T1:C1'},{earlierRef:'T3'},{relation:'baseline'}]){const value=audit();Object.assign(value.checks[3].countdownCalculations[0],change);expect(validateTemporalReview(value,entries,text).verified).toBe(false);}});
 it('preserves honest unknown boundaries without calling them supported',()=>{const value=audit();value.checks[3].countdownCalculations[0].relation='unknown';expect(validateTemporalReview(value,entries,text).verified).toBe(false);value.checks[3].status='unknown';expect(validateTemporalReview(value,entries,text).verified).toBe(true);expect(validateTemporalReview(value,entries,text).issues).toEqual([]);expect(validateTemporalReview(value,entries,text).unresolved).toHaveLength(1);});
});

it('binds a particular clock within a multi-clock paragraph and refuses countdown IDs as clocks',()=>{const body='倒计时23:59:58。\n送达下午两点十一分。\n保安说十四点二十以前该离开，现在十八点三十四。\n倒计时23:12:47。';const value=audit();value.checks[3].countdownCalculations[0].endClockId='T3:C2';expect(validateTemporalReview(value,temporalReviewCatalog(body),body).issues).toHaveLength(1);value.checks[3].countdownCalculations[0].endClockId='T1:C1';expect(validateTemporalReview(value,temporalReviewCatalog(body),body).verified).toBe(false);});
it('keeps ambiguous spoken hours as candidates, without fabricating AM or PM',()=>{expect(temporalNumbers('五点三十一分').clocks[0].minuteOptions).toEqual([331,1051]);expect(temporalNumbers('下午五点三十一分').clocks[0].minuteOptions).toEqual([1051]);const body=text.replace('十八点三十四','六点三十四');expect(validateTemporalReview(audit(),temporalReviewCatalog(body),body).issues).toHaveLength(1);});

it('retains real seconds-resolution wall clocks without allowing remaining-time values as endpoints',()=>{
 const body='船在09:00:00离港。\n船在10:00:00靠岸。\n航行了三个小时。';const catalog=temporalReviewCatalog(body);
 const value:any={status:'evaluated',checks:catalog.map(e=>({ref:e.id,status:'supported',reason:'明确离港和靠岸钟表，核对同一航程起止点',calculations:e.durations.map((_,quantityIndex)=>({quantityIndex,sameEndpoints:true,startClockId:'T1:D1',endClockId:'T2:D1'})),countdownCalculations:e.countdowns.map((_,readingIndex)=>({readingIndex,relation:'not_countdown',reason:'原文明确是离港或靠岸的钟表时刻而不是倒计时'}))}))};
 expect(validateTemporalReview(value,catalog,body).issues.join('')).toContain('60分钟');value.checks[0].countdownCalculations[0]={readingIndex:0,timerId:'one',relation:'baseline',reason:'这是一个尚未与钟表绑定的计时器初始读数'};expect(validateTemporalReview(value,catalog,body).verified).toBe(false);
});

it('does not count the same numeric countdown conflict again through the aggregate status',()=>{const value:any=audit();value.checks[3].status='conflict';value.checks[3].comparisonRefs=['T1','T2','T3'];expect(validateTemporalReview(value,entries,text).issues).toHaveLength(1);});

function explicitIntervalAudit(body:string) {
 const catalog=temporalReviewCatalog(body);
 const audit={status:'evaluated',checks:catalog.map(e=>({ref:e.id,status:'supported',reason:'原文明确指向同一计时器前后读数及经过时长',calculations:e.durations.map((_,quantityIndex)=>({quantityIndex,sameEndpoints:false,reason:'原文给经过时长，没有独立钟表端点，使用倒计时关系核对'})),countdownCalculations:e.countdowns.map((_,readingIndex)=>({readingIndex,timerId:'same',relation:readingIndex===0?'baseline':'elapsed',earlierRef:e.id,earlierReadingIndex:0,elapsedDurationRef:e.id,elapsedQuantityIndex:0,reason:'原文明确说明同一计时器经过这段时长后呈现第二次读数'}))}))};
 return {catalog,audit};
}
it.each([['十二秒','01:59:48',0],['十二秒','01:59:59',1],['不到十二秒','01:59:49',0],['不到十二秒','01:59:48',1],['两分钟','01:58:00',0],['两分钟','01:59:48',1],['五六分钟','01:55:00',0],['五六分钟','01:54:00',0],['五六分钟','01:04:00',1]])('calculates explicit %s against %s without inventing wall clocks', (quantity,after,issueCount)=>{
 const body=`倒计时02:00:00，过了${quantity}，倒计时${after}。`;
 const {catalog,audit}=explicitIntervalAudit(body);
 const result=validateTemporalReview(audit,catalog,body);
 expect(result.verified).toBe(true);expect(result.issues).toHaveLength(issueCount);
});
it('refuses fabricated duration IDs, ambiguous estimates and mixed interval sources',()=>{
 const body='倒计时02:00:00，过了十二秒，倒计时01:59:48。';const {catalog,audit}=explicitIntervalAudit(body);
 audit.checks[0].countdownCalculations[1].elapsedDurationRef='missing';
 expect(validateTemporalReview(audit,catalog,body).verified).toBe(false);
 const estimated='倒计时02:00:00，过了大约十二秒，倒计时01:59:48。';const candidate=explicitIntervalAudit(estimated);
 expect(validateTemporalReview(candidate.audit,candidate.catalog,estimated).verified).toBe(false);
});

it('uses the same spoken-range constraint for timer decreases, retaining real contradictions',()=>{
 const range={minutes:5,minuteBounds:{min:5,max:6},operator:'eq'};
 for(const elapsed of [5,5.5,6])expect(durationMatchesInterval(range,elapsed,elapsed)).toBe(true);
 for(const elapsed of [0,4,7,56])expect(durationMatchesInterval(range,elapsed,elapsed)).toBe(false);
 expect(durationMatchesInterval({minutes:56,operator:'eq'},6,6)).toBe(false);
});

it('derives bounds from observation order and rejects the real inverted upper-bound pattern',()=>{
 expect(countdownConstraintFromRelations('before_reading','at_reading')).toBe('le');expect(countdownConstraintFromRelations('at_reading','before_reading')).toBe('ge');expect(countdownConstraintFromRelations('at_reading','at_reading')).toBe('eq');expect(countdownConstraintFromRelations('before_reading','before_reading')).toBeNull();
 const body='评价时间十八点五十二。\n倒计时24:00:00。\n二十点零四，倒计时22:00:00。';const catalog=temporalReviewCatalog(body);
 const checks:any[]=catalog.map(e=>({ref:e.id,status:'supported',reason:'同一计时器首次观察发生在评价以后，后次读数有明确钟表。',calculations:[],countdownCalculations:e.countdowns.map((_,readingIndex)=>e.id==='T2'?{readingIndex,timerId:'期限',relation:'baseline',reason:'正文首次观察该计时器的初始读数'}:{readingIndex,timerId:'期限',relation:'elapsed',earlierRef:'T2',earlierReadingIndex:0,startClockId:'T1:C1',endClockId:'T3:C1',startRelation:'before_reading',endRelation:'at_reading',elapsedConstraint:'ge',reason:'评价先发生，首次观察在之后，终点钟表与后次读数同一时点'})}));
 const inverted=validateTemporalReview({status:'evaluated',checks},catalog,body);expect(inverted.errors).toEqual([]);expect(inverted.issues).toHaveLength(1);
 const withUnknown={...checks[2].countdownCalculations[0],startRelation:'unknown'};checks[2].countdownCalculations[0]=withUnknown;expect(validateTemporalReview({status:'evaluated',checks},catalog,body).errors.join('')).toContain('上下界合同');checks[2].countdownCalculations[0].startRelation='before_reading';
 checks[2].countdownCalculations[0].elapsedConstraint='le';const result=validateTemporalReview({status:'evaluated',checks},catalog,body);expect(result.errors).toEqual([]);expect(result.issues).toHaveLength(1);delete checks[2].countdownCalculations[0].elapsedConstraint;expect(validateTemporalReview({status:'evaluated',checks},catalog,body).issues).toHaveLength(1);
});
