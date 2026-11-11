import {chapterObligationEvidencePrompt,materializeChapterObligationEvidence} from './chapter-alignment-contract';
import {chapterMissingItemTexts} from './chapter-alignment-contract';
import {chapterObligationWritingContext,chapterObligationRepairTargets,mergeChapterObligationRepairs} from './chapter-alignment-contract';
import {describe,it,expect} from 'vitest';
import {chapterObligationCatalog,validateChapterObligationReview,parseChapterAlignmentReview,mergeChapterReviewContractCorrection,chapterAlignmentReviewContract,chapterReviewContractCorrectionDirective} from './chapter-alignment-contract';
const full=()=>JSON.parse(chapterAlignmentReviewContract().split('结构如下：')[1]);
describe('whole chapter review contract',()=>{
  it('recovers a valueless empty member without changing findings or quoted text',()=>{
    const value=full();value.pass=false;value.prosePassed=false;value.contradictions=[{summary:'实际逻辑冲突，不能丢弃'}];value.requiredEvents=[{event:'实际事件',covered:false,evidence:'引文中的 ,""} 必须保留'}];
    const raw=JSON.stringify(value);
    const damaged=raw.replace('"requiredEvents":[','"requiredEvents":[{"event":"额外事件","covered":false,"evidence":"真实引文",""},');
    const parsed=parseChapterAlignmentReview(damaged);expect(parsed.errors).toEqual([]);
    expect(parsed.value.contradictions).toEqual(value.contradictions);expect(parsed.value.pass).toBe(false);expect(parsed.value.prosePassed).toBe(false);
    expect(parsed.value.requiredEvents[1]).toEqual(value.requiredEvents[0]);
    expect(parseChapterAlignmentReview(raw.replace('"requiredEvents":[','"requiredEvents":[{"event":"事件","evidence":"原文","未命名的非空证据"},')).value).toBeNull();
  });
  it('relocates supplied report fields without inventing scores or discarding blockers',()=>{
    const value=full();value.pass=false;value.prosePassed=false;value.contradictions=[{summary:'实际缺陷'}];value.readerGoals.click.status='weak';
    const goals=value.readerGoals,evidence=value.evidence;
    value.sourceQualityAudit.readerGoals=goals;value.sourceQualityAudit.evidence=evidence;delete value.readerGoals;delete value.evidence;
    const result=parseChapterAlignmentReview(JSON.stringify(value));expect(result.errors).toEqual([]);expect(result.value.readerGoals).toEqual(goals);expect(result.value.evidence).toEqual(evidence);
    expect(result.value.pass).toBe(false);expect(result.value.contradictions).toEqual(value.contradictions);expect(result.value.prosePassed).toBe(false);
  });
  it('does not guess between conflicting duplicates and fills missing reader goals as unknown',()=>{
    const value=full();value.sourceQualityAudit.readerGoals={click:{status:'unknown'}};
    expect(parseChapterAlignmentReview(JSON.stringify(value)).errors.join('')).toContain('相互不同');
    delete value.readerGoals;delete value.sourceQualityAudit.readerGoals;
    const parsed=parseChapterAlignmentReview(JSON.stringify(value));
    expect(parsed.invalidPaths).not.toContain('readerGoals');
    expect(parsed.value.readerGoals).toMatchObject({
      click:{status:'unknown'},completion:{status:'unknown'},sharing:{status:'unknown'},immersion:{status:'unknown'},
    });
  });
  it('patches only invalid fields and refuses duplicate, omitted or valid-field edits',()=>{
    const value=full();value.pass=false;value.contradictions=[{summary:'原有事实冲突'}];delete value.causalAudit;
    const original=parseChapterAlignmentReview(JSON.stringify(value));const patch={corrections:[{path:'causalAudit',value:full().causalAudit}]};
    const merged=mergeChapterReviewContractCorrection(original,patch);expect(merged.contradictions).toEqual(value.contradictions);expect(merged.pass).toBe(false);expect(parseChapterAlignmentReview(JSON.stringify(merged)).errors).toEqual([]);
    expect(chapterReviewContractCorrectionDirective(original)).toContain('不要重发完整报告');
    for(const corrections of [[],[{path:'pass',value:true}],[...patch.corrections,...patch.corrections]])expect(()=>mergeChapterReviewContractCorrection(original,{corrections})).toThrow('必须且仅');
    expect(chapterReviewContractCorrectionDirective(parseChapterAlignmentReview('{"rows":{"one":{}, {"status":"placeholder"}}}'))).toContain('不得复制损坏JSON');
  });
  it('publishes one valid full JSON skeleton with every source axis',()=>{
    const value=full(); expect(Object.keys(value.sourceQualityAudit.checks)).toEqual(['promise','continuity','agency','professional','progression','voice']);
    expect(parseChapterAlignmentReview(JSON.stringify(value)).errors).toEqual([]);
  });
  it('rejects anonymous nested rows without falling back to a valid internal object',()=>{
    const raw='{"pass":false,"sourceQualityAudit":{"version":1,"checks":{"promise":{"status":"supported"},{"status":"supported"}}}}';
    const result=parseChapterAlignmentReview(raw);expect(result.value).toBeNull();expect(result.errors[0]).toContain('完整JSON语法无效');
  });
  it('never treats a nested finding or array as a complete report',()=>{
    expect(parseChapterAlignmentReview('{"status":"supported","evidence":"正文"}').errors).toContain('正文语言验收缺少prosePassed明确结论');
    expect(parseChapterAlignmentReview('[]').value).toBeNull();
  });
  it('fills only the missing axis and preserves original blocking findings and flags',()=>{
    const original=full();original.prosePassed=false;original.pass=false;original.contradictions=[{kind:'language',summary:'已举证的语言问题'}];delete original.sourceQualityAudit.checks.professional;
    const parsed=parseChapterAlignmentReview(JSON.stringify(original));expect(parsed.invalidPaths).toEqual(['sourceQualityAudit.checks.professional']);
    const merged=mergeChapterReviewContractCorrection(parsed,full());expect(merged.contradictions).toEqual(original.contradictions);expect(merged.prosePassed).toBe(false);expect(merged.pass).toBe(false);
    expect(parseChapterAlignmentReview(JSON.stringify(merged)).errors).toEqual([]);
  });
});


