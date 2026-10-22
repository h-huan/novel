import * as budgetConfig from '../config/generation-budgets';
beforeEach(()=>vi.spyOn(budgetConfig,'readGenerationBudgets').mockReturnValue({...budgetConfig.GENERATION_BUDGET_DEFAULTS,premiseReselectionMaxCalls:3}));
afterEach(()=>vi.restoreAllMocks());
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ChainController } from './chain.controller';
import { materializePremiseSourceReview, premiseSourceComparisonCatalog, premiseSourceReviewIssues, premiseReserveReselectionPlan, retainReviewedPremises, retainPremiseReviewEvidence, normalizePremiseReselection, normalizeTargetedPremiseReselection, premiseReselectionPlan, premiseSelectionReviewIssues, type PremiseSelectionReview } from './premise-selection-review';
import { ideaCardStructuringDirective, normalizePremiseSelectionPayload } from './idea-discovery-contract';
import { premiseReplacementComparisonIssues } from './premise-selection-review';

const premise = (id: string) => ({ premiseId: id, workingTitle: '题材' + id, storyCore: '具有人物选择与兑现的原池骨架' + id,
  storyCategory: '悬疑', storyCategoryId:'K1', protagonistSituation: '为家人争取生存机会', openingEvent: '具体异常迫使人物亲自行动',
  coreConflict: '具体利益与主动对手对撞', activeChoice: '救人需要承担被遗忘的代价' + id,
  escalation: '每次救人自己的存在逐渐消失', reversalEffect: '旧签字构成超自然代价源头', payoff: '承担存在代价使家属获得赔偿',
  irreplaceableCarrier: '职业权限与利益冲突直接绑定', secondOrderConsequence: '救人也让家庭关系不可逆改变',
  readerQuestion: '人物如何承担不可逆选择后果', differentiation: '差异须实际落在选择与兑现中' });
const compare = (referencePremiseId: string) => ({ referencePremiseId,
  actionDifference: '候选主动改变任务路线，保留项通过固定岗位履职推进',
  escalationDifference: '候选每次行动损失已有资源，保留项面临对手逐步升级限制',
  reversalDifference: '候选反转改变通行条件，保留项反转改变人物责任归属',
  consequenceDifference: '候选承担个人关系代价，保留项承担群体利益与资源代价' });
const selection = () => normalizePremiseSelectionPayload({ pool: ['A', 'B', 'C'].map(premise), selectedPremises: ['A', 'B'].map(premise) }, 2, 3);
const failure: PremiseSelectionReview = { passed: false, issues: [{ kind: 'overlap', premiseId: 'B', referencePremiseId: 'A',
  quote: '每次救人自己的存在逐渐消失', referenceQuote: '每次救人自己的存在逐渐消失', reason: '选择与代价及旧签字反转机制同构' }] };

