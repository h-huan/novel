import { describe, expect, it } from 'vitest';
import { describeCrossStagePathDesign } from './cross-stage-review';
import { bindCrossStageRepairActionCoordinates, crossStageRepairObligations, crossStageRepairPlanDirective, describeCrossStageRepairPlanValidation, bindCrossStagePromiseEvidence, crossStagePromiseCatalog, crossStagePromiseReviewInputs, crossStagePromiseFindings, crossStageAdvisories, crossStageBlockingIssues, describeCrossStageReviewValidation } from './cross-stage-review';

const verdict = { consistent: true, contradictions: [], unrelatedInventions: [] };
describe('provisional upstream path design',()=>{
  it('rejects omitted counterexamples and edits, while allowing an honest blocked path',()=>{
    const obligations=[{ref:'P2',path:'scopeBreakdown[1].outcome',outcome:'完成核验并交付结论'}];
    const mechanisms=JSON.stringify({world:[{rules:'有权限机构按手续取得原件并核验。'}]});
    const value={plans:[{ref:'P2',status:'feasible',mechanismRefs:['S1'],actions:['机构在本阶段完成原件核验并把结论实际交给主角。'],remainingCounterexamples:[]}],counterexampleChecks:[{ref:'F1',conditionChange:'由已授权机构实际取得并核验，而不是等待申请返回。'}]};
    expect(describeCrossStagePathDesign(value,obligations,mechanisms,['尚未取得原件'])).toEqual([]);
    expect(describeCrossStagePathDesign({...value,counterexampleChecks:[]},obligations,mechanisms,['尚未取得原件']).length).toBeGreaterThan(0);
    expect(describeCrossStagePathDesign({...value,edits:[]},obligations,mechanisms,['尚未取得原件']).length).toBeGreaterThan(0);
    expect(describeCrossStagePathDesign({...value,plans:[{...value.plans[0],mechanismRefs:['S999']}]},obligations,mechanisms,['尚未取得原件']).length).toBeGreaterThan(0);
    expect(describeCrossStagePathDesign({plans:[{ref:'P2',status:'blocked',remainingCounterexamples:['本阶段没有合法取得原件的既有条件']} ]},obligations,mechanisms,['尚未取得原件'])).toEqual([]);
  });
});
describe('cross-module review classification and protocol', () => {
  it('protects stage outcomes when a source failure carries chapter ownership instead of promise labels',()=>{
    const brief=JSON.stringify({confirmedStory:{scopeBreakdown:[{chapters:1,outcome:'取得筹码'},{chapters:2,outcome:'查明责任人'},{chapters:1,outcome:'完成救援'}]}});
    const rows=[{id:'chapter-before',chapterIndex:1},{id:'chapter-risk',chapterIndex:2},{id:'chapter-dependent',chapterIndex:3},{id:'chapter-final',chapterIndex:4}];
    const obligations=crossStageRepairObligations(brief,['chapter-risk-B-content-1：来源未排除另一条路径'],rows,rows.map(row=>row.id));
    expect(obligations.map(row=>row.ref)).toEqual(['P2']);
    expect(describeCrossStageRepairPlanValidation({edits:[{anchorId:'E1',replacement:'只能提出猜测'}]},obligations,'{}')).toContain('repairPlans必须逐项覆盖本批固定成果');
    expect(crossStageRepairObligations(brief,['来源字段 chapters[3].content 与已确认结果互斥'],rows).map(row=>row.ref)).toEqual(['P3']);
    expect(crossStageRepairObligations(brief,['人物资料中的取得条件不足'],rows,['chapter-dependent']).map(row=>row.ref)).toEqual(['P2']);
    expect(crossStageRepairObligations(brief,['book-B-content.scenes.1.outcome-0：来源条件不足'],[...rows,{id:'book',chapterIndex:null}],['book','chapter-risk']).map(row=>row.ref)).toEqual(['P2']);
    expect(crossStageRepairObligations(brief,['【阶段兑现 P1 chapter-before】取得失败']).map(row=>row.ref)).toEqual(['P1']);
  });
  it('binds only an unambiguous verbatim action in an actual edited position, then applies the unchanged strict plan gate',()=>{
    const obligations=[{ref:'P1',path:'scopeBreakdown[0].outcome',outcome:'有权限机构完成取得和核验'}];
    const source=JSON.stringify({world:[{rules:'机构按合法程序可取得副本并交付核验结果'}]});
    const evidence='机构实际拿到副本，核验之后交给主角。';
    const base=()=>({repairPlans:[{ref:'P1',status:'feasible',mechanismRefs:['S1'],
      actions:[{evidence}],remainingCounterexamples:[]}],
      edits:[{anchorId:'E2',replacement:'先登记。'+evidence,reason:'替代只申请的旧路径'}]});
    const bound=bindCrossStageRepairActionCoordinates(base());
    expect(bound.repairPlans[0].actions[0].anchorId).toBe('E2');
    expect(describeCrossStageRepairPlanValidation(bound,obligations,source)).toEqual([]);
    const ambiguous=base();ambiguous.edits.push({anchorId:'E3',replacement:evidence});
    expect(bindCrossStageRepairActionCoordinates(ambiguous).repairPlans[0].actions[0].anchorId).toBeUndefined();
    expect(describeCrossStageRepairPlanValidation(ambiguous,obligations,source).join()).toContain('没有落实');
    const fabricated=base();fabricated.repairPlans[0].actions[0].evidence='机构早已调取全部过去记录并锁定元凶';
    expect(bindCrossStageRepairActionCoordinates(fabricated).repairPlans[0].actions[0].anchorId).toBeUndefined();
    expect(describeCrossStageRepairPlanValidation(fabricated,obligations,source).join()).toContain('没有落实');
    const explicit=base();explicit.repairPlans[0].actions[0].anchorId='E999';
    expect(bindCrossStageRepairActionCoordinates(explicit).repairPlans[0].actions[0].anchorId).toBe('E999');
    expect(describeCrossStageRepairPlanValidation(explicit,obligations,source).join()).toContain('没有落实');
    const vague=base();vague.repairPlans[0].actions[0].evidence='待机构回复';
    expect(bindCrossStageRepairActionCoordinates(vague).repairPlans[0].actions[0].anchorId).toBeUndefined();
    expect(describeCrossStageRepairPlanValidation(vague,obligations,source).join()).toContain('没有落实');
  });
  it('requires an achieved-outcome repair plan to be grounded in source mechanisms and actual edited actions', () => {
    const brief=JSON.stringify({confirmedStory:{scopeBreakdown:[{outcome:'取得原始材料并查明责任人。'}]}});
    const obligations=crossStageRepairObligations(brief,['【阶段兑现 P1 c】只申请，不代表实际取得']);
    const mechanism=JSON.stringify({world:[{rules:'有权限的机构可按手续调取原件并核验。'}]});
    expect(obligations.map(item=>item.ref)).toEqual(['P1']);
    expect(crossStageRepairObligations(brief,['c的普通字段有误'])).toEqual([]);
    expect(crossStageRepairPlanDirective(obligations,mechanism)).toContain('诊断是待解决的缺口，不是降低成果的指令');
    const value={repairPlans:[{ref:'P1',status:'feasible',mechanismRefs:['S1'],actions:[{anchorId:'E1',evidence:'机构实际调取原件，核验后将结论告知主角。'}],remainingCounterexamples:[]}],edits:[{anchorId:'E1',replacement:'主角报备；机构实际调取原件，核验后将结论告知主角。'}]};
    expect(describeCrossStageRepairPlanValidation(value,obligations,mechanism)).toEqual([]);
    const byPosition={...value,repairPlans:[{...value.repairPlans[0],actions:[{anchorId:'E1'}]}]};
    expect(describeCrossStageRepairPlanValidation(byPosition,obligations,mechanism)).toEqual([]);
    expect(describeCrossStageRepairPlanValidation({...byPosition,repairPlans:[{...byPosition.repairPlans[0],actions:[{anchorId:'E999'}]}]},obligations,mechanism).join()).toContain('没有落实');
    const retained={...value,edits:[{anchorId:'E2',replacement:'另一处必要条件实际修订。'}]};
    expect(describeCrossStageRepairPlanValidation(retained,obligations,mechanism,[{id:'E1',value:value.edits[0].replacement}])).toEqual([]);
    expect(describeCrossStageRepairPlanValidation(retained,obligations,mechanism,[{id:'E1',value:'仅提出申请，没有实际取得。'}]).length).toBeGreaterThan(0);
    expect(describeCrossStageRepairPlanValidation({...value,edits:[{anchorId:'E1',replacement:'主角提交申请，等待以后核验。'}]},obligations,mechanism).join()).toContain('没有落实');
    expect(describeCrossStageRepairPlanValidation({...value,repairPlans:[{...value.repairPlans[0],mechanismRefs:['S999']}]},obligations,mechanism).join()).toContain('独立机制');
    expect(describeCrossStageRepairPlanValidation({...value,repairPlans:[{...value.repairPlans[0],remainingCounterexamples:['另一路径尚未排除']}]},obligations,mechanism).join()).toContain('未排除');
    const blocked={repairPlans:[{ref:'P1',status:'blocked',remainingCounterexamples:['现有资源无法取得必要原件']}],edits:[]};
    expect(describeCrossStageRepairPlanValidation(blocked,obligations,mechanism)).toEqual([]);
    expect(describeCrossStageRepairPlanValidation({...blocked,edits:value.edits},obligations,mechanism).join()).toContain('不能返回修改');
    expect(describeCrossStageRepairPlanValidation({},obligations,mechanism).join()).toContain('逐项覆盖');
  });
  it('isolates stage evidence and preserves the actual repair owner when later stages change', () => {
    const brief=JSON.stringify({confirmedStory:{scopeBreakdown:[{chapters:1,outcome:'取得筹码'},{chapters:2,outcome:'查明责任人'}]}});
    const rows=[{id:'first',chapterIndex:1,content:'仅申请，尚未取得筹码。'},{id:'second',chapterIndex:2,content:'继续调查。'},{id:'third',chapterIndex:3,content:'查明责任人。'}];
    const inputs=crossStagePromiseReviewInputs(brief,rows);
    expect(JSON.parse(inputs[0].candidateText).chapters.map((row:any)=>row.id)).toEqual(['first']);
    expect(JSON.parse(inputs[1].candidateText).chapters.map((row:any)=>row.id)).toEqual(['second','third']);
    const changed=crossStagePromiseReviewInputs(brief,rows.map(row=>row.id==='third'?{...row,content:'已兑现终局。'}:row));
    expect(changed[0]).toEqual(inputs[0]);
    expect(crossStagePromiseCatalog(inputs[1].brief).map(row=>row.ref)).toEqual(['P2']);
    const findings=crossStagePromiseFindings({promiseChecks:[{ref:'P1',status:'weakened',candidateEvidenceRef:'S2',reason:'当前只申请，未取得承诺筹码'}]},inputs[0].candidateText);
    expect(findings[0]).toContain('【阶段兑现 P1 first】');
    expect(findings[0]).toContain('仅申请，尚未取得筹码。');
    expect(crossStagePromiseFindings({promiseChecks:[{ref:'P2',status:'missing',reason:'缺少本阶段取得行动'}]},inputs[1].candidateText)[0]).toContain('P2 second third');
    expect(()=>crossStagePromiseReviewInputs(JSON.stringify({scopeBreakdown:[{outcome:'未分配阶段'}]}),rows)).toThrow('章节分配');
  });
  it('rejects the logged green overall verdict when confirmed stage outcomes were never checked', () => {
    const brief=JSON.stringify({confirmedStory:{scopeBreakdown:[{outcome:'甲查明真相并取得主动权。'},{outcome:'乙获救，主角付出工作代价。'}]}});
    const candidate=JSON.stringify({chapters:[{content:'甲只有猜测，仍不能采取行动。'},{content:'乙获救，主角丢了工作。'}]});
    expect(crossStagePromiseCatalog(brief)).toHaveLength(2);
    expect(describeCrossStageReviewValidation(verdict,brief,candidate).join('；')).toContain('全部固定阶段');
    const checked={...verdict,consistent:false,promiseChecks:[{ref:'P1',status:'weakened',candidateEvidence:'甲只有猜测，仍不能采取行动。',reason:'已承诺的查明真相被降成猜测，阶段主动权没有兑现'},{ref:'P2',status:'preserved',candidateEvidence:'乙获救，主角丢了工作。',reason:'救人结果与失去工作代价都保留，通过不同合法手段兑现'}]};
    expect(describeCrossStageReviewValidation(checked,brief,candidate)).toEqual([]);
    expect(crossStageBlockingIssues(checked)).toHaveLength(1);
    const diagnosis={canonicalSource:'confirmedStory.scopeBreakdown[0].outcome',conflictingSource:'chapters[0]',evidence:'甲只有猜测，仍不能采取行动。',impact:'确定成果被削弱'};
    expect(crossStageBlockingIssues({...checked,contradictions:[diagnosis]})).toEqual([JSON.stringify(diagnosis)]);
    expect(describeCrossStageReviewValidation({...checked,consistent:true},brief,candidate).join('；')).toContain('自相矛盾');
    expect(describeCrossStageReviewValidation({...checked,promiseChecks:checked.promiseChecks.slice(1)},brief,candidate).length).toBeGreaterThan(0);
    expect(describeCrossStageReviewValidation({...checked,promiseChecks:checked.promiseChecks.map(item=>({...item,candidateEvidence:'基准声称目标已经实现'}))},brief,candidate).join('；')).toContain('候选实际原文');
    const referenced={...checked,promiseChecks:checked.promiseChecks.map((item,index)=>({...item,candidateEvidenceRef:'S'+(index+1),candidateEvidence:'模型不应重写的原文'}))};
    expect(describeCrossStageReviewValidation(referenced,brief,candidate)).toEqual([]);
    expect(bindCrossStagePromiseEvidence(referenced,candidate).promiseChecks[0].candidateEvidence).toBe('甲只有猜测，仍不能采取行动。');
    expect(describeCrossStageReviewValidation({...referenced,promiseChecks:referenced.promiseChecks.map(item=>({...item,candidateEvidenceRef:'S9999'}))},brief,candidate).join('；')).toContain('编号不存在');
  });
  it('retains complete structured diagnoses without dropping evidence or requiring a model rewrite', () => {
    const finding={canonicalSource:'总纲.ending 原方法',conflictingSource:'细纲.ending 新方法',evidence:'两处方法尚未同步',impact:'后续状态无法接上'};
    const value={...verdict,consistent:false,contradictions:[finding]};
    expect(describeCrossStageReviewValidation(value)).toEqual([]);
    expect(JSON.parse(crossStageBlockingIssues(value)[0])).toEqual(finding);
    expect(describeCrossStageReviewValidation({...value,contradictions:[{evidence:'缺少来源'}]}).length).toBeGreaterThan(0);
  });
  it('rejects the logged consistent=true verdict with three unrelated inventions', () => {
    const actualShape = { ...verdict, unrelatedInventions: [
      '当户各建一条 faction，属重复建模，未影响任何已确认事实。',
      '茶楼四章无场景落点，属未被正文使用的地点。',
      '老街口未出现独立场景，仅服务于街面传闻扩散说明。',
    ] };
    expect(describeCrossStageReviewValidation(actualShape).join('；')).toContain('自相矛盾');
    // Historical findings remain intact until a new reviewer classifies them.
    expect(crossStageBlockingIssues(actualShape)).toHaveLength(3);
  });
  it('keeps explicit advisory findings visible without scheduling repairs', () => {
    const value = { ...verdict, warnings: ['背景地点尚未被当前章纲使用'] };
    expect(describeCrossStageReviewValidation(value)).toEqual([]);
    expect(crossStageBlockingIssues(value)).toEqual([]);
    expect(crossStageAdvisories(value)[0]).toContain('背景地点');
  });
  it('preserves actual rule or motivation changes as blockers even with warnings', () => {
    const value = { ...verdict, consistent: false,
      unrelatedInventions: ['角色档案新增长期目标，令其拒绝已确认结局的销票选择'], warnings: ['地点可合并'] };
    expect(describeCrossStageReviewValidation(value)).toEqual([]);
    expect(crossStageBlockingIssues(value)).toEqual(value.unrelatedInventions);
  });
  it.each([
    { ...verdict, consistent: false },
    { ...verdict, contradictions: [{}] },
    { ...verdict, unrelatedInventions: [''] },
    { ...verdict, warnings: '建议' },
    { ...verdict, warnings: [null] },
  ])('rejects incomplete or internally contradictory judgments: %j', value => {
    expect(describeCrossStageReviewValidation(value).length).toBeGreaterThan(0);
  });
});