describe('fixed source action coverage',()=>{
 const first=JSON.stringify({character:'甲',action:'甲到十四楼核验门牌',result:'确认门牌后离开'}),second=JSON.stringify({character:'乙',action:'乙说"收到"并保存记录',result:'记录留存'});
 const outline='核心内容：行动与结果必须发生。\n人物行动：'+first+'；'+second+'\n本章结尾钩子：继续核对';
 it('retains exact stable source rows including escaped quotes and repeats',()=>{expect(chapterObligationCatalog(outline+'\n人物行动：'+first)).toEqual([{ref:'M1',source:first},{ref:'M2',source:second}]);});
 it('does not accept a shortened reviewer inventory or claim downstairs proves the floor',()=>{const catalog=chapterObligationCatalog(outline);const row={ref:'M1',status:'covered',evidence:['甲走进门厅。'],reason:'已经走到门厅，所以认为完整行动已经完成。'};expect(validateChapterObligationReview([row],catalog,'甲走进门厅。').errors.join('')).toContain('明确楼层');expect(validateChapterObligationReview([row],catalog,'甲走进门厅。').errors.join('')).toContain('漏项：M2');});
 it('normalizes Chinese floors without forcing source prose and preserves missing action findings',()=>{const catalog=chapterObligationCatalog(outline),body='甲到了14层，核对门牌后离开。';const result=validateChapterObligationReview([{ref:'M1',status:'covered',evidence:[body],reason:'本人已到指定楼层，核对门牌后离开。'},{ref:'M2',status:'missing',evidence:[],reason:'正文没有乙保存记录的行动及留存结果。'}],catalog,body);expect(result.errors).toEqual([]);expect(result.findings).toHaveLength(1);});
 it('keeps confirmed highlights in the fixed obligation inventory',()=>{
  const withHighlight=outline+'\n高光场景：\n- 主角当众拒绝签字（前文已铺垫）\n- 三处签字对上是同一只手（值班室桌角）';
  const catalog=chapterObligationCatalog(withHighlight);
  expect(catalog.map(row=>row.source)).toContain('主角当众拒绝签字（前文已铺垫）');
  expect(catalog.map(row=>row.source)).toContain('三处签字对上是同一只手（值班室桌角）');
  const inline=chapterObligationCatalog('爽点设置：主角当众拒绝签字（前文已铺垫）；三处签字对上是同一只手');
  expect(inline.map(row=>row.source)).toContain('主角当众拒绝签字（前文已铺垫）');
  expect(inline.map(row=>row.source)).toContain('三处签字对上是同一只手');
  const duplicateViews=chapterObligationCatalog('爽点设置：净面摸到耳机（老周放手）；净面摸到耳机（另一个触发）\n高光场景：\n- 净面摸到耳机（第三个触发）');
  expect(duplicateViews.filter(row=>row.source.includes('净面摸到耳机'))).toHaveLength(1);
 });
});