describe('premise selection before identity lock', () => {
  it('keeps independent source coverage and overlap rejection when self-description is absent', () => {
    const initial=selection();initial.selected.forEach(row=>delete row.differentiation);
    const catalog=premiseSourceComparisonCatalog(initial);
    expect(catalog).toHaveLength(20);
    expect(catalog.some(row=>row.field==='differentiation')).toBe(false);
    const sourceChecks=catalog.map(row=>({ref:row.ref,status:'preserved',reason:'对照原池事实与展开内容，原有约束保持兼容'}));
    expect(premiseSourceReviewIssues({sourceChecks},initial)).toEqual([]);
    expect(premiseSourceReviewIssues({sourceChecks:sourceChecks.slice(1)},initial).length).toBeGreaterThan(0);
    const unknown={sourceChecks:sourceChecks.map((row,index)=>index?row:{...row,status:'unknown'})};
    expect(()=>materializePremiseSourceReview(unknown,initial)).toThrow('来源事实仍未确认');
    expect(premiseSelectionReviewIssues(failure,initial)).toEqual([]);
    expect(failure.passed).toBe(false);
    initial.selected[0].differentiation='他明确声称自己的选择与别人不同';
    expect(premiseSourceComparisonCatalog(initial)).toHaveLength(21);
  });
  it('reuses and reindexes completed review evidence when failed premises are removed', () => {
 const original=normalizePremiseSelectionPayload({pool:['A','B','C'].map(premise),selectedPremises:['A','B','C'].map(premise)},3,3);
 const review:PremiseSelectionReview={passed:false,issues:[{kind:'source_drift',premiseId:'B',referencePremiseId:'B',
   quote:premise('B').activeChoice,referenceQuote:premise('B').storyCore,reason:'决定性物证缺少实际取得和交付条件'}],
   sourceChecks:['A','B','C'].map((id,index)=>({ref:'S'+(index+1)+'.activeChoice',status:id==='B'?'drift':'preserved',reason:'对照原池事实与展开内容，核对当前行动是否保留'})),
   payoffChecks:['A','B','C'].map((id,index)=>({ref:'S'+(index+1)+'.payoff',status:id==='B'?'gap':'supported',actionEvidenceRef:'S'+(index+1)+'.activeChoice',conditionEvidenceRef:'S'+(index+1)+'.escalation',links:[{ref:'S'+(index+1)+'.causalPlan.1',status:id==='B'?'gap':'supported',reason:'逐环核对本题材的实际必要条件是否成立'}],reason:'核对决定性结果的必要行动与条件是否实际成立'})),
   categoryChecks:['A','B','C'].map((id,index)=>({ref:'S'+(index+1)+'.category',status:'fulfilled',evidenceRef:'S'+(index+1)+'.activeChoice',reason:'当前主线选择落实对应分类机制'})),
   genreChecks:['A','B','C'].map((id,index)=>({ref:'S'+(index+1)+'.genre',status:'fulfilled',evidenceRef:'S'+(index+1)+'.activeChoice',reason:'当前人物行动落实本卡已选流派机制'}))};
 const retained=retainReviewedPremises(original,review);
 expect(retained.selection.selected.map(item=>item.premiseId)).toEqual(['A','C']);
 const finalReview=retainPremiseReviewEvidence(original,review,retained.selection);
 expect(finalReview.passed).toBe(true);
 expect(finalReview.issues).toEqual([]);
 expect(finalReview.sourceChecks?.map(row=>row.ref)).toEqual(['S1.activeChoice','S2.activeChoice']);
 expect(finalReview.payoffChecks?.map(row=>row.ref)).toEqual(['S1.payoff','S2.payoff']);
 expect(finalReview.payoffChecks?.map(row=>row.actionEvidenceRef)).toEqual(['S1.activeChoice','S2.activeChoice']);
 expect(finalReview.payoffChecks?.map(row=>row.conditionEvidenceRef)).toEqual(['S1.escalation','S2.escalation']);
 expect(finalReview.payoffChecks?.map(row=>row.links?.[0].ref)).toEqual(['S1.causalPlan.1','S2.causalPlan.1']);
 expect(finalReview.categoryChecks?.map(row=>row.ref)).toEqual(['S1.category','S2.category']);
 expect(finalReview.categoryChecks?.map(row=>row.evidenceRef)).toEqual(['S1.activeChoice','S2.activeChoice']);
 expect(finalReview.genreChecks?.map(row=>row.ref)).toEqual(['S1.genre','S2.genre']);
 expect(finalReview.genreChecks?.map(row=>row.evidenceRef)).toEqual(['S1.activeChoice','S2.activeChoice']);
});

it('does not enter another provider attempt after the last physical call returns invalid comparison JSON', async () => {
    const c=Object.create(ChainController.prototype) as any;
    c.logger={warn:vi.fn(),error:vi.fn()};
    c.realLLM={generate:vi.fn(async(options:any)=>{
      options.physicalCallBudget.remaining--;
      return {content:JSON.stringify({replacements:[]})};
    })};
    const budget={remaining:1};
    const result=await c.llmCallWithRetry('原池协议补正','仅输出JSON',{
      scenario:'idea_generate',physicalCallBudget:budget,validate:()=>false,describeValidation:()=>['缺少必需比较ID']});
    expect(c.realLLM.generate).toHaveBeenCalledTimes(1);expect(budget.remaining).toBe(0);
    expect(result.data).toBeNull();expect(result.validationIssues).toEqual(['缺少必需比较ID']);
  });
  it('compares repaired and pending IDs and reports the exact missing references', () => {
    const current={...selection(),selected:['P1','P14','P8','P4','P5'].map(premise)};
    const issues=premiseReplacementComparisonIssues({replacements:[{replacesPremiseId:'P3',premise:premise('P8'),comparisons:[compare('P1')]}]},current);
    expect(issues.join('；')).toContain('必需ID=["P1","P14","P4","P5"]');
    expect(issues.join('；')).toContain('缺少ID=["P14","P4","P5"]');
  });
  it('corrects all four problem slots in one shared call and independently reviews the complete final selection',async()=>{
    const original=normalizePremiseSelectionPayload({pool:['A','B','C','D','E','F','G','H','I'].map(premise),selectedPremises:['A','B','C','D','E'].map(premise)},5,9);
    const rejected:PremiseSelectionReview={passed:false,issues:['B','C','D','E'].map(premiseId=>({...failure.issues[0],premiseId}))};
    const c=Object.create(ChainController.prototype) as any,finalIds=['A','F','G','H','I'];let remaining=0;
    c.reviewPremiseSelection=vi.fn().mockResolvedValueOnce({passed:true,issues:[]}).mockResolvedValueOnce(rejected)
      .mockImplementation(async(current:any)=>{expect(current.selected.map((p:any)=>p.premiseId)).toEqual(finalIds);return {passed:true,issues:[]};});
    c.llmCallWithRetry=vi.fn(async(_label:string,prompt:string,options:any)=>{
      expect(prompt).toContain('replacements恰好4项');expect(options.physicalCallBudget.remaining).toBe(3);options.physicalCallBudget.remaining--;remaining=options.physicalCallBudget.remaining;
      const data={replacements:['B','C','D','E'].map((replacesPremiseId,index)=>({replacesPremiseId,premise:premise(finalIds[index+1]),comparisons:finalIds.filter(id=>id!==finalIds[index+1]).map(compare)}))};
      expect(options.validate(data)).toBe(true);expect(options.validate({replacements:data.replacements.slice(1)})).toBe(false);
      expect(options.validate({replacements:data.replacements.map(row=>({...row,comparisons:row.comparisons.slice(1)}))})).toBe(false);
      return {data};
    });
    const result=await c.reconcilePremiseSelection(original,5,9,['悬疑'],'');
    expect(result.selected.map((p:any)=>p.premiseId)).toEqual(finalIds);expect(result.selected[0]).toEqual(original.selected[0]);
    expect(result.selectionAudit.finalReview.passed).toBe(true);expect(result.selectionAudit.partial).not.toBe(true);expect(remaining).toBe(2);
    expect(c.llmCallWithRetry).toHaveBeenCalledTimes(1);expect(c.reviewPremiseSelection).toHaveBeenCalledTimes(4);
  });
  it('freezes a comparison-only repair candidate and isolates invalid protocol without another selection round', async () => {
    const original=selection();original.pool.push(premise('D'));
    const c=Object.create(ChainController.prototype) as any;
    c.reviewPremiseSelection=vi.fn().mockResolvedValueOnce({passed:true,issues:[]}).mockResolvedValueOnce(failure)
      .mockImplementation(async(current:any)=>{expect(current.selected.map((p:any)=>p.premiseId)).toEqual(['A']);return {passed:true,issues:[]};});
    c.llmCallWithRetry=vi.fn(async(_label:string,_prompt:string,options:any)=>{
      const row={replacesPremiseId:'B',premise:premise('C'),comparisons:[]};
      expect(options.validate({replacements:[row]})).toBe(false);
      expect(options.validate({replacements:[{...row,premise:premise('D'),comparisons:[compare('A')]}]})).toBe(false);
      expect(options.validate({replacements:[{...row,premise:{...premise('C'),payoff:'改写成新的兑现结果'},comparisons:[compare('A')]}]})).toBe(false);
      expect(options.validate({replacements:[{...row,comparisons:[compare('A')]}]})).toBe(true);
      expect(options.retryInstruction).toContain('保留上次全部完整premise和身份');
      options.physicalCallBudget.remaining-=2;
      return {data:null,validationIssues:['比较协议补正未完成']};
    });
    const result=await c.reconcilePremiseSelection(original,2,4,['悬疑'],'');
    expect(result.selected.map((p:any)=>p.premiseId)).toEqual(['A']);
    expect(result.selectionAudit).toMatchObject({partial:true,unresolvedPremiseIds:['B'],sourceRepairCallsRemaining:1});
    expect(c.llmCallWithRetry).toHaveBeenCalledTimes(1);
  });
  it('重选先逐一比较保留项四项因果差异，不能漏项或四栏复用一句话', () => {
    const candidate=selection();
    const row={replacesPremiseId:'B',premise:premise('B'),comparisons:[compare('A')]};
    expect(premiseReplacementComparisonIssues({replacements:[row]},candidate)).toEqual([]);
    expect(premiseReplacementComparisonIssues({replacements:[{...row,comparisons:[]}]},candidate).length).toBeGreaterThan(0);
    expect(premiseReplacementComparisonIssues({replacements:[{...row,comparisons:[compare('C')]}]},candidate).length).toBeGreaterThan(0);
    const repeated={...compare('A'),actionDifference:'只是在不同职业里使用不同道具',escalationDifference:'只是在不同职业里使用不同道具',reversalDifference:'只是在不同职业里使用不同道具',consequenceDifference:'只是在不同职业里使用不同道具'};
    expect(premiseReplacementComparisonIssues({replacements:[{...row,comparisons:[repeated]}]},candidate).length).toBeGreaterThan(0);
  });
  it('binds evidence to each declared premise and rejects invented references or inconsistent verdicts', () => {
    expect(premiseSelectionReviewIssues(failure, selection())).toEqual([]);
    expect(premiseSelectionReviewIssues({ ...failure, passed: true }, selection()).length).toBeGreaterThan(0);
    for (const change of [{ referencePremiseId: 'C' }, { referencePremiseId: 'B' }, { quote: '输入里不存在的虚构原文' }, { kind: 'unknown' }])
      expect(premiseSelectionReviewIssues({ ...failure, issues: [{ ...failure.issues[0], ...change }] }, selection()).length).toBeGreaterThan(0);
  });
  it('preserves the original pool and unaffected selected facts despite model overwrites', () => {
    const original = selection();
    const result = normalizePremiseReselection({ selectedPremises: [{ ...premise('A'), activeChoice: '篡改原选择' },
      { ...premise('C'), storyCore: '篡改骨架', workingTitle: '篡改暂名' }] }, original, failure, 2, 3, ['悬疑']);
    expect(result.pool).toEqual(original.pool);
    expect(result.selected[0]).toEqual(original.selected[0]);
    expect(result.selected[1].storyCore).toBe(premise('C').storyCore);
    expect(result.selected[1].workingTitle).toBe(premise('C').workingTitle);
    expect(original.selected.map(p => p.premiseId)).toEqual(['A', 'B']);
  });
  it('inherits the single author-selected category without letting the model change it', () => {
    const original = selection();
    delete original.selected[0].storyCategory;
    delete original.pool[0].storyCategory;
    const result = normalizePremiseReselection({ selectedPremises: [{ ...premise('A'), storyCategory: '擅改分类' }, premise('C')] }, original, failure, 2, 3, ['悬疑']);
    expect(result.selected[0].storyCategory).toBe('悬疑');
    expect(original.selected[0].storyCategory).toBeUndefined();
  });
  it.each([['A', 'NEW'], ['B', 'C'], ['A', 'A'], ['A']])('rejects pool expansion, lost protected items, duplicates and shortage: %j', ids => {
    expect(() => normalizePremiseReselection({ selectedPremises: ids.map(premise) }, selection(), failure, 2, 3, ['悬疑'])).toThrow();
  });
  it('passes batch reference content without exposing identity or borrowing its story', () => {
    const a = premise('A'), b = { ...premise('B'), coreConflict: '参照人物独特冲突不应借用' };
    const prompt = ideaCardStructuringDirective(a, [a, b]);
    expect(prompt).toContain(b.coreConflict);
    expect(prompt).toContain('只作边界');
    expect(prompt).not.toContain('"premiseId"');
  });
  it('reviews, reselects in the original pool and reviews again before cards can be generated', async () => {
    const c = Object.create(ChainController.prototype) as any;
    c.reviewPremiseSelection = vi.fn().mockResolvedValueOnce({ passed: true, issues: [] }).mockResolvedValueOnce(failure).mockResolvedValue({ passed: true, issues: [] });
    c.llmCallWithRetry = vi.fn(async (_label: string, prompt: string, options: any) => {
      expect(prompt).toContain('不生成新pool');
      expect(options.validate({ replacements: [{ replacesPremiseId: 'B', premise: premise('NEW') }] })).toBe(false);
      expect(prompt).toContain('每项comparisons须逐一覆盖合并后其余全部最终题材ID');
      expect(prompt).toContain('修订须复查全部筛选字段的同一因果事实');
      expect(prompt).toContain('原池动作的实施者、受益者或接收者未写清时');
      expect(prompt).toContain('replacements恰好1项');
      return { data: { replacements: [{ replacesPremiseId: 'B', premise: premise('C'), comparisons: [compare('A')] }] } };
    });
    const result = await c.reconcilePremiseSelection(selection(), 2, 3, ['悬疑'], '');
    expect(result.selected.map((p: any) => p.premiseId)).toEqual(['A', 'C']);
    expect(c.reviewPremiseSelection).toHaveBeenCalledTimes(4);
    expect(result.selectionAudit.reselectionAttempted).toBe(true);
  });
  it('isolates a repaired duplicate and retains the original unaffected choice after one reselection', async () => {
    const c = Object.create(ChainController.prototype) as any;
    const finalFailure = {...failure, issues:[{...failure.issues[0],premiseId:'A',referencePremiseId:'C'}]};
    c.reviewPremiseSelection = vi.fn().mockResolvedValueOnce({passed:true,issues:[]}).mockResolvedValueOnce(failure)
      .mockResolvedValueOnce({passed:true,issues:[]}).mockResolvedValueOnce(finalFailure);
    c.llmCallWithRetry = vi.fn().mockResolvedValue({ data: { replacements: [{ replacesPremiseId: 'B', premise: premise('C'), comparisons: [compare('A')] }] } });
    c.generationMetrics = {beginRun: vi.fn(()=>({id:'gate'})),finishRun:vi.fn()};
    const result = await c.reconcilePremiseSelection(selection(), 2, 3, ['悬疑'], '');
    expect(result.selected).toEqual([selection().selected[0]]);
    expect(result.selectionAudit).toMatchObject({partial:true,excludedPremiseIds:['C'],completeCardGatePending:true});
    expect(result.selectionAudit.finalReview.passed).toBe(false);
    expect(c.llmCallWithRetry).toHaveBeenCalledTimes(1);
    expect(c.generationMetrics.finishRun).toHaveBeenCalledWith('gate','failed',expect.any(Number),expect.stringContaining('premise_selection_rejected'),expect.stringContaining('仍未通过'));
  });
  it('collects source drift as well as overlap before protecting any selected item', async () => {
    const original = selection();
    const sourceFailure: PremiseSelectionReview = {passed:false,issues:[{kind:'source_drift',premiseId:'A',referencePremiseId:'A',
      quote:original.selected[0].activeChoice,referenceQuote:original.pool[0].storyCore,reason:'展开的行动方向与原池承诺存在互斥事实'}]};
    const c=Object.create(ChainController.prototype) as any;
    c.reviewPremiseSelection=vi.fn().mockResolvedValueOnce(sourceFailure).mockResolvedValueOnce(failure).mockResolvedValue({passed:true,issues:[]});
    const fixed={...premise('A'),activeChoice:'恢复原池行动方向而非错误展开'};
    c.llmCallWithRetry=vi.fn(async (_label:string,prompt:string)=>{
      expect(prompt).toContain('source_drift'); expect(prompt).toContain('overlap');
      expect(prompt).toContain('replacements恰好2项');
      return {data:{replacements:[{replacesPremiseId:'A',premise:fixed,comparisons:[compare('C')]},{replacesPremiseId:'B',premise:premise('C'),comparisons:[compare('A')]}]}};
    });
    const result=await c.reconcilePremiseSelection(original,2,3,['悬疑'],'');
    expect(result.selected[0].activeChoice).toBe(fixed.activeChoice);
    expect(result.selectionAudit.initialReview.issues).toHaveLength(2);
    expect(c.llmCallWithRetry).toHaveBeenCalledTimes(1);
    expect(c.reviewPremiseSelection).toHaveBeenCalledTimes(4);
  });
  it('rechecks only changed overlap pairs after original-pool reselection and drops obsolete pair findings', async () => {
  const original=selection(),overlapCalls:any[]=[];
  const c=Object.create(ChainController.prototype) as any;
  c.reviewPremiseSelection=vi.fn(async(current:any,_standard:string,mode:string,_budget:any,_sourceBatch:boolean,_genres:any,_limiter:any,focus:any)=>{
    if(mode==='overlap'){
      overlapCalls.push({focus,ids:current.selected.map((item:any)=>item.premiseId)});
      return focus ? {passed:true,issues:[]} : failure;
    }
    return {passed:true,issues:[]};
  });
  c.llmCallWithRetry=vi.fn(async(_label:string,_prompt:string,options:any)=>{
    const data={replacements:[{replacesPremiseId:'B',premise:premise('C'),comparisons:[compare('A')]}]};
    expect(options.validate(data)).toBe(true);
    return {data};
  });
  const result=await c.reconcilePremiseSelection(original,2,3,['悬疑'],'');
  expect(result.selected.map((item:any)=>item.premiseId)).toEqual(['A','C']);
  expect(overlapCalls).toEqual([
    {focus:undefined,ids:['A','B']},
    {focus:['C'],ids:['A','C']},
  ]);
  expect(result.selectionAudit.finalReview).toMatchObject({passed:true,issues:[]});
  expect(c.llmCallWithRetry).toHaveBeenCalledTimes(1);
});

it('does not repair fiction if either independent audit fails to complete', async () => {
    const c=Object.create(ChainController.prototype) as any;
    c.reviewPremiseSelection=vi.fn().mockRejectedValueOnce(new Error('审查协议失败')).mockResolvedValueOnce(failure);
    c.llmCallWithRetry=vi.fn();
    await expect(c.reconcilePremiseSelection(selection(),2,3,['悬疑'],'')).rejects.toThrow('独立审查未完成');
    expect(c.reviewPremiseSelection).toHaveBeenCalledTimes(2);
    expect(c.llmCallWithRetry).not.toHaveBeenCalled();
  });
  it('rejects a diversity result delivered to the source-only audit', async () => {
    const c=Object.create(ChainController.prototype) as any;
    c.llmCallWithRetry=vi.fn(async (_label:string,_prompt:string,options:any)=>{
      expect(options.validate(failure)).toBe(false);
      expect(options.describeValidation(failure).join('；')).toContain('sourceChecks');
      return {data:failure};
    });
    await expect(c.reviewPremiseSelection(selection(),'','source_drift')).rejects.toThrow('协议错误');
  });
  it('instructs source review to separate an actual request from a later motive reveal', async () => {
    const c = Object.create(ChainController.prototype) as any;
    c.llmCallWithRetry = vi.fn().mockResolvedValue({ data: { sourceChecks: premiseSourceComparisonCatalog(selection())
      .map(row=>({ref:row.ref,status:'preserved',reason:'当前字段保留原池的行动对象和结果方向'})), categoryChecks:selection().selected.map((_,i)=>({ref:'S'+(i+1)+'.category',status:'fulfilled',evidenceRef:'S'+(i+1)+'.activeChoice',reason:'当前主线人物选择体现该分类的具体机制'})),payoffChecks:selection().selected.map((_,i)=>({ref:'S'+(i+1)+'.payoff',status:'supported',actionEvidenceRef:'S'+(i+1)+'.activeChoice',reason:'逐项核对既定行动和已有成立条件后确认结果'})) } });
    await c.reviewPremiseSelection(selection(), '', 'source_drift');
    const prompt = c.llmCallWithRetry.mock.calls[0][1] as string;
    expect(prompt).toContain('先核实展开是否仍保留请求发生');
    expect(prompt).toContain('不把后来变化倒推为前一事件未发生');
    expect(prompt).toContain('原文没有写明的角色关系不得由评审补成确定事实');
    expect(prompt).toContain('不要求所有展开句都已逐字写入骨架');
    expect(prompt).toContain('不能只因原池未提及候选细节而判未知');
    expect(prompt).not.toContain('不能确认则unknown');
  });

});

