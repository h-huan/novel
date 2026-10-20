import { describe, expect, it, vi } from 'vitest';
import { assertPremiseCausalPlans, premiseCausalPlanIssues } from './premise-causal-plan';
import { applyOrderedIdeaRepairPatches, bindStructuredIdeaCardToPremise, ideaCardStructuringDirective, ideaPremiseSelectionDirective, normalizePremiseSelectionPayload, incompleteInitialPremisePlans, applyInitialPremisePlanOnlyPatch, selectedPremiseEvidenceForIdeaCard } from './idea-discovery-contract';
import { materializePremisePayoffReview, premisePayoffReviewIssues } from './premise-payoff-review';
import { materializePremiseSourceReview, normalizePremiseReselection, premiseSourceComparisonCatalog } from './premise-selection-review';
import { mergePremiseSourceBatches } from './premise-source-batches';
import { reviewChangedPremiseSources } from './premise-source-reuse';
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
    actionEvidenceRef:`S${index+1}.activeChoice`,conditionEvidenceRef:`S${index+1}.escalation`,reason:'实际到场由报告地点及值班派遣触发，不由结局倒推。',
    links:item.causalPlan.map((_,n)=>({ref:`S${index+1}.causalPlan[${n}]`,status:'supported' as 'supported'|'gap'|'unknown',reason:'已建立接收者、实际派遣与定位，到场条件成立。'}))}));
}
function report(s:ReturnType<typeof selection>) {
  const sourceChecks=premiseSourceComparisonCatalog(s).map(row=>({ref:row.ref,status:'preserved' as const,reason:'当前展开保留原池实际行动、对象与兑现承诺。'}));
  return {...materializePremiseSourceReview({sourceChecks},s),payoffChecks:payoffChecks(s)};
}

describe('plan critical prerequisites before full story cards',()=>{
  it('repairs only an incomplete selected plan and preserves pool, selection, labels and all prose verbatim',()=>{
    const raw={pool:['A','B'].map(premise),selectedPremises:['A','B'].map(premise)};
    raw.selectedPremises[1].causalPlan=[raw.selectedPremises[1].causalPlan[0]];
    const original=JSON.stringify(raw);
    expect(()=>normalizePremiseSelectionPayload(raw,2,2)).toThrow('causalPlan须覆盖主线兑现');
    const faults=incompleteInitialPremisePlans(raw,2,2);
    expect(faults.map(row=>row.premiseId)).toEqual(['B']);
    expect(faults[0].issues).toContain('causalPlan须覆盖主线兑现，不能只列开端或普通动作');
    const candidate={plans:[{premiseId:'B',causalPlan:premise('B').causalPlan}]};
    const patched=applyInitialPremisePlanOnlyPatch(raw,candidate,['B'],2,2);
    expect(patched.pool).toEqual(normalizePremiseSelectionPayload({pool:raw.pool,selectedPremises:raw.selectedPremises.map(({causalPlan,...item})=>item)},2,2).pool);
    expect(patched.selected[0].causalPlan).toEqual(raw.selectedPremises[0].causalPlan);
    expect(patched.selected[1].causalPlan).toEqual(premise('B').causalPlan);
    expect(patched.selected.map(({causalPlan,...item})=>item)).toEqual(
      normalizePremiseSelectionPayload({pool:raw.pool,selectedPremises:raw.selectedPremises.map(({causalPlan,...item})=>item)},2,2).selected);
    expect(JSON.stringify(raw)).toBe(original);
    for(const bad of [
      {plans:[{premiseId:'A',causalPlan:premise('A').causalPlan}]},
      {plans:[{premiseId:'B',causalPlan:premise('B').causalPlan,activeChoice:'偷改原行动'}]},
      {plans:[{premiseId:'B',causalPlan:[premise('B').causalPlan[0]]}]},
      {plans:[{premiseId:'B',causalPlan:[{action:{field:'activeChoice',quote:'凭空出现的能力'},conditions:[],result:{field:'payoff',quote:premise('B').payoff}}]}]},
      {plans:[]},
    ]) expect(()=>applyInitialPremisePlanOnlyPatch(raw,bad,['B'],2,2)).toThrow();
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
  it('cannot bless a missing intermediate condition with a positive overall verdict',()=>{
    const s=selection(),rows=payoffChecks(s);rows[0].links[0].status='gap';
    expect(premisePayoffReviewIssues({payoffChecks:rows},s)).toContain('S1.payoff不能用总体通过掩盖中间因果缺口');
    (rows[0] as any).status='gap';
    expect(materializePremisePayoffReview({payoffChecks:rows},s)[0].reason).toContain('causalPlan[0]');
  });
  it('cannot hide an unassessed intermediate condition as a completed rejection or pass',()=>{
    const s=selection(),rows=payoffChecks(s);rows[0].links[0].status='unknown';
    expect(premisePayoffReviewIssues({payoffChecks:rows},s).length).toBeGreaterThan(0);
    (rows[0] as any).status='unknown';
    expect(()=>materializePremisePayoffReview({payoffChecks:rows},s)).toThrow('未评估');
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
    const s=selection(),rows=payoffChecks(s);(rows[0] as any).status='gap';rows[0].links[0]={...rows[0].links[0],status:'gap',reason};
    const issues=materializePremisePayoffReview({payoffChecks:rows},s);
    expect(issues[0]).toMatchObject({kind:'selection_fit',premiseId:'A'});expect(issues[0].reason).toContain(reason);
  });
  it('checks all transitions inside the existing source call, without a new review step',async()=>{
    const s=selection(),c=Object.create(ChainController.prototype) as any,{passed,issues,...value}=report(s),budget={remaining:1};
    c.llmCallWithRetry=vi.fn(async(_name:string,prompt:string,options:any)=>{
      expect(prompt).toContain('原池和展开同样漏写条件也须返回gap');expect(prompt).toContain('S1.causalPlan[1]');
      expect(options.validate(value)).toBe(true);
      const old={...value,payoffChecks:value.payoffChecks.map(({links,...row})=>row)};
      expect(options.validate(old)).toBe(false);budget.remaining--;return {data:value};
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
    const next=structuredClone(s);next.selected[1].causalPlan.reverse();
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
