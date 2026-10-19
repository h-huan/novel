import { describe, expect, it } from 'vitest';
import { bindPremiseCausalPlan, premiseCausalPlanIssues } from './premise-causal-plan';
import { applyOrderedIdeaRepairPatches, orderedIdeaRepairPatches } from './idea-discovery-contract';
import { premisePayoffReviewIssues } from './premise-payoff-review';

const premise = () => ({ premiseId:'A', protagonistSituation:'😀他借用本事后欠下一段等长的“空账”。',
  openingEvent:'当晚他必须处理仓库里的险情。', activeChoice:'她向值班人员报告具体地址。',
  coreConflict:'工作压力让她不敢轻易求援。', escalation:'值班人员收到地址后派出救援队。',
  reversalEffect:'救援队找到仓库并核实被困位置。', payoff:'救援队打开仓库救出被困者。',
  causalPlan:[{action:{field:'activeChoice',quote:'她向值班人员报告具体地址。'},conditions:[{field:'protagonistSituation',quote:"他借用本事后欠下一段等长的'空账'。"}],result:{field:'payoff',quote:'救援队打开仓库救出被困者。'}}],
});

describe('bind existing causal evidence without model protocol repairs',()=>{
  it('normalizes quote typography to the actual source while retaining original offsets',()=>{
    const p=premise(),before=JSON.stringify(p),bound=bindPremiseCausalPlan(p);
    expect((bound.causalPlan as any[])[0].conditions[0].quote).toBe('他借用本事后欠下一段等长的“空账”。');
    expect(premiseCausalPlanIssues(bound)).toEqual([]);expect(JSON.stringify(p)).toBe(before);
    expect(bound.protagonistSituation).toBe(p.protagonistSituation);
  });
  it('rebinds a wrong field only when the same-premise quote has one actual field location',()=>{
    const p=premise();p.causalPlan[0].conditions[0]={field:'coreConflict',quote:'值班人员收到地址后派出救援队。'};
    const bound=bindPremiseCausalPlan(p);
    expect((bound.causalPlan as any[])[0].conditions[0]).toEqual({field:'escalation',quote:p.escalation});
    expect(premiseCausalPlanIssues(bound)).toEqual([]);
  });
  it('keeps an explicit valid field even when another field repeats that quote',()=>{
    const p=premise();p.escalation=p.activeChoice;
    const bound=bindPremiseCausalPlan(p);
    expect((bound.causalPlan as any[])[0].action.field).toBe('activeChoice');
  });
  it('never guesses between two possible fields or searches another premise',()=>{
    const p=premise();p.reversalEffect=p.escalation;p.causalPlan[0].conditions[0]={field:'coreConflict',quote:p.escalation};
    const bound=bindPremiseCausalPlan(p);
    expect((bound.causalPlan as any[])[0].conditions[0].field).toBe('coreConflict');
    expect(premiseCausalPlanIssues(bound).length).toBeGreaterThan(0);
    p.causalPlan[0].conditions[0]={field:'S2.escalation',quote:p.escalation};
    expect(premiseCausalPlanIssues(bindPremiseCausalPlan(p)).length).toBeGreaterThan(0);
  });
  it.each(['他能永久借用别人的本事。','他借用本事后不欠下一段等长的“空账”。','他借用本事后欠下2段等长的“空账”。','他借用本事后欠下一段等长的“空 账”。'])('does not turn an unsupported statement into evidence: %s',quote=>{
    const p=premise();p.causalPlan[0].conditions[0].quote=quote;
    expect(premiseCausalPlanIssues(bindPremiseCausalPlan(p)).length).toBeGreaterThan(0);
  });
  it('allows distinct actual actions and conditions inside payoff without allowing result self-proof',()=>{
    const p=premise();p.payoff='她向值班人员报告仓库地址。值班人员派出救援队。救援队打开仓库救出被困者。';
    p.causalPlan=[{action:{field:'payoff',quote:'她向值班人员报告仓库地址。'},conditions:[{field:'payoff',quote:'值班人员派出救援队。'}],result:{field:'payoff',quote:'救援队打开仓库救出被困者。'}}];
    const bound=bindPremiseCausalPlan(p),selection={pool:[],selected:[bound],poolTargetMet:true};
    expect(premiseCausalPlanIssues(bound)).toEqual([]);
    expect(premisePayoffReviewIssues({payoffChecks:[{ref:'S1.payoff',status:'supported',actionEvidenceRef:'S1.payoff',conditionEvidenceRef:'S1.payoff',reason:'已有报告地点与实际派遣事件，行动条件不同于结果断言。',links:[{ref:'S1.causalPlan[0]',status:'supported',reason:'值班派出救援队后才到场，事件桥接已经写明。'}]}]},selection)).toEqual([]);
    p.causalPlan[0].conditions[0].quote=p.causalPlan[0].result.quote;
    expect(premiseCausalPlanIssues(bindPremiseCausalPlan(p))).toContain('causalPlan[0]不能用同一结果断言自证行动或条件');
  });
});