describe('source coverage before premise lock', () => {
  it('defines compatibility rather than exhaustive source entailment while preserving real uncertainty and dependency drift', async () => {
    const {IDEA_PRESELECTION_REVIEW_POLICY}=await import('../../shared/src/system-workflow-rules.registry');
    expect(IDEA_PRESELECTION_REVIEW_POLICY).toContain('不要求原池穷尽展开细节');
    expect(IDEA_PRESELECTION_REVIEW_POLICY).toContain('不能仅因原池未提及就判drift或unknown');
    expect(IDEA_PRESELECTION_REVIEW_POLICY).toContain('新增专业等级、权限、能力、关键证据或因果前提');
    expect(IDEA_PRESELECTION_REVIEW_POLICY).toContain('真实unknown仍阻断，不转成preserved');
  });
  const report = () => ({sourceChecks:premiseSourceComparisonCatalog(selection()).map(row=>({ref:row.ref,
    status:'preserved' as 'preserved'|'drift'|'unknown',reason:'当前字段保留原池的行动对象和结果方向'}))});
  it('cannot infer a reviewed premise from an empty issues list or another premise finding', () => {
    expect(premiseSourceReviewIssues({passed:true,issues:[]},selection()).join('；')).toContain('缺少逐字段');
    expect(premiseSourceReviewIssues(failure,selection()).length).toBeGreaterThan(0);
    const value=report();value.sourceChecks=value.sourceChecks.filter(row=>row.ref!=='S2.reversalEffect');
    expect(premiseSourceReviewIssues(value,selection())).toContain('S2.reversalEffect尚未核查');
    expect(()=>materializePremiseSourceReview(value,selection())).toThrow('覆盖未完成');
  });
  it('binds a drift to the actual candidate field and immutable original, then excludes it', () => {
    const value=report();value.sourceChecks.find(row=>row.ref==='S2.reversalEffect')!.status='drift';
    const review=materializePremiseSourceReview(value,selection());
    expect(review.passed).toBe(false);expect(review.issues).toMatchObject([{kind:'source_drift',premiseId:'B',field:'reversalEffect',
      quote:selection().selected[1].reversalEffect,referenceQuote:selection().pool[1].storyCore}]);
    expect(retainReviewedPremises(selection(),review).excludedPremiseIds).toEqual(['B']);
  });
  it('routes a field-specific drift into the existing original-pool repair before locking any cards', async () => {
    const original=selection(),c=Object.create(ChainController.prototype) as any;let sourceReviews=0;
    c.reviewPremiseSelection=vi.fn(async(current:any,_standard:string,mode:string)=>{
      if(mode==='overlap')return {passed:true,issues:[]};
      const value={sourceChecks:premiseSourceComparisonCatalog(current).map(row=>({ref:row.ref,
        status:(sourceReviews===0&&row.ref==='S2.reversalEffect'?'drift':'preserved'),reason:'原池的作用对象条件需要在反转字段保持一致'}))};
      sourceReviews++;return materializePremiseSourceReview(value,current);
    });
    c.llmCallWithRetry=vi.fn(async(_label:string,prompt:string,options:any)=>{
      expect(prompt).toContain('"field":"reversalEffect"');
      expect(prompt).toContain(String(original.pool[1].storyCore));
      expect(options.physicalCallBudget.remaining).toBe(3);options.physicalCallBudget.remaining--;
      return {data:{replacements:[{replacesPremiseId:'B',premise:{...premise('B'),reversalEffect:'修回原池明确允许的对象和结果条件'},comparisons:[compare('A')]}]}};
    });
    const result=await c.reconcilePremiseSelection(original,2,3,['悬疑'],'');
    expect(result.selected[0]).toEqual(original.selected[0]);
    expect(result.selected[1].reversalEffect).toBe('修回原池明确允许的对象和结果条件');
    expect(result.selectionAudit.initialReview.issues[0].field).toBe('reversalEffect');
    expect(result.selectionAudit.finalReview.sourceChecks).toHaveLength(22);
    expect(result.selectionAudit.finalReview.passed).toBe(true);
    expect(c.llmCallWithRetry).toHaveBeenCalledTimes(1);
  });
  it('keeps uncertainty separate from a proved drift and rejects duplicate or mixed reports', () => {
    const value=report();value.sourceChecks[0].status='unknown';
    expect(premiseSourceReviewIssues(value,selection())).toEqual([]);
    expect(()=>materializePremiseSourceReview(value,selection())).toThrow('仍未确认');
    const duplicate=report();duplicate.sourceChecks.push(duplicate.sourceChecks[0]);
    expect(premiseSourceReviewIssues(duplicate,selection()).join('；')).toContain('重复');
    expect(premiseSourceReviewIssues({...report(),passed:true,issues:[]},selection()).join('；')).toContain('并行');
  });
  it('accepts a completed comparison without turning the source contract into a story rewrite', () => {
    const original=selection(),before=JSON.stringify(original);
    const review=materializePremiseSourceReview(report(),original);
    expect(review.passed).toBe(true);expect(review.sourceChecks).toHaveLength(22);
    expect(JSON.stringify(original)).toBe(before);
  });
});


