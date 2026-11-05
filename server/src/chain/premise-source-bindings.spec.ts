import {indexedPremiseSourcePool,resolvePremiseSourceReference,exactPremiseSourceFields} from './premise-source-bindings';
import { premiseCausalReferenceExample, PREMISE_SOURCE_REFERENCE_DIRECTIVE } from './premise-causal-plan';
import {premiseSourceReviewWork,completePremiseSourceProof,premiseSourceAuditView} from './premise-selection-review';
import {it,expect} from 'vitest';
import {materializePremiseSourceBindings,projectPremiseSourceChoices,SOURCE_BINDING_EXAMPLE,PREMISE_SOURCE_SECTIONS} from './premise-source-bindings';
import {normalizePremiseSelectionPayload,bindStructuredIdeaCardToPremise} from './idea-discovery-contract';
import {normalizeTargetedPremiseReselection,materializePremiseSourceReview,premiseSourceComparisonCatalog} from './premise-selection-review';
const bodies=[
 '主角看守村中旧桥，桥梁损坏后邻居不肯出工，孩子每天绕行山路。',
 '主角拿出自己的木料先修桥面，邻居看到桥面能站人，选择带来工具共同修桥。',
 '村里确认木料归主角所有，邻居各自能决定是否出工，木桥只能承受行人。',
 '大家轮流铺好桥面并试着步行通过，孩子当天走过木桥；主角用完木料，放弃今年扩建自家屋子的计划。',
 '人物的邻里关系通过实际共同劳动改变，主角承担放弃扩建的代价；故事不依靠文件裁决。',
];
const seed={premiseId:'P1',workingTitle:'他先把木料扛上桥',storyCore:PREMISE_SOURCE_SECTIONS.map((label,index)=>'【'+label+'】'+bodies[index]).join('')};
const nomination=()=>({premiseId:'P1',sourceBindings:structuredClone(SOURCE_BINDING_EXAMPLE),readerQuestion:'主角放弃自家扩建后如何面对家人？',causalPlan:[{
 action:{field:'activeChoice',quote:'邻居看到桥面能站人，选择带来工具共同修桥。'},
 conditions:[{field:'escalation',quote:'木桥只能承受行人。'}],
 result:{field:'payoff',quote:'大家轮流铺好桥面并试着步行通过，孩子当天走过木桥；'},
}]});
it('materializes all actual facts without paraphrase or source mutation and reduces repeated model output',()=>{
 const raw=nomination(),before=structuredClone({raw,seed});
 const result=normalizePremiseSelectionPayload({pool:[seed],selectedPremises:[raw]},1,1);
 expect(result.selected[0].activeChoice).toBe(bodies[1]);
 expect(result.selected[0].payoff).toBe(bodies[3]);
 expect(result.selected[0].escalation).toBe(bodies[2]+'\n'+bodies[3]);
 expect(result.selected[0]).not.toHaveProperty('sourceBindings');
 expect({raw,seed}).toEqual(before);
 for(const body of bodies)expect(Object.values(result.selected[0]).some(value=>typeof value==='string'&&value.includes(body))).toBe(true);
 expect(JSON.stringify(raw).length).toBeLessThan(JSON.stringify(result.selected[0]).length);
});
it('rejects cross-identity, unknown, repeated and reversed bindings instead of guessing',()=>{
 for(const refs of [['新造条件'],['主动选择','主动选择'],['反转兑现','必要条件']]){
  const value=nomination();value.sourceBindings.escalation=refs;
  expect(()=>materializePremiseSourceBindings(value,seed)).toThrow();
 }
 expect(()=>materializePremiseSourceBindings({...nomination(),premiseId:'P2'},seed)).toThrow('同ID');
 expect(()=>materializePremiseSourceBindings(nomination(),{...seed,storyCore:seed.storyCore+'【主动选择】新事实'})).toThrow('唯一');
});
it('rejects mixed rewritten facts and additional unaudited binding fields',()=>{
 expect(()=>materializePremiseSourceBindings({...nomination(),payoff:'另外发明的结果'},seed)).toThrow('改写故事');
 const extra={...nomination(),sourceBindings:{...SOURCE_BINDING_EXAMPLE,secretEvidence:['必要条件']}};
 expect(()=>materializePremiseSourceBindings(extra,seed)).toThrow('其它事实');
 expect(()=>normalizePremiseSelectionPayload({pool:[seed],selectedPremises:[{...nomination(),secretEvidence:'秘密新证据'}]},1,1)).toThrow('额外字段');
});
it('keeps the causal citation contract and independent negative review blocking',()=>{
 const invalid={...nomination(),causalPlan:[{action:{field:'activeChoice',quote:'没有发生的行动'},conditions:[],result:{field:'payoff',quote:bodies[3]}}]};
 expect(()=>normalizePremiseSelectionPayload({pool:[seed],selectedPremises:[invalid]},1,1)).toThrow('因果计划');
 const selection=normalizePremiseSelectionPayload({pool:[seed],selectedPremises:[nomination()]},1,1);
 const report=materializePremiseSourceReview({sourceChecks:premiseSourceComparisonCatalog(selection).map(row=>({ref:row.ref,status:row.field==='payoff'?'unknown':'preserved',reason:'独立复核未能确认关键条件，不能默认质量通过'}))},selection);
 expect(report.passed).toBe(false);expect(report.issues).not.toHaveLength(0);
});
it('uses the same binding contract for targeted original-pool correction',()=>{
 const original=normalizePremiseSelectionPayload({pool:[seed],selectedPremises:[nomination()]},1,1);
 const review={passed:false,issues:[{kind:'source_drift' as const,premiseId:'P1',referencePremiseId:'P1',field:'activeChoice',quote:bodies[1],referenceQuote:seed.storyCore,reason:'原池已经建立必要条件，需要恢复同源事件的实际投影'}]};
 const result=normalizeTargetedPremiseReselection({replacements:[{replacesPremiseId:'P1',premise:nomination()}]},original,review,1,1);
 expect(result.selected[0]).toEqual(original.selected[0]);
});

