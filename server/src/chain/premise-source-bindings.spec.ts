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
