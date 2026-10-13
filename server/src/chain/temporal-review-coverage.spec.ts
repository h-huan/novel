import { describe, expect, it } from 'vitest';
import { temporalReviewBatches, mergeTemporalReviewBatch, temporalNumbers, temporalReviewCatalog, validateTemporalReview, applyTemporalReviewRepairs, temporalReviewRepairTargets, temporalReviewRepairPrompt, temporalReviewPrompt } from './temporal-review-coverage';

describe('approximate clock boundaries',()=>{
 it('includes spoken hour readings without turning approximate readings into exact values',()=>{
  const catalog=temporalReviewCatalog('倒计时还剩十九个钟头。\n倒计时还剩十来个钟头。');
  expect(catalog).toHaveLength(2);
  expect(catalog[0].durations[0]).toMatchObject({original:'十九个钟头',minutes:1140,operator:'eq'});
  expect(catalog[1].durations[0]).toMatchObject({original:'十来个钟头',minutes:600,operator:'unknown'});
  expect(temporalNumbers('过了两个多钟头。').durations[0]).toMatchObject({minutes:120,operator:'gt'});
 });
 const review=(duration:string,bound=true)=>{
  const body='记录显示下午四点多入库。\n现在晚上九点二十出头，已经入库'+duration+'。';
  const catalog=temporalReviewCatalog(body);
  const checks=catalog.map(entry=>({ref:entry.id,status:'supported',reason:'起止事件由记录和当前同日入库历时明确对应。',calculations:entry.durations.map((_,quantityIndex)=>bound?{quantityIndex,sameEndpoints:true,startRef:'T1',startClockIndex:0,endRef:'T2',endClockIndex:0}:{quantityIndex,sameEndpoints:false,reason:'另一批货物的持续时长，不能凭相邻猜同一事件。'})}));
  return validateTemporalReview({status:'evaluated',checks},catalog,body);
 };
 it('computes conservative approximate intervals without inventing precise minutes',()=>{
  expect(temporalNumbers('下午四点多').clocks[0]).toMatchObject({original:'四点多',minuteBounds:{min:960,max:1020}});
  expect(review('三个小时')).toMatchObject({verified:true});
  expect(review('三个小时').issues.join('')).toContain('260–360分钟');
 });
 it('retains compatible durations and does not infer unconfirmed event identity',()=>{
  expect(review('五个小时')).toMatchObject({verified:true,issues:[]});
  expect(review('三个小时',false)).toMatchObject({verified:true,issues:[]});
 });
 it('uses the same approximate boundaries for a confirmed countdown',()=>{
  const body='时钟下午四点多。\n倒计时24:00:00。\n时钟下午五点二十。\n倒计时22:50:00。';const catalog=temporalReviewCatalog(body);
  const checks=catalog.map(entry=>({ref:entry.id,status:'supported',reason:'同一计时器在同日明确钟表时点观察，保留近似区间。',calculations:[],countdownCalculations:entry.countdowns.map((_,readingIndex)=>entry.id==='T2'?{readingIndex,timerId:'期限',relation:'baseline',reason:'首次显示该倒计时，建立基准。'}:{readingIndex,timerId:'期限',relation:'elapsed',earlierRef:'T2',earlierReadingIndex:0,startClockId:'T1:C1',endClockId:'T3:C1',elapsedConstraint:'eq',reason:'两次观察分别与所示钟表属于同一观察事件。'})}));
  expect(validateTemporalReview({status:'evaluated',checks},catalog,body)).toMatchObject({verified:true,issues:[],unresolved:[]});
 });
});

it('repairs row status without forcing a confirmed first baseline into unknown',()=>{
 const body='倒计时24:00:00。';const catalog=temporalReviewCatalog(body);
 const row={ref:'T1',status:'evaluated',reason:'首次出现的计时器，明确基准读数。',calculations:[],countdownCalculations:[{readingIndex:0,timerId:'one',relation:'baseline',reason:'首次出现该计时器，没有更早读数。'}]};
 const audit={status:'evaluated',checks:[row]};expect(validateTemporalReview(audit,catalog,body).verified).toBe(false);
 const prompt=temporalReviewRepairPrompt(audit,['T1'],['T1缺少明确状态与时间推理依据'],catalog,body,'开头显示倒计时');
 expect(prompt).toContain('relation":"baseline|elapsed|unknown|not_countdown');expect(prompt).toContain('首次baseline无需更早读数');
 const fixed=applyTemporalReviewRepairs(audit,['T1'],{repairs:[{...row,status:'supported'}]});
 expect(validateTemporalReview(fixed,catalog,body)).toMatchObject({verified:true,issues:[],unresolved:[]});
});