it('shares the same fixed author inventory between writing input and complete review skeleton',()=>{
 const outline='人物行动：{"character":"甲","action":"赶到仓库交接证物","result":"被退回"}';
 const data=JSON.parse(chapterObligationWritingContext(outline).split('\n').at(-1)!);expect(data).toEqual(chapterObligationCatalog(outline));
 const contract=JSON.parse(chapterAlignmentReviewContract(data).split('结构如下：')[1]);expect(contract.obligationChecks.map((row:any)=>row.ref)).toEqual(['M1']);expect(chapterObligationWritingContext('无行动字段')).toBe('');
});
it('repairs only a broken obligation quote without erasing another confirmed missing action',()=>{
 const catalog=[{ref:'M1',source:'原始行动一'},{ref:'M2',source:'原始行动二'}];const original=[{ref:'M1',status:'missing',reason:'行动一在原文没有实际发生',evidence:[]},{ref:'M2',status:'covered',reason:'引用尚未定位',evidence:['错误引文']}];
 const targets=chapterObligationRepairTargets(original,['M2行动证据不能定位实际正文'],catalog);expect(targets).toEqual(['M2']);const fixed={ref:'M2',status:'covered',reason:'沿实际原文核对行动完成',evidence:['真实引文']};
 expect(mergeChapterObligationRepairs(original,targets,[fixed])).toEqual([original[0],fixed]);
 for(const invalid of [[],[fixed,fixed],[{ref:'M1',status:'covered'}]])expect(()=>mergeChapterObligationRepairs(original,targets,invalid)).toThrow();
});

it('keeps named missing-item explanations instead of replacing them with object text',()=>{
 expect(chapterMissingItemTexts([' 原行动缺失 ',{ref:'M2',summary:'指定人物未完成交接'},{reason:'结果尚未发生'}])).toEqual(['原行动缺失','指定人物未完成交接','结果尚未发生']);
 expect(()=>chapterMissingItemTexts([{ref:'M2'}])).toThrow();
});

it('repairs a paraphrased dialogue quote using actual paragraph IDs and preserves the original finding',()=>{
 const body='“跟单没关系。”\n\n然后就不回了。';const old=[{ref:'M6',status:'covered',reason:'韩磊只回复一句话没有继续解释',evidence:['韩磊：跟单没关系。然后就不回了。']}];const errors=['M6行动证据不能定位实际正文'];
 const rows=materializeChapterObligationEvidence([{ref:'M6',status:'missing',reason:'试图重判',evidenceAnchorIds:['body:p1','body:p2']}],old,errors,body);
 expect(rows[0]).toMatchObject({status:old[0].status,reason:old[0].reason,evidence:['“跟单没关系。”','然后就不回了。']});
 expect(chapterObligationEvidencePrompt(old,['M6'],errors,body)).toContain('body:p2');
 expect(()=>materializeChapterObligationEvidence([{ref:'M6',evidenceAnchorIds:['body:p99']}],old,errors,body)).toThrow();
});

it('offers only canonical paragraph IDs and does not send unrelated fixed-action receipts again',()=>{
 const body='老李拿起台账，叫来负责人核验。随后锁上房门。\n\n负责人核对了签名，当场签收原件。';
 const old=[{ref:'M1',status:'covered',reason:'已经发生了核验动作',evidence:['非原文引文']},
            {ref:'M2',status:'missing',reason:'另一项任务尚未完成',evidence:[]}];
 const prompt=chapterObligationEvidencePrompt(old,['M1'],['M1行动证据不能定位实际正文'],body);
 expect(prompt).toContain('body:p1');
 expect(prompt).toContain('body:p2');
 expect(prompt).not.toContain('body:p1:c1');
 expect(prompt).not.toContain('"ref":"M2"');
 const repaired=materializeChapterObligationEvidence(
   [{ref:'M1',status:'missing',reason:'不能改判',evidenceAnchorIds:['body:p1','body:p2']}],
   old,['M1行动证据不能定位实际正文'],body);
 expect(repaired[0].status).toBe('covered');
 expect(repaired[0].reason).toBe(old[0].reason);
 expect(repaired[0].evidence).toHaveLength(2);
 expect(()=>materializeChapterObligationEvidence(
   [{ref:'M1',status:'covered',evidenceAnchorIds:['body:p1:c1']}],old,
   ['M1行动证据不能定位实际正文'],body)).toThrow(/不存在的正文证据编号/);
 expect(()=>materializeChapterObligationEvidence(
   [{ref:'M1',status:'covered',evidenceAnchorIds:['body:p99']}],old,
   ['M1行动证据不能定位实际正文'],body)).toThrow(/body:p99/);
});
it('uses one evidence-address protocol and keeps only the targeted original chapter actions',()=>{
 const body='李先生拿起台账核验。\n\n负责人当场签收了原件。';
 const old=[{ref:'M1',status:'covered',reason:'核验和签收均已发生',evidence:['不连续的转述']}];
 const catalog=[{ref:'M1',source:'拿起台账并完成核验签收'},{ref:'M2',source:'另一项尚未开始的行动'}];
 const prompt=chapterObligationEvidencePrompt(old,['M1'],['M1行动证据不能定位实际正文'],body,catalog);
 expect(prompt).toContain('拿起台账并完成核验签收');
 expect(prompt).not.toContain('另一项尚未开始的行动');
 expect(prompt).toContain('evidenceAnchorIds');
 expect(prompt).toContain('body:p2');
});

