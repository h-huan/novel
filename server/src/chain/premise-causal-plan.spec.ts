import { describe, expect, it, vi } from 'vitest';
import { assertPremiseCausalPlans, bindPremiseCausalPlan, premiseCausalPlanIssues, applyPremiseCausalPlanRepairs, premiseCausalPlanExample, premiseCausalReferenceExample, PREMISE_CAUSAL_SEQUENCE_DIRECTIVE } from './premise-causal-plan';
import { applyOrderedIdeaRepairPatches, bindStructuredIdeaCardToPremise, ideaCardStructuringDirective, ideaPremiseSelectionDirective, normalizePremiseSelectionPayload, selectedPremiseEvidenceForIdeaCard } from './idea-discovery-contract';
import { materializePremisePayoffReview, premisePayoffReviewIssues } from './premise-payoff-review';
import { independentOutcomeStubReceipts } from './premise-payoff-review.fixture';
import { materializePremiseSourceReview, normalizePremiseReselection, premiseSourceComparisonCatalog } from './premise-selection-review';
import { mergePremiseSourceBatches } from './premise-source-batches';
import { reviewChangedPremiseSources } from './premise-source-reuse';
import { quarantineIncompletePremiseReviews } from './premise-review-quarantine';
import { ChainController } from './chain.controller';
import { IDEA_PRESELECTION_REVIEW_POLICY, STORY_PREREQUISITE_POLICY } from '../../shared/src/system-workflow-rules.registry';

function premise(id = 'A') {
  return { premiseId: id, workingTitle: '保住原有承诺' + id, storyCore: '主角按已有条件求援，救出被困者并承担真实代价。',
    protagonistSituation: '她只想保住工作并保护被困的人。', openingEvent: '对手把被困者锁进了仓库。',
    coreConflict: '私自求援会让她失去原有工作。', activeChoice: '她通过电话向值班人员报告地点。',
    escalation: '值班人员收到地点后派出救援队。', reversalEffect: '救援队按定位到仓库核实险情。',
    payoff: '救援队打开仓库救出被困者，她失去工作。', irreplaceableCarrier: '她的岗位能发现仓库的位置与异常。',
    secondOrderConsequence: '被困者获救使她承担失业压力。', readerQuestion: '她能否及时救人并保住自己的工作？',
    causalPlan: [
      { action: {field:'activeChoice',quote:'她通过电话向值班人员报告地点。'}, conditions: [], result: {field:'escalation',quote:'值班人员收到地点后派出救援队。'} },
      { action: {field:'reversalEffect',quote:'救援队按定位到仓库核实险情。'}, conditions: [{field:'escalation',quote:'值班人员收到地点后派出救援队。'}], result: {field:'payoff',quote:'救援队打开仓库救出被困者'} },
    ],
  };
}
const selection = (ids = ['A']) => ({pool:ids.map(premise),selected:ids.map(premise),poolTargetMet:true});
function payoffChecks(s: ReturnType<typeof selection>) {
  return s.selected.map((item,index) => ({ref:`S${index+1}.payoff`,status:'supported' as const,
    unmappedChecks:independentOutcomeStubReceipts(s,index),
    actionEvidenceRef:`S${index+1}.activeChoice`,reversalCheck:{status:'supported' as const,actionEvidenceRef:`S${index+1}.activeChoice`,reason:'主角通报地点和值班派遣引发救援队核对现场'},conditionEvidenceRef:`S${index+1}.escalation`,reason:'实际到场由报告地点及值班派遣触发，不由结局倒推。',
    links:item.causalPlan.map((_,n)=>({ref:`S${index+1}.causalPlan[${n}]`,status:'supported' as 'supported'|'gap'|'unknown',decisionCheck:{status:'not_required',reason:'救援队已接获报告并按既定职责到场，未要求额外机构改判'},reason:'已建立接收者、实际派遣与定位，到场条件成立。'}))}));
}
function report(s:ReturnType<typeof selection>) {
  const sourceChecks=premiseSourceComparisonCatalog(s).map(row=>({ref:row.ref,status:'preserved' as const,reason:'当前展开保留原池实际行动、对象与兑现承诺。'}));
  return {...materializePremiseSourceReview({sourceChecks},s),payoffChecks:payoffChecks(s)};
}