it('does not duplicate the ending when reversal and payoff reference the same actual source section',()=>{
 const selection=normalizePremiseSelectionPayload({pool:[seed],selectedPremises:[nomination()]},1,1);
 const card=bindStructuredIdeaCardToPremise(selection.selected[0],[{title:'他先把木料扛上桥',hook:'邻居不肯修桥，他先扛来自己的木料。',description:'主角用自己的木料修桥，邻居选择参与，孩子终于走过桥面。',scopeBreakdown:[]}]);
 expect(card.ending).toBe(bodies[3]);
});

it('projects an identity-only choice losslessly without inventing a causal plan or granting review approval',()=>{
 const choices=[{premiseId:seed.premiseId,readerQuestion:'主角如何承担自己选择带来的代价？'}],before=structuredClone({choices,seed});
 const projected=projectPremiseSourceChoices(choices,[seed]);
 const selected=normalizePremiseSelectionPayload({pool:[seed],selectedPremises:projected},1,1);
 expect(selected.selected[0].activeChoice).toBe(bodies[1]);expect(selected.selected[0].payoff).toBe(bodies[3]);
 expect(selected.selected[0]).not.toHaveProperty('causalPlan');
 expect({choices,seed}).toEqual(before);
 expect(()=>projectPremiseSourceChoices([{...choices[0],premiseId:'unknown'}],[seed])).toThrow('同ID');
 expect(()=>projectPremiseSourceChoices([{...choices[0],newPower:'新增获胜能力'}],[seed])).toThrow('额外故事字段');
 expect(()=>projectPremiseSourceChoices(choices,[{...seed,storyCore:'只有结果没有分节的旧来源'}])).toThrow('完整');
 const old=nomination();expect(projectPremiseSourceChoices([old],[seed])[0]).toBe(old);
});