describe('targeted original-pool reselection', () => {
  const patch = (replacesPremiseId: string, id: string) => ({replacesPremiseId,premise:premise(id)});
  it('merges only problem slots without asking the model to repeat protected items', () => {
    const original=selection();
    const result=normalizeTargetedPremiseReselection({replacements:[patch('B','C')]},original,failure,2,3,['悬疑']);
    expect(result.selected[0]).toEqual(original.selected[0]);
    expect(result.selected.map(p=>p.premiseId)).toEqual(['A','C']);
    expect(result.pool).toEqual(original.pool);
    expect(original.selected.map(p=>p.premiseId)).toEqual(['A','B']);
    expect(premiseReselectionPlan(original,failure).availableCandidates.map(p=>p.premiseId)).toEqual(['C']);
  });
  it.each([
    [],[patch('A','C')],[patch('B','B')],[patch('B','A')],[patch('B','NEW')],
    [patch('B','C'),patch('B','C')],
  ])('rejects missing, protected, unchanged overlap, copied, invented and repeated slots: %j', replacements => {
    expect(()=>normalizeTargetedPremiseReselection({replacements},selection(),failure,2,3,['悬疑'])).toThrow();
  });
  it('permits source-only correction on the original identity', () => {
    const original=selection();
    const review:PremiseSelectionReview={passed:false,issues:[{...failure.issues[0],kind:'source_drift',premiseId:'B',referencePremiseId:'B'}]};
    const corrected={...premise('B'),activeChoice:'恢复原池允许的选择与结果'};
    const result=normalizeTargetedPremiseReselection({replacements:[{replacesPremiseId:'B',premise:corrected}]},original,review,2,3,['悬疑']);
    expect(result.selected[1].activeChoice).toBe(corrected.activeChoice);
    expect(result.selected[1].storyCore).toBe(original.pool[1].storyCore);
  });
  it('keeps original slot order and rejects two replacements using the same identity', () => {
    const original=selection();
    const review:PremiseSelectionReview={passed:false,issues:[...failure.issues,{...failure.issues[0],kind:'source_drift',premiseId:'A',referencePremiseId:'A'}]};
    const result=normalizeTargetedPremiseReselection({replacements:[patch('B','C'),patch('A','A')]},original,review,2,3,['悬疑']);
    expect(result.selected.map(p=>p.premiseId)).toEqual(['A','C']);
    expect(()=>normalizeTargetedPremiseReselection({replacements:[patch('B','C'),patch('A','C')]},original,review,2,3,['悬疑'])).toThrow();
  });
});