it('rebinds whitespace-only citation differences without inventing missing causality or altering facts',()=>{
 const original=premise();
 original.activeChoice='我把实名登记资料交给\n值班人员，取得受理回执。';
 original.causalPlan[0].action={field:'activeChoice',quote:'我把实名登记资料交给 值班人员，取得受理回执。'};
 const correct=bindPremiseCausalPlan(original) as typeof original;
 expect(correct.causalPlan[0].action.quote).toBe('我把实名登记资料交给\n值班人员，取得受理回执。');
 expect(premiseCausalPlanIssues(correct)).toEqual([]);
 const separated=structuredClone(original);
 separated.activeChoice='他还欠下一段等长的“空 账”。';
 separated.causalPlan[0].action.quote='他还欠下一段等长的“空账”。';
 expect(premiseCausalPlanIssues(bindPremiseCausalPlan(separated))).not.toEqual([]);
 const invalid=structuredClone(original);
 invalid.causalPlan[0].action.quote='我把匿名登记资料交给 值班人员，取得受理回执。';
 expect(premiseCausalPlanIssues(bindPremiseCausalPlan(invalid))).not.toEqual([]);
 const repeated=structuredClone(original);
 repeated.activeChoice=original.activeChoice+'又一次：'+original.activeChoice;
 expect(premiseCausalPlanIssues(bindPremiseCausalPlan(repeated))).not.toEqual([]);
});
it('keeps numbered evidence examples purely structural, never a copyable fake source address',()=>{
 const shape=premiseCausalReferenceExample();
 expect(shape).toHaveLength(1);
 for(const anchor of [shape[0].action,...shape[0].conditions,shape[0].result]){
   expect(anchor.sourceRef).toContain('从本题材真实原池编号表复制');
   expect(anchor.sourceRef).not.toMatch(/^P\\d+:[1-5]:\\d+/);
 }
});
describe('plan critical prerequisites before full story cards',()=>{
  it('models intermediate result before payoff and teaches generation to keep later prerequisites separate',()=>{
    const steps=premiseCausalPlanExample();
    expect(steps).toHaveLength(2);
    expect(steps[0].result.field).toBe('escalation');
    // A later payoff must be attributed to an executed verification/decision,
    // not to a reversal paragraph that may only claim the outcome.
    expect(steps[1].action.field).toBe('escalation');
    expect(steps[1].conditions[0].field).toBe('escalation');
    expect(steps[1].result.field).toBe('payoff');
    expect(steps[1].result.quote).not.toContain('与代价');
    expect(PREMISE_CAUSAL_SEQUENCE_DIRECTIVE).toContain('不把不同原因的胜利和代价强绑到最后一环');
    expect(PREMISE_CAUSAL_SEQUENCE_DIRECTIVE).toContain('中间动作不得直接标终局payoff');
    expect(ideaPremiseSelectionDirective('short_story',5)).toContain(PREMISE_CAUSAL_SEQUENCE_DIRECTIVE);
  });
  it('repairs only an incomplete index with existing same-story evidence, preserving all facts and valid peers',()=>{
    const input=selection(['A','B']),complete=structuredClone(input.selected[0].causalPlan);
    input.selected[0].causalPlan.pop();
    const before=structuredClone(input),value={plans:[{premiseId:'A',causalPlan:complete}]};
    const repaired=applyPremiseCausalPlanRepairs(input,value);
    expect(premiseCausalPlanIssues(repaired.selected[0])).toEqual([]);
    expect(repaired.selected[1]).toBe(input.selected[1]);
    const {causalPlan:oldPlan,...oldStory}=before.selected[0],{causalPlan:newPlan,...newStory}=repaired.selected[0];
    expect(newStory).toEqual(oldStory);expect(input).toEqual(before);
    for(const invalid of [
      {plans:[{...value.plans[0],payoff:'伪造新的结局条件'}]},
      {plans:[{premiseId:'B',causalPlan:complete}]},
      {plans:[{premiseId:'A',causalPlan:[{...complete[1],result:{field:'payoff',quote:'原文没有的追责结果'}}]}]},
      {plans:[]},
    ])expect(()=>applyPremiseCausalPlanRepairs(input,invalid)).toThrow();
  });
  it('quarantines one stale quotation instead of aborting seven unchanged valid candidates',()=>{
    const input=selection(['A','B','C','D','E','F','G','H']);
    input.selected[0].causalPlan[1].result.quote='救援队打开仓库救出了被困者';
    const badIndex=structuredClone(input.selected[0].causalPlan);
    const repaired=applyPremiseCausalPlanRepairs(input,
      {plans:[{premiseId:'A',causalPlan:badIndex}]},5);
    expect(repaired.selected.map(item=>item.premiseId)).toEqual(['B','C','D','E','F','G','H']);
    expect(repaired.selected.every(item=>premiseCausalPlanIssues(item).length===0)).toBe(true);
    expect(repaired.pool).toBe(input.pool);
    // The real downstream normalizer still checks pool identity and original
    // dynamic delivery minimum before any independent quality review.
    const normalized=normalizePremiseSelectionPayload({pool:input.pool,selectedPremises:repaired.selected},8,15,undefined,5);
    expect(normalized.selected).toHaveLength(7);
    expect(input.selected).toHaveLength(8);
    expect(()=>applyPremiseCausalPlanRepairs(input,{plans:[{premiseId:'A',causalPlan:badIndex}]})).toThrow('有效候选不足');
    const narrow=selection(['A','B','C']);
    narrow.selected[0].causalPlan[1].result.quote='救援队打开仓库救出了被困者';
    const response={plans:[{premiseId:'A',causalPlan:narrow.selected[0].causalPlan}]};
    expect(()=>applyPremiseCausalPlanRepairs(narrow,response,3)).toThrow('有效候选不足');
    expect(applyPremiseCausalPlanRepairs(narrow,response,2).selected.map(item=>item.premiseId)).toEqual(['B','C']);
    expect(()=>applyPremiseCausalPlanRepairs(input,
      {plans:[{premiseId:'A',causalPlan:badIndex,storyCore:'伪造来源'}]},5)).toThrow('只能逐项');
  });
  it('the live selection controller retains seven valid candidates with the existing single correction call',async()=>{
    const input=selection(['A','B','C','D','E','F','G','H']);
    input.selected[0].causalPlan[1].result.quote='救援队打开仓库救出了被困者';
    const controller=Object.create(ChainController.prototype) as any;
    const budget={remaining:2};
    controller.realLLM={generate:vi.fn(async(request:any)=>{
      expect(request.physicalCallBudget).toBe(budget);
      budget.remaining-=1;
      return {content:JSON.stringify({plans:[{premiseId:'A',causalPlan:input.selected[0].causalPlan}]})};
    })};
    const result=await controller.completePremiseCausalPlans(input,budget,5);
    expect(result.selected.map((item:any)=>item.premiseId)).toEqual(['B','C','D','E','F','G','H']);
    expect(controller.realLLM.generate).toHaveBeenCalledOnce();
    expect(budget.remaining).toBe(1);
  });
  it('spends one existing reselection credit only for invalid plans and keeps the semantic gate independent',async()=>{
    const input=selection(),complete=structuredClone(input.selected[0].causalPlan);input.selected[0].causalPlan.pop();
    const c=Object.create(ChainController.prototype) as any,budget={remaining:3};
    c.realLLM={generate:vi.fn(async(options:any)=>{expect(options.physicalCallBudget).toBe(budget);budget.remaining--;
      return {content:JSON.stringify({plans:[{premiseId:'A',causalPlan:complete}]})};})};
    const repaired=await c.completePremiseCausalPlans(input,budget);
    expect(budget.remaining).toBe(2);expect(c.realLLM.generate).toHaveBeenCalledOnce();
    expect(await c.completePremiseCausalPlans(repaired,budget)).toBe(repaired);
    expect(c.realLLM.generate).toHaveBeenCalledOnce();
    const rows=payoffChecks(repaired);rows[0].status='gap' as any;(rows[0] as any).gapRepair='replace_from_pool';rows[0].links[0].status='gap';
    expect(materializePremisePayoffReview({payoffChecks:rows},repaired)[0].kind).toBe('selection_fit');
  });
  it('recovers only the exact terminal semicolon in the observed selected P1 source anchors',()=>{
    const p:any={
      premiseId:'P1',
      activeChoice:'我借地磅单和送货司机的抽检单，匿名打质量热线请质检站到站抽检。',
      escalation:'质检员按炉批号追溯，报告显示屈服强度不达标，工地停工追责；老板的弟弟开始查是谁把钢筋混进废钢。',
      reversalEffect:'老板早知道调包，还想把我推出去顶罪；我提前把十年分拣记录藏在秤台下，交给质检站和工地监理。',
      payoff:'废品站关停，我没了藏身处，却被质检站聘为协管员，第一次用真名签字。',
      causalPlan:[
        {action:{field:'activeChoice',quote:'我借地磅单和送货司机的抽检单，匿名打质量热线请质检站到站抽检。'},
          conditions:[],result:{field:'escalation',quote:'质检员按炉批号追溯，报告显示屈服强度不达标，工地停工追责。'}},
        {action:{field:'reversalEffect',quote:'我提前把十年分拣记录藏在秤台下，交给质检站和工地监理。'},
          conditions:[{field:'reversalEffect',quote:'老板早知道调包，还想把我推出去顶罪。'}],
          result:{field:'payoff',quote:'废品站关停，我没了藏身处，却被质检站聘为协管员，第一次用真名签字。'}},
      ],
    };
    const original=structuredClone(p);
    expect(premiseCausalPlanIssues(p)).toEqual(expect.arrayContaining([
      expect.stringContaining('causalPlan[0]'),expect.stringContaining('causalPlan[1]')]));
    const bound=bindPremiseCausalPlan(p) as any;
    expect(bound.causalPlan[0].result.quote).toBe('质检员按炉批号追溯，报告显示屈服强度不达标，工地停工追责；');
    expect(bound.causalPlan[1].conditions[0].quote).toBe('老板早知道调包，还想把我推出去顶罪；');
    expect(premiseCausalPlanIssues(bound)).toEqual([]);
    expect(p).toEqual(original);
    const changed=structuredClone(p);
    changed.causalPlan[0].result.quote='质检员未按炉批号追溯，报告显示屈服强度不达标，工地停工追责。';
    expect(premiseCausalPlanIssues(bindPremiseCausalPlan(changed))).not.toEqual([]);
    const ambiguous=structuredClone(p);
    ambiguous.escalation='质检员按炉批号追溯，报告显示屈服强度不达标，工地停工追责；'+p.escalation;
    expect(premiseCausalPlanIssues(bindPremiseCausalPlan(ambiguous))).not.toEqual([]);
  });
  it('requires exact copied field punctuation in the authoring rule without weakening causal quality checks',()=>{
    const directive=ideaPremiseSelectionDirective('short_story',5);
    expect(directive).toContain('原文以“；”连接分句时不得擅自改成“。”');
    expect(directive).toContain('修改字段后须同步复制实际引用');
    expect(directive).toContain('conditions可为空的只有普通直接因果');
  });
  it('requires a real plan at the live boundary and never fabricates it from old prose',()=>{
    const s=selection();delete (s.selected[0] as any).causalPlan;
    expect(()=>assertPremiseCausalPlans(s)).toThrow('生成前因果计划未完成');
    expect(s.selected[0]).not.toHaveProperty('causalPlan');
  });
  it.each(['unknown','payoff','readerQuestion','differentiation'])('does not accept %s as the missing condition evidence',field=>{
    const p=premise();p.causalPlan[1].conditions=[{field,quote:'救援队打开仓库救出被困者'}];
    expect(premiseCausalPlanIssues(p).length).toBeGreaterThan(0);
  });
  it('rejects stale or invented anchors and result-as-condition circularity before spending on cards',()=>{
    const p=premise();p.causalPlan[1].conditions[0].quote='程序没有建立的自动出警权限';
    expect(premiseCausalPlanIssues(p).length).toBeGreaterThan(0);
    const q=premise();q.escalation+='救援队打开仓库救出被困者';q.causalPlan[1].conditions[0].quote='救援队打开仓库救出被困者';
    expect(premiseCausalPlanIssues(q)).toContain('causalPlan[1]不能用同一结果断言自证行动或条件');
  });
  it('permits ordinary direct causes without demanding artificial procedures',()=>{
    const s=selection(),p=s.selected[0];p.activeChoice='她推开未锁的门进入仓库。';p.payoff='她进入仓库看见被困者。';
    p.causalPlan=[{action:{field:'activeChoice',quote:p.activeChoice},conditions:[],result:{field:'payoff',quote:p.payoff}}];
    expect(premiseCausalPlanIssues(p)).toEqual([]);
    expect(premisePayoffReviewIssues({payoffChecks:payoffChecks(s)},s)).toEqual([]);
  });
  it('uses the actual number of critical transitions instead of a fixed quota',()=>{
    const s=selection(),p=s.selected[0];p.escalation=Array.from({length:11},(_,i)=>`阶段${i}发生具体状态改变。`).join('');
    p.causalPlan=[...Array.from({length:11},(_,i)=>({action:{field:'activeChoice',quote:p.activeChoice},conditions:[],result:{field:'escalation',quote:`阶段${i}发生具体状态改变。`}})),
      {action:{field:'reversalEffect',quote:p.reversalEffect},conditions:[],result:{field:'payoff',quote:p.payoff}}];
    expect(premiseCausalPlanIssues(p)).toEqual([]);
    expect(premisePayoffReviewIssues({payoffChecks:payoffChecks(s)},s)).toEqual([]);
    const rows=payoffChecks(s);rows[0].links.pop();
    expect(premisePayoffReviewIssues({payoffChecks:rows},s)).toContain('S1.payoff的links须覆盖全部关键因果环节');
  });
  it('requires main-line closure rather than accepting a plan of only opening actions',()=>{
    const p=premise();p.causalPlan.pop();
    expect(premiseCausalPlanIssues(p)).toContain('causalPlan须覆盖主线兑现，不能只列开端或普通动作');
  });
  it('requires semantic gaps to choose source-backed correction or genuine source replacement',()=>{
    const data=selection(),row=payoffChecks(data)[0];
    row.status='gap' as any;row.links[0].status='gap';
    expect(premisePayoffReviewIssues({payoffChecks:[row]},data)).toContain(
      'S1.payoff缺少可执行的真实缺口路由gapRepair；不得默认把仅有索引问题的成熟题材强制换选');
    (row as any).gapRepair='restore_source_conditions';
    (row as any).sourceConditionQuote='主角按已有条件求援，救出被困者并承担真实代价。';
    expect(premisePayoffReviewIssues({payoffChecks:[row]},data)).toEqual([]);
    const issue=materializePremisePayoffReview({payoffChecks:[row]},data)[0];
    expect(issue.repairMode).toBeUndefined();
    (row as any).gapRepair='replace_from_pool';delete (row as any).sourceConditionQuote;
    expect(materializePremisePayoffReview({payoffChecks:[row]},data)[0].repairMode).toBe('replace_from_pool');
    (row as any).gapRepair='restore_source_conditions';
    expect(premisePayoffReviewIssues({payoffChecks:[row]},data)).toContain(
      'S1.payoff恢复展开条件须逐字引用同ID原池已有的全部缺失条件，不得补造来源');
  });
  it('cannot bless a missing intermediate condition with a positive overall verdict',()=>{
    const s=selection(),rows=payoffChecks(s);rows[0].links[0].status='gap';
    expect(premisePayoffReviewIssues({payoffChecks:rows},s)).toContain('S1.payoff不能用总体通过掩盖中间因果缺口');
    (rows[0] as any).status='gap';(rows[0] as any).gapRepair='replace_from_pool';
    expect(materializePremisePayoffReview({payoffChecks:rows},s)[0].reason).toContain('causalPlan[0]');
  });
  it('cannot hide an unassessed intermediate condition as a completed rejection or pass',()=>{
    const s=selection(),rows=payoffChecks(s);rows[0].links[0].status='unknown';
    expect(premisePayoffReviewIssues({payoffChecks:rows},s).length).toBeGreaterThan(0);
    (rows[0] as any).status='unknown';
    expect(materializePremisePayoffReview({payoffChecks:rows},s)).toEqual([expect.objectContaining({kind:'selection_fit',premiseId:'A',repairMode:'replace_from_pool',reason:expect.stringContaining('未确认')})]);
  });
  it('rejects absent, duplicate and wrong-card checks while preserving true gaps',()=>{
    const s=selection(['A','B']);
    for(const kind of ['absent','duplicate','wrong-card']){
      const rows=payoffChecks(s);
      if(kind==='absent')delete (rows[0] as any).links;
      if(kind==='duplicate')rows[0].links[1]=rows[0].links[0];
      if(kind==='wrong-card')rows[0].links[0].ref='S2.causalPlan[0]';
      expect(premisePayoffReviewIssues({payoffChecks:rows},s).length).toBeGreaterThan(0);
    }
  });
  it.each(['警方到场没有接收求援和实际出警依据','血纹转移不在已建立能力边界内','看见处方单不等于律师取得该处方单','限位开关没有录音或记录振动的能力'])('routes evidenced missing prerequisites upstream: %s',reason=>{
    const s=selection(),rows=payoffChecks(s);(rows[0] as any).status='gap';(rows[0] as any).gapRepair='replace_from_pool';rows[0].links[0]={...rows[0].links[0],status:'gap',reason};
    const issues=materializePremisePayoffReview({payoffChecks:rows},s);
    expect(issues[0]).toMatchObject({kind:'selection_fit',premiseId:'A'});expect(issues[0].reason).toContain(reason);
  });
  it('checks all transitions inside the existing source call, without a new review step',async()=>{
    const s=selection(),c=Object.create(ChainController.prototype) as any,{passed,issues,...value}=report(s),budget={remaining:1};
    c.llmCallWithRetry=vi.fn(async(_name:string,prompt:string,options:any)=>{
      expect(prompt).toContain('原池与展开都缺成立条件须报gap');expect(prompt).toContain('S1.causalPlan[1]');
      expect(options.validate(value)).toBe(true);
      const old={...value,payoffChecks:value.payoffChecks.map(({links,...row})=>row)};
      expect(options.validate(old)).toBe(true);
      expect(quarantineIncompletePremiseReviews(old,s,[]).payoffChecks[0].status).toBe('unknown');
      budget.remaining--;return {data:value};
    });
    const result=await c.reviewPremiseSelection(s,'既有标准','source_drift',budget,true);
    expect(result.passed).toBe(true);expect(c.llmCallWithRetry).toHaveBeenCalledOnce();expect(budget.remaining).toBe(0);
  });
  it('preserves nested coordinates when capacity fallback merges source batches',()=>{
    const all=selection(['A','B']),parts=[selection(['B']),selection(['A'])];
    const merged=mergePremiseSourceBatches(all,parts,parts.map(report));
    expect(premisePayoffReviewIssues(merged,all)).toEqual([]);
    expect(merged.payoffChecks?.find(row=>row.ref==='S2.payoff')?.links?.[1].ref).toBe('S2.causalPlan[1]');
  });
  it('rebinds valid receipts and invalidates any changed plan or incomplete proof',async()=>{
    const s=selection(['A','B']),cache=new Map(),review=vi.fn(async input=>report(input));
    await reviewChangedPremiseSources(s,'same rules',cache,review);
    const next=structuredClone(s);
    // Change one valid earlier condition instead of reversing causal time.
    next.selected[1].causalPlan[1].conditions.push({
      field:'openingEvent',quote:next.selected[1].openingEvent,
    });
    const merged=await reviewChangedPremiseSources(next,'same rules',cache,review);
    expect(review.mock.calls[1][0].selected.map((item:any)=>item.premiseId)).toEqual(['B']);
    expect(premisePayoffReviewIssues(merged,next)).toEqual([]);
    const broken=new Map(),incomplete=vi.fn(async input=>{const r=report(input);delete (r.payoffChecks[0] as any).links;return r;});
    await reviewChangedPremiseSources(selection(),'same rules',broken,incomplete);expect(broken.size).toBe(0);
  });
  it('does not allow a replacement to drop the already-required plan',()=>{
    const s=selection(),replacement:any=premise();delete replacement.causalPlan;
    const issue={kind:'selection_fit' as const,premiseId:'A',referencePremiseId:'A',quote:s.selected[0].payoff,referenceQuote:s.pool[0].storyCore,reason:'当前兑现缺少已经说明的成立条件'};
    expect(()=>normalizePremiseReselection({selectedPremises:[replacement]},s,{passed:false,issues:[issue]},1,1)).toThrow('因果计划');
    expect(()=>normalizePremiseSelectionPayload({pool:s.pool,selectedPremises:[{...premise(),causalPlan:[]}]},1,1)).toThrow('因果计划');
  });
  it('keeps a private immutable plan across binding and local prose repairs',()=>{
    const p=premise(),original=structuredClone(p.causalPlan),card=bindStructuredIdeaCardToPremise(p,[{title:'原故事标题',hook:'现有开篇',causalPlan:[{untrusted:'模型不能覆盖已审计划'}]}]);
    p.causalPlan[0].action.quote='外部修改';
    const evidence=selectedPremiseEvidenceForIdeaCard(card)!;(evidence.causalPlan as any[])[0].action.quote='修改读取副本';
    const [patched]=applyOrderedIdeaRepairPatches([card],[{hook:'修订后的开篇仍保留既定故事'}]);
    expect(selectedPremiseEvidenceForIdeaCard(patched)?.causalPlan).toEqual(original);
    expect(card).not.toHaveProperty('causalPlan');
  });
  it('passes the actual plan before card prose and omits other premises private plans',()=>{
    const p=premise(),other=premise('B'),prompt=ideaCardStructuringDirective(p,[p,other]);
    const actual=JSON.parse(prompt.split('【已选题材胚子（内部标识已由服务器移除）】\n')[1].split('\n【同批差异参照')[0]);
    const references=JSON.parse(prompt.split('【同批差异参照（只作边界，不生成或借用其故事路径）】\n')[1]);
    expect(actual.causalPlan).toEqual(p.causalPlan);expect(references[0]).not.toHaveProperty('causalPlan');expect(references[0].payoff).toBe(other.payoff);
    expect(ideaPremiseSelectionDirective('short_story',5)).toContain(STORY_PREREQUISITE_POLICY);
    expect(IDEA_PRESELECTION_REVIEW_POLICY).not.toMatch(/锁定前允许一轮|多个问题位置按单项顺序|再尝试第二个备用/);
  });
});

