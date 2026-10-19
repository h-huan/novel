import { expect,it } from 'vitest';
import { applyIdeaScopeAllocation, bindUniqueIdeaScopeAllocation, ideaScopeAllocationRepairPlan } from './idea-scope-allocation';
import { applyOrderedIdeaRepairPatches, bindStructuredIdeaCardToPremise, orderedIdeaRepairPatches, selectedPremiseEvidenceForIdeaCard } from './idea-discovery-contract';
import { causalAuditRepairPrompt, causalChapterResultAnchors, causalEvidenceAnchors } from '../modules/writing-quality/causal-review';
import { OUTLINE_PROJECTION_POLICY } from '../../shared/src/system-workflow-rules.registry';

const card=()=>({title:'原故事标题',sourcePremiseId:'P1',targetPlatform:'fanqie',estimatedWords:18000,plannedChapters:4,
 description:'既有故事、人物、行动与代价不变化。',ending:'既定结局与代价。',
 scopeBreakdown:Array.from({length:4},(_,index)=>({arc:`阶段${index+1}`,chapters:index+1,reason:`原有事件${index+1}`,outcome:`既定结果${index+1}`}))});
it('binds the real ordinal/count mix-up before semantic review without touching prose or total',()=>{
 const raw=card(),before=JSON.stringify(raw),bound=bindUniqueIdeaScopeAllocation(raw);
 expect(bound.scopeBreakdown.map(stage=>stage.chapters)).toEqual([1,1,1,1]);
 expect(bound.scopeBreakdown.reduce((sum,stage)=>sum+stage.chapters,0)).toBe(bound.plannedChapters);
 expect({...bound,scopeBreakdown:raw.scopeBreakdown}).toEqual(raw);expect(JSON.stringify(raw)).toBe(before);
 expect(bound.scopeBreakdown.map(({chapters,...stage})=>stage)).toEqual(raw.scopeBreakdown.map(({chapters,...stage})=>stage));
});
it('normalizes during server-owned card binding and preserves the locked premise',()=>{
 const raw=card(),p={premiseId:'P1',payoff:'既定行动后承担真实代价'},bound=bindStructuredIdeaCardToPremise(p,[raw]);
 expect((bound.scopeBreakdown as any[]).map(stage=>stage.chapters)).toEqual([1,1,1,1]);
 expect(selectedPremiseEvidenceForIdeaCard(bound)).toEqual(p);
});
it('does not guess multi-solution counts, change valid counts or override explicit chapter prose',()=>{
 const raw=card();raw.scopeBreakdown=raw.scopeBreakdown.slice(0,2);
 expect(bindUniqueIdeaScopeAllocation(raw)).toBe(raw);
 const explicit=card();explicit.scopeBreakdown[1].arc='第2—3章的事件';expect(bindUniqueIdeaScopeAllocation(explicit)).toBe(explicit);
 const valid=card();valid.scopeBreakdown.forEach(stage=>stage.chapters=1);
 expect(bindUniqueIdeaScopeAllocation(valid)).toBe(valid);expect(ideaScopeAllocationRepairPlan(valid)).toBeUndefined();
});
it('repairs only chapter counts against the frozen live stages',()=>{
 const raw=card();raw.scopeBreakdown=raw.scopeBreakdown.slice(0,2);const plan=ideaScopeAllocationRepairPlan(raw)!;
 const repaired=applyIdeaScopeAllocation(raw,[2,2],plan);
 expect({...repaired,scopeBreakdown:raw.scopeBreakdown}).toEqual(raw);
 expect(repaired.scopeBreakdown.map((stage:any)=>stage.chapters)).toEqual([2,2]);
 expect(raw.scopeBreakdown.map(stage=>stage.chapters)).toEqual([1,2]);
 const other={...raw,plannedChapters:5};expect(()=>applyIdeaScopeAllocation(other,[2,2],plan)).toThrow('上下文已变化');
});
it.each([[0,4],[1,1],[2,2,1],[2.5,1.5],['2',2]])('keeps positive integer/count/total gates for %j',counts=>{
 const raw=card();raw.scopeBreakdown=raw.scopeBreakdown.slice(0,2);
 expect(()=>applyIdeaScopeAllocation(raw,counts,ideaScopeAllocationRepairPlan(raw)!)).toThrow('scopeAllocation');
});
it('does not authorize an impossible stage count or invent missing narrative stages',()=>{
 const raw=card();raw.plannedChapters=3;expect(ideaScopeAllocationRepairPlan(raw)).toBeUndefined();
 raw.scopeBreakdown=[];expect(ideaScopeAllocationRepairPlan(raw)).toBeUndefined();
});
it('the existing patch path accepts authorized metadata corrections and keeps story/configuration frozen',()=>{
 const raw=card(),plan=ideaScopeAllocationRepairPlan(raw)!;
 const patches=orderedIdeaRepairPatches({patches:[{}],scopeAllocation:[1,1,1,1]},1);
 const apply=(p:unknown)=>applyOrderedIdeaRepairPatches([raw],p,[],[],[],[],[],[],[plan],[0])[0];
 const next=apply(patches);expect(next.plannedChapters).toBe(4);expect(next.targetPlatform).toBe('fanqie');expect(next.description).toBe(raw.description);
 expect(()=>apply([{scopeAllocation:[1,1,1,1],description:'借数量问题另改故事'}])).toThrow('仅标签或数量');
 expect(()=>applyOrderedIdeaRepairPatches([raw],patches)).toThrow('未获得');
});
it('creation audit keeps the complete fact inventory and never auto-converts a semantic gap into a pass',()=>{
 const chapters=[{content:'她说明只有自己担责，表舅和其他签字人不担。',highlights:[{point:'“表舅在这行字里，是其他人。”一句话讲清责任。'}],characterActions:[{action:'她说明合同责任',result:'亲戚明白责任只落在她身上'}]}];
 const body=JSON.stringify(chapters),anchors=causalEvidenceAnchors(body,{}),results=causalChapterResultAnchors(anchors,0);
 expect(results.some(row=>row.path==='0.highlights.0.point')).toBe(true);
 expect(results.some(row=>row.path==='0.characterActions.0.result')).toBe(true);
 const audit={status:'evaluated',transitions:[{status:'gap',reason:'旧评审只因台词措辞不同判缺失'}]},before=structuredClone(audit);
 const prompt=causalAuditRepairPrompt(audit,[],body,{});
 expect(prompt.prompt).toContain(OUTLINE_PROJECTION_POLICY);expect(prompt.prompt).toContain('要求重报不等于已调整');
 expect(audit).toEqual(before);
});