it('exposes nearby clock candidates while retaining an unbound timer as unresolved',()=>{
 const body='电子钟显示十八点十二。\n倒计时23:50:00。\n电子钟显示十八点二十二。';const catalog=temporalReviewCatalog(body);
 const checks=catalog.map(c=>({ref:c.id,status:c.countdowns.length?'unknown':'supported',reason:'核对连续场景，但身份与边界仍须明确绑定。',calculations:[],countdownCalculations:c.countdowns.map((_,readingIndex)=>({readingIndex,timerId:'one',relation:'unknown',reason:'还没有明确绑定前后观察及计时起点。'}))}));
 const prompt=temporalReviewRepairPrompt({status:'evaluated',checks},['T2'],['T2边界未知'],catalog,body,'同日连续场景');
 expect(prompt).toContain('previousClockCandidates');expect(prompt).toContain('followingClockCandidates');expect(prompt).toContain('T1:C1');expect(prompt).toContain('T3:C1');expect(prompt).toContain('仅定位，不是已确认绑定');
 const initialPrompt=temporalReviewPrompt(body,catalog,'同日连续场景','');expect(initialPrompt).toContain('previousClockCandidates');expect(initialPrompt).toContain('T3:C1');
 expect(validateTemporalReview({status:'evaluated',checks},catalog,body).unresolved).toHaveLength(1);
});

describe('temporal review coverage', () => {
  const body = '船在九点离港。\n\n十点靠岸。\n\n他说：“航行了四个小时。”';
  const catalog = temporalReviewCatalog(body);
  const checks = catalog.map(item => ({ ref: item.id, status: 'supported', reason: '此处有明确时间原文，需要按同一事件起止点核对。', calculations:item.durations.map((_,quantityIndex)=>({quantityIndex,sameEndpoints:false,reason:'该测试只校验引用，不在此声明同一起止点。'})) }));
  it('locates different time forms without declaring a contradiction', () => {
    expect(catalog).toHaveLength(3);
    expect(temporalReviewCatalog('任务开始于08:15，持续九十分钟。')).toHaveLength(1);
    expect(temporalReviewCatalog('他们在海边说话。')).toEqual([]);
    expect(temporalReviewCatalog('航行两个多小时。')).toHaveLength(1);
    expect(temporalNumbers('等待一百二十分钟。大概两个小时。').durations.map(q=>[q.minutes,q.operator])).toEqual([[120,'eq'],[120,'unknown']]);
  });
  it('does not treat a missing review or omitted entry as completed', () => {
    expect(validateTemporalReview(undefined, catalog, body).verified).toBe(false);
    expect(validateTemporalReview({ status: 'evaluated', checks: checks.slice(0, 2) }, catalog, body).errors).toContain('时间核对漏项：T3');
  });
  it('requires another actual continuous quote for a blocking conflict', () => {
    const audit = { status: 'evaluated', checks: [...checks.slice(0, 2), { ref: 'T3', status: 'conflict', reason: '九点至十点航行一小时，与四小时精确说法矛盾。', comparisonEvidence: '船在九点离港。\n\n十点靠岸。',calculations:[{quantityIndex:0,sameEndpoints:true,startRef:'T1',startClockIndex:0,endRef:'T2',endClockIndex:0,status:'conflict'}] }] };
    expect(validateTemporalReview(audit, catalog, body).issues[0]).toContain('60分钟');
    audit.checks[2].comparisonEvidence = '船九点离港，十点靠岸。';
    expect(validateTemporalReview(audit, catalog, body).verified).toBe(false);
  });
  it('keeps unknown bounds from becoming fabricated story defects', () => {
    const result = validateTemporalReview({ status: 'evaluated', checks: checks.map(c => ({ ...c, status: 'unknown', reason: '缺少章末时点，无法确认这句话与操作时刻相同。' })) }, catalog, body);
    expect(result.verified).toBe(true); expect(result.issues).toEqual([]);
  });
  it('normalizes strict bounds and prevents arithmetic hallucinations', () => {
    expect(temporalNumbers('不到三小时。两个小时不到。六个小时。两个多小时。').durations.map(q=>[q.operator,q.minutes])).toEqual([['lt',180],['lt',120],['eq',360],['gt',120]]);
    const text='八点过十分入库。\n十点半操作。\n到操作两个小时不到。';
    const entries=temporalReviewCatalog(text);
    const audit={status:'evaluated',checks:entries.map(item=>({ref:item.id,status:'supported',reason:'核对同次入库到操作，不含后续章末时点。',calculations:item.durations.map((_,quantityIndex)=>({quantityIndex,sameEndpoints:true,startRef:'T1',startClockIndex:0,endRef:'T2',endClockIndex:0,status:'supported'}))}))};
    const result=validateTemporalReview(audit,entries,text);
    expect(result.verified).toBe(false);expect(result.errors.join('')).toContain('140分钟');
    expect(result.issues.join('')).toContain('不满足');
    const compatible=validateTemporalReview(audit,temporalReviewCatalog(text.replace('两个小时不到','不到三小时')),text.replace('两个小时不到','不到三小时'));
    expect(compatible.verified).toBe(true);expect(compatible.issues).toEqual([]);
  });

  it('rejects duplicate and nonexistent material references', () => {
    expect(validateTemporalReview({ status: 'evaluated', checks: [...checks, checks[0]] }, catalog, body).verified).toBe(false);
    expect(validateTemporalReview({ status: 'evaluated', checks: [...checks, { ...checks[0], ref: 'T99' }] }, catalog, body).verified).toBe(false);
  });
  it('materializes real server quotes and rejects invented comparison references', () => {
    const audit = { status:'evaluated', checks: checks.map((c,i)=>i===2 ? {...c,status:'conflict',comparisonRefs:['T1','T2']} : c) };
    const result=validateTemporalReview(audit,catalog,body);
    expect(result.verified).toBe(true);expect(result.issues.join('')).toContain('船在九点离港。');
    (audit.checks[2] as any).comparisonRefs=['T999'];
    expect(validateTemporalReview(audit,catalog,body).verified).toBe(false);
  });
  it('computes a violation without asking the model for an arithmetic verdict', () => {
    const audit={status:'evaluated',checks:checks.map((c,i)=>i===2?{...c,calculations:[{quantityIndex:0,sameEndpoints:true,startRef:'T1',startClockIndex:0,endRef:'T2',endClockIndex:0}]}:c)};
    const result=validateTemporalReview(audit,catalog,body);
    expect(result.verified).toBe(true);expect(result.issues.join('')).toContain('60分钟');
  });
});