it('resolves numbered contiguous source clauses to exact original text before every original causal validator',()=>{
 const chosen={premiseId:'P1',readerQuestion:'主角放弃自家扩建后如何面对家人？',causalPlan:[{
  action:{field:'activeChoice',sourceRef:'P1:2:2-3'},conditions:[{field:'escalation',sourceRef:'P1:3:3'}],
  result:{field:'payoff',sourceRef:'P1:4:1-2'},
 }]};
 const result=normalizePremiseSelectionPayload({pool:[seed],selectedPremises:projectPremiseSourceChoices([chosen],[seed])},1,1);
 expect(result.selected[0].causalPlan).toEqual(nomination().causalPlan);
 expect(result.selected[0].storyCore).toBe(seed.storyCore);
 expect(indexedPremiseSourcePool([seed])[0].storyCore).toContain('[P1:2:2]邻居看到桥面能站人，[P1:2:3]选择带来工具共同修桥。');
 expect(resolvePremiseSourceReference(seed,'P1:2:2-3')).toBe('邻居看到桥面能站人，选择带来工具共同修桥。');
 expect(PREMISE_SOURCE_REFERENCE_DIRECTIVE).toContain('P1:2:3-5');
 expect(premiseCausalReferenceExample()[0].action.sourceRef).toBe('本项真实ID:2:3-5');
 for(const ref of ['P1:2:2-2:3','P1:2:2-P1:2:3']){
  expect(resolvePremiseSourceReference(seed,ref)).toBe('邻居看到桥面能站人，选择带来工具共同修桥。');
  const raw={...chosen,causalPlan:[{action:{sourceRef:ref},
    conditions:[{sourceRef:'P1:3:3-3:3'}],result:{sourceRef:'P1:4:1-4:2'}}]};
  const normalized=normalizePremiseSelectionPayload({pool:[seed],
    selectedPremises:projectPremiseSourceChoices([raw],[seed])},1,1);
  expect(normalized.selected[0].causalPlan).toEqual(nomination().causalPlan);
 }
 expect(seed.storyCore).not.toContain('[2]');
});

it.each(['P2:2:1','P1:2:99','P1:4:4-2','P1:6:1','P1:4:1-P1:5:1','P1:2:2-3:3','P1:2:2-P2:2:3','P1:2:4-2:3','P1:2:2-P1:3:3','P1:2:2-P1:2:99'])('rejects a cross-owner, missing or noncontiguous source address: %s',ref=>{
 expect(resolvePremiseSourceReference(seed,ref)).toBeUndefined();
 const raw=nomination();(raw.causalPlan[0] as any).action={field:'activeChoice',sourceRef:ref};
 expect(()=>normalizePremiseSelectionPayload({pool:[seed],selectedPremises:[raw]},1,1)).toThrow();
});

it('proves exact copied facts while retaining independent review of the new reader question',()=>{
 const selection=normalizePremiseSelectionPayload({pool:[seed],selectedPremises:[nomination()]},1,1);
 const work=premiseSourceReviewWork(selection);
 expect(work.exact).toHaveLength(9);expect(work.pending.map(row=>row.field)).toEqual(['readerQuestion']);
 const unknown={sourceChecks:[{ref:'S1.readerQuestion',status:'unknown',reason:'追问引入原池没有确认的事实，不能确认兼容'}]};
 const complete=completePremiseSourceProof(unknown,selection);
 expect(materializePremiseSourceReview(complete,selection).passed).toBe(false);
 expect(complete.sourceChecks.find((row:any)=>row.ref==='S1.readerQuestion').status).toBe('unknown');
 expect(premiseSourceAuditView(selection)[0].activeChoice).toEqual({fromSourceSections:['主动选择']});
 expect(completePremiseSourceProof({},selection)).toEqual({});
});

it('requires semantic review again after any source mutation and never overwrites a negative supplied verdict',()=>{
 const selection=normalizePremiseSelectionPayload({pool:[seed],selectedPremises:[nomination()]},1,1);
 selection.selected[0].activeChoice='主角新增自己有权强制全部邻居出工的权限。';
 expect(exactPremiseSourceFields(selection.selected[0],seed).has('activeChoice')).toBe(false);
 expect(premiseSourceReviewWork(selection).pending.map(row=>row.field)).toEqual(['activeChoice','readerQuestion']);
 const raw={sourceChecks:[{ref:'S1.payoff',status:'drift',reason:'模型给出相反结论不能被程序填充静默覆盖'}]};
 expect(completePremiseSourceProof(raw,selection).sourceChecks[0]).toEqual(raw.sourceChecks[0]);
});

it('normalizes an identical fixed-source terminal alias without fabricating payoff coverage for different facts',()=>{
 const raw=nomination();raw.causalPlan[0].result.field='secondOrderConsequence';
 const normalized=normalizePremiseSelectionPayload({pool:[seed],selectedPremises:[raw]},1,1);
 expect(normalized.selected[0].causalPlan).toEqual(nomination().causalPlan);
 const legacy={...normalized.selected[0],storyCore:'未分节的旧故事，不能证明固定原池投影'};
 legacy.causalPlan=raw.causalPlan;
 expect(()=>normalizePremiseSelectionPayload({pool:[{...seed,storyCore:legacy.storyCore}],selectedPremises:[legacy]},1,1)).toThrow('须覆盖主线兑现');
 const changed={...normalized.selected[0],secondOrderConsequence:'另一项不同结果不能被偷换成主线兑现',causalPlan:[{...raw.causalPlan[0],result:{field:'secondOrderConsequence',quote:'另一项不同结果'}}]};
 expect(()=>normalizePremiseSelectionPayload({pool:[seed],selectedPremises:[changed]},1,1)).toThrow('须覆盖主线兑现');
});