describe('unambiguous repair envelope placement',()=>{
  const card={sourcePremiseId:'A',title:'保住既有承诺',targetPlatform:'fanqie',description:'既有故事内容不改。',plotTags:['错误标签']};
  const apply=(payload:unknown,only=true)=>applyOrderedIdeaRepairPatches([card],orderedIdeaRepairPatches(payload,1),[],[],[],[{plotTags:['探案','悬念反转']}],only?[0]:[])[0];
  it('applies the real single-card shape with dimensionPatch beside patches',()=>{
    const raw={patches:[{}],dimensionPatch:{plotTags:['探案','悬念反转']}},before=JSON.stringify(raw),result=apply(raw);
    expect(result).toEqual({...card,plotTags:['探案','悬念反转']});expect(JSON.stringify(raw)).toBe(before);
  });
  it('also supports a sole single-card root patch without inventing an identity',()=>{
    expect(apply({dimensionPatch:{plotTags:['探案']}})).toEqual({...card,plotTags:['探案']});
  });
  it('retains canonical multi-card ordered patches and rejects ambiguous root fields',()=>{
    const raw={patches:[{dimensionPatch:{plotTags:['探案']}},{dimensionPatch:{plotTags:['悬念反转']}}]};
    expect(orderedIdeaRepairPatches(raw,2)).toBe(raw.patches);
    expect(()=>orderedIdeaRepairPatches({...raw,dimensionPatch:{plotTags:['探案']}},2)).toThrow('多卡');
  });
  it('rejects conflicting values instead of choosing an outer or inner version',()=>{
    expect(()=>apply({patches:[{dimensionPatch:{plotTags:['探案']}}],dimensionPatch:{plotTags:['悬念反转']}})).toThrow('内外冲突');
    expect(()=>apply({patches:[{hook:'旧钩子'}],hook:'另一钩子'},false)).toThrow('内外冲突');
  });
  it('allows identical repeated fields without double-applying them',()=>{
    expect(apply({patches:[{dimensionPatch:{plotTags:['探案']}}],dimensionPatch:{plotTags:['探案']}}).plotTags).toEqual(['探案']);
  });
  it('preserves authorization, dictionary checks, manual choices and story-only boundaries',()=>{
    expect(()=>apply({dimensionPatch:{plotTags:['不在字典']}})).toThrow('服务器点名字段');
    expect(()=>apply({dimensionPatch:{writingStyle:['简洁']}})).toThrow('服务器点名字段');
    expect(()=>apply({dimensionPatch:{plotTags:['探案']},description:'顺便改故事'})).toThrow('仅标签问题');
    const patches=orderedIdeaRepairPatches({dimensionPatch:{plotTags:['探案']}},1);
    expect(()=>applyOrderedIdeaRepairPatches([card],patches,[],[],[],[{plotTags:['探案','悬念反转']}],[0],[{plotTags:['探案','悬念反转']}])).toThrow('服务器点名字段');
  });
  it('does not silently replace malformed patches, platform or identity',()=>{
    expect(()=>orderedIdeaRepairPatches({patches:[],dimensionPatch:{plotTags:['探案']}},1)).toThrow('结构不完整');
    const result=apply({patches:[{}],dimensionPatch:{plotTags:['探案']},sourcePremiseId:'B',targetPlatform:'other'});
    expect(result.sourcePremiseId).toBe('A');expect(result.targetPlatform).toBe('fanqie');
  });
});
