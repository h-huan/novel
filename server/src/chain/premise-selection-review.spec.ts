import { describe, expect, it, vi } from 'vitest';
import { ChainController } from './chain.controller';
import { retainReviewedPremises, normalizePremiseReselection, normalizeTargetedPremiseReselection, premiseReselectionPlan, premiseSelectionReviewIssues, type PremiseSelectionReview } from './premise-selection-review';
import { ideaCardStructuringDirective, normalizePremiseSelectionPayload } from './idea-discovery-contract';

const premise = (id: string) => ({ premiseId: id, workingTitle: '题材' + id, storyCore: '具有人物选择与兑现的原池骨架' + id,
  storyCategory: '悬疑', protagonistSituation: '为家人争取生存机会', openingEvent: '具体异常迫使人物亲自行动',
  coreConflict: '具体利益与主动对手对撞', activeChoice: '救人需要承担被遗忘的代价' + id,
  escalation: '每次救人自己的存在逐渐消失', reversalEffect: '旧签字构成超自然代价源头', payoff: '承担存在代价使家属获得赔偿',
  irreplaceableCarrier: '职业权限与利益冲突直接绑定', secondOrderConsequence: '救人也让家庭关系不可逆改变',
  readerQuestion: '人物如何承担不可逆选择后果', differentiation: '差异须实际落在选择与兑现中' });
const selection = () => normalizePremiseSelectionPayload({ pool: ['A', 'B', 'C'].map(premise), selectedPremises: ['A', 'B'].map(premise) }, 2, 3);
const failure: PremiseSelectionReview = { passed: false, issues: [{ kind: 'overlap', premiseId: 'B', referencePremiseId: 'A',
  quote: '每次救人自己的存在逐渐消失', referenceQuote: '每次救人自己的存在逐渐消失', reason: '选择与代价及旧签字反转机制同构' }] };

describe('premise selection before identity lock', () => {
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
      expect(prompt).toContain('服务器保护的正常项');
      expect(prompt).toContain('修订须复查全部筛选字段的同一因果事实');
      expect(prompt).toContain('replacements恰好1项');
      return { data: { replacements: [{ replacesPremiseId: 'B', premise: premise('C') }] } };
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
    c.llmCallWithRetry = vi.fn().mockResolvedValue({ data: { replacements: [{ replacesPremiseId: 'B', premise: premise('C') }] } });
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
      expect(prompt).toContain('replacements恰好1项');
      return {data:{replacements:prompt.includes('\"replacesPremiseId\":\"A\",\"mode\"') ? [{replacesPremiseId:'A',premise:fixed}] : [{replacesPremiseId:'B',premise:premise('C')}]}};
    });
    const result=await c.reconcilePremiseSelection(original,2,3,['悬疑'],'');
    expect(result.selected[0].activeChoice).toBe(fixed.activeChoice);
    expect(result.selectionAudit.initialReview.issues).toHaveLength(2);
    expect(c.llmCallWithRetry).toHaveBeenCalledTimes(2);
    expect(c.reviewPremiseSelection).toHaveBeenCalledTimes(4);
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
      expect(options.describeValidation(failure).join('；')).toContain('source_drift');
      return {data:failure};
    });
    await expect(c.reviewPremiseSelection(selection(),'','source_drift')).rejects.toThrow('协议错误');
  });
  it('instructs source review to separate an actual request from a later motive reveal', async () => {
    const c = Object.create(ChainController.prototype) as any;
    c.llmCallWithRetry = vi.fn().mockResolvedValue({ data: { passed: true, issues: [] } });
    await c.reviewPremiseSelection(selection(), '', 'source_drift');
    const prompt = c.llmCallWithRetry.mock.calls[0][1] as string;
    expect(prompt).toContain('先核实展开是否仍保留请求发生');
    expect(prompt).toContain('不把后来变化倒推为前一事件未发生');
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