it('retains reviewed independent choices without a model call when replacement candidates are unavailable', async () => {
  const c=Object.create(ChainController.prototype) as any;
  c.reviewPremiseSelection=vi.fn().mockResolvedValue(failure);
  c.llmCallWithRetry=vi.fn();
  const original=selection(); original.pool=original.pool.slice(0,2);
  const result=await c.reconcilePremiseSelection(original,2,2,['悬疑'],'');
  expect(result.selected).toEqual([original.selected[0]]);
  expect(result.selectionAudit.partial).toBe(true);
  expect(c.llmCallWithRetry).not.toHaveBeenCalled();
});

it('does not salvage invalid review evidence or invent a passed global verdict',()=>{
 const original=selection();
 expect(()=>retainReviewedPremises(original,{...failure,issues:[{...failure.issues[0],quote:'不存在的原文引用至少八字'}]})).toThrow();
 expect(()=>retainReviewedPremises(original,{...failure,passed:true})).toThrow();
 const result=retainReviewedPremises(original,failure);expect(result.selection.selected).toEqual([original.selected[0]]);
 expect(original.selected).toHaveLength(2);expect(result.selection.pool).toBe(original.pool);
});
it('excludes source-drift identities even when no overlap remains',()=>{
 const original=selection();
 const review:PremiseSelectionReview={passed:false,issues:original.selected.map(item=>({kind:'source_drift',premiseId:String(item.premiseId),referencePremiseId:String(item.premiseId),quote:String(item.activeChoice),referenceQuote:String(item.storyCore),reason:'该题材的行动与原骨架存在真实互斥'}))};
 expect(retainReviewedPremises(original,review).selection.selected).toEqual([]);
});