it('accepts exact short result evidence with action context while retaining location and context gates',()=>{
 const catalog=[{ref:'M1',source:'接听电话后挂断'}],body='她接起电话，让对方别再打来。\n\n挂断。';
 const row={ref:'M1',status:'covered',reason:'接听与拒绝之后挂断，行动和结果已有原文依据。',evidence:['她接起电话，让对方别再打来。','挂断。']};
 expect(validateChapterObligationReview([row],catalog,body).errors).toEqual([]);
 expect(validateChapterObligationReview([{...row,evidence:['挂断。']}],catalog,body).errors.join('')).toContain('缺少可核对上下文');
 expect(validateChapterObligationReview([{...row,evidence:[body,'断线。']}],catalog,body).errors.join('')).toContain('不能定位');
 expect(validateChapterObligationReview([{...row,evidence:[body,'']}],catalog,body).errors.join('')).toContain('不能定位');
 const repaired=materializeChapterObligationEvidence([{ref:'M1',evidenceAnchorIds:['body:p1','body:p2']}],[row],['M1行动证据不能定位实际正文'],body);
 expect(validateChapterObligationReview(repaired,catalog,body).errors).toEqual([]);expect(repaired[0].reason).toBe(row.reason);
});

it('recognizes an actual elevator arrival display without demanding a repeated floor suffix',()=>{
 const catalog=[{ref:'M1',source:'甲坐电梯上到14楼'}],row={ref:'M1',status:'covered',reason:'本人乘电梯到目标楼层并走出，地点与行动已经发生。'};
 const body='数字跳到14，电梯响了一声，停稳。\n\n她走出电梯，站到了门口。';
 expect(validateChapterObligationReview([{...row,evidence:body.split('\n\n')}],catalog,body).errors).toEqual([]);
 for(const text of ['她按了14，准备等电梯。','如果数字跳到14，电梯停稳，她就出去。','数字跳到14，电梯将会停稳。','屏幕数字跳到14，订单停稳了。','数字跳到14分钟，电梯停稳。'])expect(validateChapterObligationReview([{...row,evidence:[text]}],catalog,text).errors.join('')).toContain('明确楼层');
});

 it('does not turn a demonstrative relationship layer into floor one', async()=>{
    const {validateChapterObligationReview}=await import('./chapter-alignment-contract');
    const body='她借钱给他，双方说好以后还。';
    const row={ref:'M1',status:'covered',evidence:[body],reason:'实际借款与归还约定完成双方关系变化'};
    expect(validateChapterObligationReview([row],[{ref:'M1',source:'同盟在钱这一层上落地。'}],body).errors).toEqual([]);
    expect(validateChapterObligationReview([row],[{ref:'M1',source:'她借钱给他，随后到达一层。'}],body).errors).toContain('M1行动证据未覆盖章纲明确楼层；到楼下或他人到达不能代替本人到达');
  });


it.each(['调查多了一层他躲不开的旧关系','计划蒙上一层阴影','同盟多了一层顾虑','同一层意思已说清楚','这一层关系成立'])('does not convert abstract layers into physical destinations: %s',source=>{
 const body='乙提起甲过去的经历，她才明白双方原来相识。';
 const row={ref:'M1',status:'covered',reason:'人物经过交流明白双方关系，行动及关系变化已经呈现。',evidence:[body]};
 expect(validateChapterObligationReview([row],[{ref:'M1',source}],body).errors).toEqual([]);
});
it.each(['她到达一层。','她进入地下二层。','她在一层的办公室交接材料。','她抵达第十四层。'])('retains explicit physical floor obligations: %s',source=>{
 const body='她在楼下等消息，没有进入大楼。';
 const row={ref:'M1',status:'covered',reason:'人物等在楼下，缺少本人到达指定楼层的行动。',evidence:[body]};
 expect(validateChapterObligationReview([row],[{ref:'M1',source}],body).errors.join('')).toContain('明确楼层');
 expect(validateChapterObligationReview([{...row,evidence:[source]}],[{ref:'M1',source}],source).errors).toEqual([]);
});