it('keeps an earlier paid cost separate from a later reward without rewriting either event',()=>{
 const p=premise();
 p.activeChoice='我把自己的押金付给供货人，买齐本次试餐食材。';
 p.escalation='店主核验试餐收入和客户反馈，决定把正式摊位交给我。';
 p.payoff='押金已经用于食材采购。店主签字把正式摊位交给我。';
 p.causalPlan=[
  {action:{field:'activeChoice',quote:p.activeChoice},conditions:[],result:{field:'payoff',quote:'押金已经用于食材采购。'}},
  {action:{field:'escalation',quote:p.escalation},conditions:[],result:{field:'payoff',quote:'店主签字把正式摊位交给我。'}},
 ];
 const before=structuredClone(p);
 expect(premiseCausalPlanIssues(p)).toEqual([]);
 expect(()=>assertPremiseCausalPlans({selected:[p]})).not.toThrow();
 expect(bindPremiseCausalPlan(p)).toEqual(before);
 expect(p).toEqual(before);
});

it('keeps one invalid numbered citation repairable without throwing away valid peer plans',()=>{
 const good={premiseId:'A',activeChoice:'主角实际搬来木料并完成桥面修理',payoff:'孩子随后安全通过已修好的桥面',causalPlan:[{action:{field:'activeChoice',quote:'主角实际搬来木料并完成桥面修理'},conditions:[],result:{field:'payoff',quote:'孩子随后安全通过已修好的桥面'}}]};
 const bad=bindPremiseCausalPlan({...good,premiseId:'B',causalPlan:[{action:{field:'activeChoice',sourceRef:'其他身份:2:1'},conditions:[],result:{field:'payoff',quote:good.payoff}}]});
 expect(premiseCausalPlanIssues(bad).length).toBeGreaterThan(0);
 const repaired=applyPremiseCausalPlanRepairs({selected:[good,bad]},{plans:[{premiseId:'B',causalPlan:bad.causalPlan}]},1);
 expect(repaired.selected).toEqual([good]);
});