it('bounded time correction preserves validated findings and fills an omitted target',()=>{const audit={status:'evaluated',checks:[{ref:'T1',status:'conflict',reason:'已确认时长不兼容，不能被协议纠错清除'}]};const fixed={ref:'T2',status:'unknown',reason:'这端确实没有已知钟点，保留未验证状态'};const result=applyTemporalReviewRepairs(audit,['T2'],{repairs:[fixed]});expect(result.checks[0]).toBe(audit.checks[0]);expect(result.checks).toContain(fixed);expect(applyTemporalReviewRepairs(audit,['T2'],{repairs:[fixed,{ref:'T1',status:'supported'}]})).toBe(audit);});
it('full report compatibility still ignores unrequested rewrites of validated time rows',()=>{const audit={status:'evaluated',checks:[{ref:'T1',status:'conflict'},{ref:'T2',status:'unknown'}]};const result=applyTemporalReviewRepairs(audit,['T2'],{temporalAudit:{checks:[{ref:'T1',status:'supported'},{ref:'T2',status:'supported',reason:'已补齐定位到正确原文的边界'}]}});expect(result.checks[0].status).toBe('conflict');expect(result.checks[1].status).toBe('supported');});

it('does not reopen validated baseline rows merely mentioned by an unresolved row',()=>{const catalog=temporalReviewCatalog('倒计时23:59:58。\n倒计时23:12:47。');expect(temporalReviewRepairTargets(['T2尚未验证，与T1同一计时器但缺边界'],catalog)).toEqual(['T2']);});

it('recognizes numeric timer reads after prose label colons without accepting malformed clock tails', () => {
  for (const prefix of ['倒计时：', '倒计时:', '倒计时: ', '倒计时： ']) {
    expect(temporalNumbers(`${prefix}23:59:47。`).countdowns).toEqual([{ original:'23:59:47', seconds:86387 }]);
    expect(temporalNumbers(`${prefix}23：59：47。`).countdowns).toEqual([{ original:'23：59：47', seconds:86387 }]);
    expect(temporalNumbers(`${prefix}23:59:47。`).clocks).toEqual([]);
  }
  for (const invalid of ['1234:23:59:47', '12:23:59:47', '12：23：59：47', '23:59:470']) {
    expect(temporalNumbers(invalid).countdowns).toEqual([]);
  }
});