it('reports the excluded final selection cause without replaying resolved initial defects',async()=>{
 const {premiseSelectionFailureReasons}=await import('./premise-selection-review');
 expect(premiseSelectionFailureReasons({initialReview:{passed:false,issues:[{reason:'已解决旧问题'}]},finalReview:{passed:false,issues:[{reason:'原题材核心动机被改写'}]},reasons:[{reason:'原题材核心动机被改写'}]})).toEqual(['原题材核心动机被改写']);
 expect(premiseSelectionFailureReasons({finalReview:{passed:true,issues:[]}})).toEqual([]);
 expect(premiseSelectionFailureReasons(undefined)).toEqual([]);
});

it('distinguishes an actual request from unstated motive while protecting objective source facts',async()=>{
 const {IDEA_PRESELECTION_REVIEW_POLICY}=await import('../../shared/src/system-workflow-rules.registry');
 expect(IDEA_PRESELECTION_REVIEW_POLICY).toContain('展开仍保留原请求实际发生时');
 expect(IDEA_PRESELECTION_REVIEW_POLICY).toContain('改写已确认生死身份或冲突结果');
 expect(IDEA_PRESELECTION_REVIEW_POLICY).toContain('不自动免除最终因果与世界规则审核');
 expect(IDEA_PRESELECTION_REVIEW_POLICY).toContain('不能在前后复核中按相反解释各判一次冲突');
});

it('stops single-slot reselection on transport/truncation failure without generating later slots',async()=>{
 const c=Object.create(ChainController.prototype) as any;
 c.reviewPremiseSelection=vi.fn().mockResolvedValue(failure);
 c.llmCallWithRetry=vi.fn(async(_label:string,prompt:string,options:any)=>{
  expect(prompt).toContain('replacements恰好1项');expect(options.physicalCallBudget.remaining).toBe(3);
  throw new Error('结构化截断，保留原始输出');
 });
 await expect(c.reconcilePremiseSelection(selection(),2,3,['悬疑'],'')).rejects.toThrow('结构化截断');
 expect(c.llmCallWithRetry).toHaveBeenCalledTimes(1);
});