it('recovers only a unique same-source field address and an exactly agreeing redundant quote',()=>{
 const raw=nomination();
 (raw.causalPlan[0] as any).action={field:'activeChoice',sourceRef:'P1:2:2-3',quote:raw.causalPlan[0].action.quote};
 (raw.causalPlan[0] as any).conditions=[{field:'necessaryConditions',sourceRef:'P1:3:3'}];
 expect(normalizePremiseSelectionPayload({pool:[seed],selectedPremises:[raw]},1,1).selected[0].causalPlan).toEqual(nomination().causalPlan);
 (raw.causalPlan[0] as any).action.quote='另一段与编号冲突的原文不能被静默覆盖';
 expect(()=>normalizePremiseSelectionPayload({pool:[seed],selectedPremises:[raw]},1,1)).toThrow();
});

it('binds a numbered source action to its canonical exact projection despite repeated field aliases',()=>{
 const raw=nomination();
 (raw.causalPlan[0] as any).action={field:'activeChoice',sourceRef:'P1:4:1'};
 (raw.causalPlan[0] as any).result={field:'payoff',sourceRef:'P1:4:2'};
 const selected=normalizePremiseSelectionPayload({pool:[seed],selectedPremises:[raw]},1,1).selected[0];
 expect(selected.causalPlan[0].action).toEqual({field:'reversalEffect',quote:'大家轮流铺好桥面并试着步行通过，'});
 expect(selected.causalPlan[0].result).toEqual({field:'payoff',quote:'孩子当天走过木桥；'});
 expect(selected.storyCore).toBe(seed.storyCore);
 expect(selected.activeChoice).toBe(bodies[1]);
 const altered={...selected};
 for(const field of ['escalation','reversalEffect','payoff','secondOrderConsequence'])altered[field]='不同且未经验证的事实'+selected[field];
 altered.causalPlan=raw.causalPlan;
 expect(()=>normalizePremiseSelectionPayload({pool:[seed],selectedPremises:[altered]},1,1)).toThrow('须绑定本题材实际故事字段');
});

it('accepts source-only numeric addresses and restores every field before the original causal Gate',()=>{
 const raw=nomination();
 (raw.causalPlan[0] as any).action={sourceRef:'P1:2:2-3'};
 (raw.causalPlan[0] as any).conditions=[{sourceRef:'P1:3:3'}];
 (raw.causalPlan[0] as any).result={sourceRef:'P1:4:1-2'};
 const selected=normalizePremiseSelectionPayload({pool:[seed],selectedPremises:[raw]},1,1).selected[0];
 expect(selected.causalPlan[0].action.quote).toBe(nomination().causalPlan[0].action.quote);
 expect(selected.causalPlan[0].conditions).toEqual(nomination().causalPlan[0].conditions);
 expect(selected.causalPlan[0].result).toEqual(nomination().causalPlan[0].result);
 (raw.causalPlan[0] as any).action={sourceRef:'P2:2:2-3'};
 expect(()=>normalizePremiseSelectionPayload({pool:[seed],selectedPremises:[raw]},1,1)).toThrow();
});

it('inherits the reviewed question for initial and refill cards without regenerating or inventing novelty claims',()=>{
 const selected=normalizePremiseSelectionPayload({pool:[seed],selectedPremises:[nomination()]},1,1).selected[0];
 for(const noveltyProof of [undefined,{familiarShell:'原有外壳',readerQuestion:'未经审核的新追问'}]){
   const raw={title:'他先把木料扛上桥',noveltyProof},before=JSON.stringify(raw);
   const card=bindStructuredIdeaCardToPremise(selected,[raw]);
   expect((card.noveltyProof as any).readerQuestion).toBe(selected.readerQuestion);
   expect((card.noveltyProof as any).secondOrderConsequence).toBeUndefined();
   expect(JSON.stringify(raw)).toBe(before);
 }
 const legacy=bindStructuredIdeaCardToPremise({premiseId:'legacy'},[{noveltyProof:{readerQuestion:'旧卡原有追问'}}]);
 expect((legacy.noveltyProof as any).readerQuestion).toBe('旧卡原有追问');
});