it('deduplicates identical boundary errors without passing an unresolved review',()=>{
 const body='倒计时23:59:50。倒计时23:59:45。倒计时23:59:40。';
 const catalog=temporalReviewCatalog(body);
 const result=validateTemporalReview({status:'evaluated',checks:[{ref:'T1',status:'supported',reason:'同一计时器多次读数，边界尚未提供。',comparisonRefs:[],calculations:[],countdownCalculations:[{readingIndex:0,timerId:'期限',relation:'baseline',reason:'本段首次出现，作为计时基准。'},...[1,2].map(readingIndex=>({readingIndex,timerId:'期限',relation:'elapsed',earlierRef:'T1',earlierReadingIndex:0,reason:'同一计时器后续读数，未给钟表端点。'}))]}]},catalog,body);
 expect(result.verified).toBe(false);expect(result.errors.filter(error=>error.includes('已确认同日钟表边界'))).toHaveLength(1);
});


describe('explicit next-day duration',()=>{
 const review=(body:string)=>{const catalog=temporalReviewCatalog(body);const checks=catalog.map(item=>({ref:item.id,status:'supported',reason:'原文明示当前钟点及明天同一时刻，同一起止事件。',calculations:item.durations.map((_,quantityIndex)=>({quantityIndex,sameEndpoints:true,startRef:'T1',startClockIndex:0,endRef:'T2',endClockIndex:0}))}));return validateTemporalReview({status:'evaluated',checks},catalog,body)};
 it('does not miscalculate a stated next-day deadline as zero minutes',()=>{expect(review('现在下午五点三十一。\n二十四小时以后是明天下午五点三十一。')).toMatchObject({verified:true,issues:[]});});
 it('still blocks the wrong duration across an explicit day boundary',()=>{const result=review('现在下午五点三十一。\n十二小时以后是明天下午五点三十一。');expect(result.verified).toBe(true);expect(result.issues.join('')).toContain('1440分钟');});
 it('does not invent a day boundary for a backwards clock',()=>{expect(review('现在下午五点三十一。\n十二小时以后是清早五点三十一。').verified).toBe(false);});
});

it('keeps relative-day prose periods in the temporal semantic catalog',()=>{expect(temporalReviewCatalog('明天清早那个点再来。')).toHaveLength(1);expect(temporalReviewCatalog('今天下午等消息。')).toHaveLength(1);});


describe('bounded temporal audit response',()=>{
 it('retains global identities and validates a timer across two response batches',()=>{
  const body='时钟十八点十二。\n倒计时23:50:00。\n时钟十八点二十二。\n倒计时23:40:00。';const catalog=temporalReviewCatalog(body);
  const refs=temporalReviewBatches(catalog,undefined,2);expect(refs).toEqual([['T1','T2'],['T3','T4']]);
  const rows=catalog.map(row=>({ref:row.id,status:'supported',reason:'同一连续场景的钟表与倒计时，有明确事件边界。',calculations:[],countdownCalculations:row.countdowns.map((_,readingIndex)=>row.id==='T2'?{readingIndex,timerId:'期限',relation:'baseline',reason:'同一计时器首次显示，作为读数基准。'}:{readingIndex,timerId:'期限',relation:'elapsed',earlierRef:'T2',earlierReadingIndex:0,startClockId:'T1:C1',endClockId:'T3:C1',elapsedConstraint:'eq',reason:'两个钟表为同一计时器两次观察的明确时刻。'})}));
  let audit:any={status:'evaluated',checks:[]};for(const batch of refs)audit=mergeTemporalReviewBatch(audit,batch,{temporalAudit:{status:'evaluated',checks:rows.filter(row=>batch.includes(row.ref))}});
  expect(validateTemporalReview(audit,catalog,body)).toMatchObject({verified:true,issues:[],unresolved:[]});
  const prompt=temporalReviewPrompt(body,catalog,'同一连续事件','',[],false,refs[1]);expect(prompt).toContain('本批只审查并返回这些编号：["T3","T4"]');expect(prompt).toContain('T1:C1');expect(prompt).toContain('T2');
 });
 it('does not accept an omitted, duplicate, unrequested or unfinished batch',()=>{
  for(const value of [{temporalAudit:{status:'evaluated',checks:[]}},{temporalAudit:{status:'evaluated',checks:[{ref:'T1'},{ref:'T1'}]}},{temporalAudit:{status:'evaluated',checks:[{ref:'T9'}]}},{temporalAudit:{status:'pending',checks:[{ref:'T1'}]}}])expect(()=>mergeTemporalReviewBatch({status:'evaluated',checks:[]},['T1'],value)).toThrow();
  expect(()=>temporalReviewBatches(temporalReviewCatalog('九点离开。'),['T99'])).toThrow();
 });
});