describe('one bounded reserve before identity lock', () => {
  const fixture = () => {
    const initial = selection(); initial.pool.push(premise('D'));
    const current = normalizeTargetedPremiseReselection({replacements:[{replacesPremiseId:'B',premise:premise('C'),comparisons:[compare('A')]}]},
      initial,failure,2,4,['悬疑']);
    const review: PremiseSelectionReview = {...failure,issues:[{...failure.issues[0],premiseId:'A',referencePremiseId:'C'}]};
    return {initial,current,review};
  };
  it('targets the repaired duplicate rather than the protected original, excluding all tried identities', () => {
    const {initial,current,review}=fixture();
    const plan=premiseReserveReselectionPlan(initial,current,review,['A'])!;
    expect(plan.replacesPremiseId).toBe('C');
    expect(plan.availableCandidates.map(item=>item.premiseId)).toEqual(['D']);
    expect(premiseSelectionReviewIssues(plan.review,current)).toEqual([]);
  });
  it('integrates the reserve between the first terminal review and the final selection audit', async () => {
    const {initial,review}=fixture(); const c=Object.create(ChainController.prototype) as any;
    c.reviewPremiseSelection=vi.fn().mockResolvedValueOnce({passed:true,issues:[]}).mockResolvedValueOnce(failure)
      .mockResolvedValueOnce({passed:true,issues:[]}).mockResolvedValueOnce(review)
      .mockResolvedValue({passed:true,issues:[]});
    c.llmCallWithRetry=vi.fn(async(label:string,_prompt:string,options:any)=>{
      options.physicalCallBudget.remaining--;
      return {data:{replacements:[label.includes('备用')?{replacesPremiseId:'C',premise:premise('D'),comparisons:[compare('A')]}:{replacesPremiseId:'B',premise:premise('C'),comparisons:[compare('A')]}]}};
    });
    const result=await c.reconcilePremiseSelection(initial,2,4,['悬疑'],'');
    expect(result.selected.map((item:any)=>item.premiseId)).toEqual(['A','D']);
    expect(result.selectionAudit.finalReview.passed).toBe(true);
    expect(result.selectionAudit.reserve).toMatchObject({attempted:true,replacesPremiseId:'C',replacementPremiseId:'D',sharedCallsRemaining:1});
    expect(c.llmCallWithRetry).toHaveBeenCalledTimes(2); expect(c.reviewPremiseSelection).toHaveBeenCalledTimes(6);
  });
  it('uses one remaining repair call and two one-call independent gates without altering protected items', async () => {
    const {initial,current,review}=fixture(); const c=Object.create(ChainController.prototype) as any;
    const repairBudget={remaining:2};
    c.llmCallWithRetry=vi.fn(async(_label:string,_prompt:string,options:any)=>{
      expect(options.physicalCallBudget.remaining).toBe(2);
      expect(options.validate({replacements:[{replacesPremiseId:'C',premise:premise('B')}]})).toBe(false);
      options.physicalCallBudget.remaining--;
      return {data:{replacements:[{replacesPremiseId:'C',premise:premise('D'),comparisons:[compare('A')]}]}};
    });
    c.reviewPremiseSelection=vi.fn(async(_selection:any,_standard:string,_mode:string,budget:any)=>{
      expect(budget.remaining).toBe(1); budget.remaining--; return {passed:true,issues:[]};
    });
    const result=await c.reservePremiseSelection(initial,current,review,2,4,['悬疑'],'',repairBudget,['A'],[],{remaining:2});
    expect(result.selection.selected.map((item:any)=>item.premiseId)).toEqual(['A','D']);
    expect(result.selection.selected[0]).toEqual(initial.selected[0]);
    expect(result.review.passed).toBe(true); expect(repairBudget.remaining).toBe(1);
    expect(result.physicalCallBudgetUsed).toBe(3);
    expect(c.llmCallWithRetry).toHaveBeenCalledTimes(1); expect(c.reviewPremiseSelection).toHaveBeenCalledTimes(2);
    expect(current.selected.map(item=>item.premiseId)).toEqual(['A','C']);
  });
  it('keeps the prior reviewed failure when either reserve audit is unavailable', async () => {
    const {initial,current,review}=fixture(); const c=Object.create(ChainController.prototype) as any;
    c.llmCallWithRetry=vi.fn().mockResolvedValue({data:{replacements:[{replacesPremiseId:'C',premise:premise('D'),comparisons:[compare('A')]}]}});
    c.reviewPremiseSelection=vi.fn().mockRejectedValueOnce(new Error('审查截断')).mockResolvedValueOnce({passed:true,issues:[]});
    const result=await c.reservePremiseSelection(initial,current,review,2,4,['悬疑'],'',{remaining:1},['A']);
    expect(result.selection).toBe(current); expect(result.review).toBe(review);
    expect(result.error).toContain('未完成'); expect(result.attempted).toBe(true);
    expect(c.llmCallWithRetry).toHaveBeenCalledTimes(1);
  });
  it('retains an evidenced reserve rejection without a second reserve attempt', async () => {
    const {initial,current,review}=fixture(); const c=Object.create(ChainController.prototype) as any;
    const rejected:PremiseSelectionReview={passed:false,issues:[{kind:'source_drift',premiseId:'D',referencePremiseId:'D',
      quote:premise('D').activeChoice,referenceQuote:premise('D').storyCore,reason:'备用项仍改变了原池明确的行动方向'}]};
    c.llmCallWithRetry=vi.fn().mockResolvedValue({data:{replacements:[{replacesPremiseId:'C',premise:premise('D'),comparisons:[compare('A')]}]}});
    c.reviewPremiseSelection=vi.fn().mockResolvedValueOnce(rejected).mockResolvedValueOnce({passed:true,issues:[]});
    const result=await c.reservePremiseSelection(initial,current,review,2,4,['悬疑'],'',{remaining:2},['A']);
    expect(result.review).toMatchObject(rejected); expect(result.review.scope).toEqual({sourcePremiseIds:['D'],overlapFocusId:'D'}); expect(c.llmCallWithRetry).toHaveBeenCalledTimes(1);
    expect(retainReviewedPremises(result.selection,result.review,['A']).selection.selected.map(item=>item.premiseId)).toEqual(['A']);
  });
  it('makes no reserve request without remaining repair budget, unused candidates, or a single failed position', async () => {
    const {initial,current,review}=fixture(); const c=Object.create(ChainController.prototype) as any;
    c.llmCallWithRetry=vi.fn();
    expect((await c.reservePremiseSelection(initial,current,review,2,4,['悬疑'],'',{remaining:0},['A'])).attempted).toBe(false);
    expect(premiseReserveReselectionPlan(initial,{...current,pool:current.pool.slice(0,3)},review,['A'])).toBeNull();
    const multiple:PremiseSelectionReview={passed:false,issues:current.selected.map(item=>({kind:'source_drift',premiseId:String(item.premiseId),referencePremiseId:String(item.premiseId),quote:String(item.activeChoice),referenceQuote:String(item.storyCore),reason:'存在明确的原池行动事实改写'}))};
    expect(premiseReserveReselectionPlan(initial,current,multiple,['A'])).toBeNull();
    expect(c.llmCallWithRetry).not.toHaveBeenCalled();
  });
});

it('requires focused overlap evidence and rejects an unrelated old-pair refusal as protocol failure',async()=>{
 const {premiseOverlapScopeIssues}=await import('./premise-selection-review');const selected=selection();
 expect(premiseOverlapScopeIssues({passed:false,issues:[{premiseId:'A',referencePremiseId:'B'}]},selected,'B')).toEqual([]);
 expect(premiseOverlapScopeIssues({passed:false,issues:[{premiseId:'A',referencePremiseId:'B'}]},selected,['A','B'])).toEqual([]);
 expect(premiseOverlapScopeIssues({passed:false,issues:[{premiseId:'A',referencePremiseId:'A'}]},selected,'B')[0]).toContain('旧配对');
 expect(premiseOverlapScopeIssues({passed:false,issues:[{premiseId:'A',referencePremiseId:'A'}]},selected,['A','B'])).toEqual([]);
 expect(premiseOverlapScopeIssues({passed:false,issues:[]},selected,['B','C'])[0]).toContain('变化项不在当前选择中');
});