it('real refill shortfall is two: preserve four grounded peers if the fifth candidate has an invalid causal citation',()=>{
 const input=selection(['P9','P10','P11','P12','P13']);
 input.selected[3].causalPlan[0].result.quote='本题材不存在的决定性结果';
 const raw={plans:[{premiseId:'P12',causalPlan:structuredClone(input.selected[3].causalPlan)}]};
 expect(()=>applyPremiseCausalPlanRepairs(input,raw)).toThrow('有效候选不足');
 const kept=applyPremiseCausalPlanRepairs(input,raw,2);
 expect(kept.selected.map(item=>item.premiseId)).toEqual(['P9','P10','P11','P13']);
 expect(kept.selected.every(item=>premiseCausalPlanIssues(item).length===0)).toBe(true);
 // Invalid citation does not become an approved result, but a surplus-slot
 // error cannot discard the independently reviewable peers.
 const c=Object.create(ChainController.prototype) as any;
 c.realLLM={generate:vi.fn(async(request:any)=>{
  expect(request.physicalCallBudget.remaining).toBe(1);
  return {content:JSON.stringify(raw)};
 })};
 const budget={remaining:1};
 return expect(c.completePremiseCausalPlans(input,budget,2)).resolves.toMatchObject({
  selected:kept.selected,
 });
});