it('passes preceding batch timer identities without guessing or merging different objects',()=>{
 const body='时钟十八点十二。\n倒计时23:50:00。\n时钟十八点二十二。\n倒计时23:40:00。';const catalog=temporalReviewCatalog(body);
 const prior={status:'evaluated',checks:[{ref:'T2',reason:'任务页面首次倒计时读数',countdownCalculations:[{readingIndex:0,timerId:'既有任务期限',relation:'baseline',reason:'任务页面首次显示的基准读数'}]}]};
 const prompt=temporalReviewPrompt(body,catalog,'','',[],false,['T3','T4'],prior);
 expect(prompt).toContain('既有任务期限');expect(prompt).toContain('复用其timerId原字符串');expect(prompt).toContain('不同对象或身份未确认不得强行合并');
 const correction=temporalReviewRepairPrompt(prior,['T4'],['T4倒计时无法复算'],catalog,body,'');expect(correction).toContain('既有任务期限');expect(correction).toContain('不要求再凭空补另一侧');
});

describe('spoken adjacent duration numbers',()=>{
 it('preserves ranges without weakening explicit precise durations',()=>{
  const q=temporalNumbers('按了三四秒，少了五六分钟，等了一两小时，三十四秒，34秒。').durations;
  expect(q.slice(0,3).map(v=>v.minuteBounds)).toEqual([{min:3/60,max:4/60},{min:5,max:6},{min:60,max:120}]);
  expect(q.slice(3).map(v=>v.minutes)).toEqual([34/60,34/60]);expect(q.slice(3).every(v=>!v.minuteBounds)).toBe(true);
 });
 it.each([['十八点零五',false],['十八点零六',false],['十九点零一',true]])('checks actual elapsed bounds for %s', (end,conflict)=>{
  const body='下午十八点整出发。\n到达时下午'+end+'。\n这段路用了五六分钟。';const catalog=temporalReviewCatalog(body);
  const checks=catalog.map(item=>({ref:item.id,status:'supported',reason:'同一行程的起止钟点由原文明示，可以计算实际时长。',calculations:item.durations.map((_,quantityIndex)=>({quantityIndex,sameEndpoints:true,startClockId:'T1:C1',endClockId:'T2:C1'}))}));
  const result=validateTemporalReview({status:'evaluated',checks},catalog,body);expect(result.errors).toEqual([]);expect(result.issues.length>0).toBe(conflict);
 });
});


it('preserves approximate suffixes across duration units without claiming exact arithmetic',()=>{
 for(const [text,minutes] of [['七个钟头上下',420],['30分钟上下',30],['十秒上下',1/6]] as const){
  expect(temporalNumbers(text).durations[0]).toMatchObject({original:text,minutes,operator:'unknown'});
 }
 expect(temporalNumbers('七个钟头').durations[0]).toMatchObject({operator:'eq',minutes:420});
});


describe('relative-day and day-phase review coverage',()=>{
 it('includes relative-day events without numeric clocks or period suffixes',()=>{
  const body='前天我在门口，你怎么知道的。\n昨天的配送授权到头了。\n前天你在楼上待过。';
  const catalog=temporalReviewCatalog(body);expect(catalog.map(row=>row.evidence)).toEqual(body.split('\n'));
  expect(catalog.every(row=>row.clocks.length===0 && row.durations.length===0)).toBe(true);
 });
 it('includes explicit day-phase changes without inventing exact clock boundaries',()=>{
  const catalog=temporalReviewCatalog('天刚亮透，他出了门。\n已经下午了。\n普通动作。');
  expect(catalog).toHaveLength(2);expect(catalog.every(row=>row.clocks.length===0)).toBe(true);
 });
});