it.each([3,2])('partitions only for output capacity and preserves completed work with %i shared credits',async(initialCredits)=>{
 const original=normalizePremiseSelectionPayload({pool:['A','B','C','D','E'].map(premise),selectedPremises:['A','B','C','D'].map(premise)},4,5);
 const rejected:PremiseSelectionReview={passed:false,issues:['A','B','C'].map(premiseId=>({kind:'source_drift',premiseId,referencePremiseId:premiseId,quote:premise(premiseId).activeChoice,referenceQuote:premise(premiseId).storyCore,reason:'当前展开确实改变原池行动方向'}))};
 const c=Object.create(ChainController.prototype) as any,credits={remaining:initialCredits},scopes:number[]=[];
 c.logger={warn:vi.fn(),log:vi.fn()};c.reviewPremiseSelection=vi.fn().mockResolvedValueOnce(rejected).mockResolvedValueOnce({passed:true,issues:[]}).mockResolvedValue({passed:true,issues:[]});
 c.llmCallWithRetry=vi.fn(async(_label:string,prompt:string,options:any)=>{
  const section=(label:string,next:string)=>prompt.split(label)[1].split(next)[0].trim();
  const slots=JSON.parse(section('【必须处理的位置及模式】','【可用原池ID】')),current=JSON.parse(section('【当前选择】','【本次独立缺陷】'));
  scopes.push(slots.length);options.physicalCallBudget.remaining--;
  if(scopes.length===1)throw Error('结构化生成因输出长度被截断');
  const data={replacements:slots.map((slot:any)=>({replacesPremiseId:slot.replacesPremiseId,premise:premise(slot.replacesPremiseId),comparisons:current.filter((item:any)=>item.premiseId!==slot.replacesPremiseId).map((item:any)=>compare(item.premiseId))}))};
  expect(options.validate(data)).toBe(true);return {data};
 });
 const result=await c.reconcilePremiseSelection(original,4,5,['悬疑'],'',[],{reviews:{remaining:8},reselection:credits});
 expect(scopes[0]).toBe(3);expect(credits.remaining).toBe(0);
 if(initialCredits===3){expect(scopes.slice(1).reduce((sum,n)=>sum+n,0)).toBe(3);expect(scopes).toHaveLength(3);expect(result.selected.map((item:any)=>item.premiseId)).toEqual(['A','B','C','D']);}
 else {expect(scopes).toHaveLength(2);expect(result.selected.map((item:any)=>item.premiseId)).toEqual(['A','D']);expect(result.selectionAudit).toMatchObject({partial:true,unresolvedPremiseIds:['B','C'],sourceRepairCallsRemaining:0});}
 expect(result.selectionAudit.finalReview.passed).toBe(true);
});
it('does not reinterpret a network failure as output capacity or start fallback generations',async()=>{
 const c=Object.create(ChainController.prototype) as any;c.reviewPremiseSelection=vi.fn().mockResolvedValueOnce({passed:true,issues:[]}).mockResolvedValueOnce(failure);
 c.llmCallWithRetry=vi.fn().mockRejectedValue(Error('network failed'));
 await expect(c.reconcilePremiseSelection(selection(),2,3,['悬疑'],'')).rejects.toThrow('network failed');expect(c.llmCallWithRetry).toHaveBeenCalledTimes(1);
});
it('tries an original-pool replacement when the initial selection is short and one selected premise fails review', async () => {
 const initial=normalizePremiseSelectionPayload({pool:['A','B','C','D','E','F','G'].map(premise),selectedPremises:['A','B','C'].map(premise)},5,7,undefined,3);
 const c=Object.create(ChainController.prototype) as any;
 const failed:PremiseSelectionReview={passed:false,issues:[{kind:'source_drift',premiseId:'B',referencePremiseId:'B',
   quote:premise('B').activeChoice,referenceQuote:premise('B').storyCore,reason:'决定性物证缺少实际取得和交付条件'}]};
 let sourceRound=0;
 c.reviewPremiseSelection=vi.fn(async(_input:any,_standard:string,mode:string)=>{
   if(mode==='overlap')return {passed:true,issues:[]};
   return sourceRound++===0?failed:{passed:true,issues:[]};
 });
 c.llmCallWithRetry=vi.fn(async(_label:string,_prompt:string,options:any)=>{
   const data={replacements:[{replacesPremiseId:'B',premise:premise('D'),comparisons:[compare('A'),compare('C')]}]};
   expect(options.validate(data)).toBe(true);
   return {data};
 });
 const result=await c.reconcilePremiseSelection(initial,5,7,['悬疑'],'');
 expect(result.selected.map((item:any)=>item.premiseId)).toEqual(['A','D','C']);
 expect(result.selectionAudit.finalReview.passed).toBe(true);
 expect(result.selectionAudit.reselectionAttempted).toBe(true);
 expect(c.llmCallWithRetry).toHaveBeenCalledTimes(1);
});

it('aggregates all failed reserve positions and keeps the remaining failure after another slot passes',async()=>{
 const initial=normalizePremiseSelectionPayload({pool:['A','B','C','D','E','F','G'].map(premise),selectedPremises:['A','B','C'].map(premise)},3,7);
 const c=Object.create(ChainController.prototype) as any;
 const issues=(ids:string[])=>({passed:!ids.length,issues:ids.map(id=>({kind:'source_drift',premiseId:id,referencePremiseId:id,quote:premise(id).activeChoice,referenceQuote:premise(id).storyCore,reason:'决定性物证缺少实际取得和交付条件'}))});
 let sourceRound=0;
 c.reviewPremiseSelection=vi.fn(async(_input:any,_standard:string,mode:string)=>{
  if(mode==='overlap')return {passed:true,issues:[]};
  return [issues(['B','C']),issues(['D','E']),issues(['G'])][sourceRound++];
 });
 let generation=0;
 c.llmCallWithRetry=vi.fn(async(label:string,prompt:string,options:any)=>{
  options.physicalCallBudget.remaining--;
  const changes=generation++===0?[['B','D'],['C','E']]:[['D','F'],['E','G']];
  if(generation===2){expect(label).toContain('备用');expect(prompt).toContain('"replacesPremiseId":"D"');expect(prompt).toContain('"replacesPremiseId":"E"');}
  const finalIds=['A',...changes.map(([,to])=>to)];
  return {data:{replacements:changes.map(([from,to])=>({replacesPremiseId:from,premise:premise(to),comparisons:finalIds.filter(id=>id!==to).map(compare)}))}};
 });
 const credits={remaining:3};
 const result=await c.reconcilePremiseSelection(initial,3,7,['悬疑'],'',[],{reviews:{remaining:12},reselection:credits});
 expect(result.selected.map((x:any)=>x.premiseId)).toEqual(['A','F']);
 expect(result.selectionAudit.finalReview.issues.map((x:any)=>x.premiseId)).toEqual(['G']);
 expect(result.selectionAudit.excludedPremiseIds).toContain('G');
 expect(result.selectionAudit.reserve.replacements).toEqual([{replacesPremiseId:'D',replacementPremiseId:'F'},{replacesPremiseId:'E',replacementPremiseId:'G'}]);
 expect(c.llmCallWithRetry).toHaveBeenCalledTimes(2);
 expect(c.reviewPremiseSelection).toHaveBeenCalledTimes(6);
 expect(credits.remaining).toBe(1);
});