it('does not spend the refill citation call when grounded candidates already exceed the two actual missing slots',async()=>{
 const selected=selection(['P9','P10','P11','P12','P13']);
 selected.selected[3].causalPlan[0].result.quote='本题材从未写过的结果';
 const ready=selected.selected.filter(item=>premiseCausalPlanIssues(item).length===0);
 expect(ready.map(item=>item.premiseId)).toEqual(['P9','P10','P11','P13']);
 const c=Object.create(ChainController.prototype) as any;
 const generate=vi.fn(async()=>{throw Error('citation correction should not be funded for optional surplus')});
 c.realLLM={generate};
 const quota={remaining:1};
 const result=await c.completePremiseCausalPlans({...selected,selected:ready},quota,2);
 expect(result.selected).toEqual(ready);
 expect(generate).not.toHaveBeenCalled();
 expect(quota.remaining).toBe(1);
});


it('rejects a generated causal action or condition that embeds its claimed result, without rejecting a distinct prior cause',()=>{
 const item={
  protagonistSituation:'她想保住店面，却被迫签下欠款单。',
  activeChoice:'她交出当日出入库台账，管理员拿起资料核查。',
  escalation:'管理员核对后确认了错账，随后退回多扣的费用。',
  payoff:'她取回被扣的费用，也保住了店面。',
 };
 const good={action:{field:'activeChoice',quote:'她交出当日出入库台账，'},
   conditions:[{field:'activeChoice',quote:'管理员拿起资料核查。'}],
   result:{field:'escalation',quote:'管理员核对后确认了错账，'}};
 const final={action:{field:'escalation',quote:'管理员核对后确认了错账，'},
   conditions:[],result:{field:'payoff',quote:'她取回被扣的费用，'}};
 expect(premiseCausalPlanIssues({...item,causalPlan:[good,final]})).toEqual([]);
 const maskedAction={...good,action:{field:'escalation',quote:'管理员核对后确认了错账，随后退回多扣的费用。'},
  result:{field:'escalation',quote:'随后退回多扣的费用。'}};
 expect(premiseCausalPlanIssues({...item,causalPlan:[maskedAction,final]}).join('；'))
   .toContain('引文已包含结果断言');
 const maskedCondition={...good,conditions:[{field:'escalation',quote:'管理员核对后确认了错账，随后退回多扣的费用。'}],
  result:{field:'escalation',quote:'随后退回多扣的费用。'}};
 expect(premiseCausalPlanIssues({...item,causalPlan:[maskedCondition,final]}).join('；'))
   .toContain('引文已包含结果断言');
});

it('rejects a prior causal step that cites a later result as a pre-existing condition',()=>{
 const p=premise();
 p.activeChoice+='救援队打开仓库救出被困者';
 p.causalPlan[0].conditions.push({field:'activeChoice',quote:'救援队打开仓库救出被困者'});
 expect(premiseCausalPlanIssues(p).join('；')).toContain('不能倒用未来结果证明前一步');
 const original=premise();
 expect(premiseCausalPlanIssues(original)).toEqual([]);
});
