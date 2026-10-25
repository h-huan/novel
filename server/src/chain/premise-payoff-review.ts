import { type PremiseSelectionResult } from './idea-discovery-contract';
import { type PremiseSelectionReview } from './premise-selection-review';
import { premiseCausalCatalog, premiseCausalPlanIssues } from './premise-causal-plan';
export interface PremiseCausalCheck {ref:string;status:'supported'|'gap'|'unknown';reason:string;}
export interface PremisePayoffCheck {ref:string;status:'supported'|'gap'|'unknown';actionEvidenceRef?:string;conditionEvidenceRef?:string;reason:string;actionEvidenceQuote?:string;conditionEvidenceQuote?:string;gapRepair?:'restore_source_conditions'|'replace_from_pool';sourceConditionQuote?:string;links?:PremiseCausalCheck[];}
const ACTION_EVIDENCE_FIELDS=['openingEvent','activeChoice','escalation','reversalEffect'];
const CONDITION_EVIDENCE_FIELDS=['protagonistSituation','openingEvent','coreConflict','activeChoice','escalation','reversalEffect','irreplaceableCarrier'];
function permittedEvidenceFields(candidate:Record<string,unknown>|undefined,key:string):string[]{
  const plan=Array.isArray(candidate?.causalPlan)?candidate.causalPlan:[];
  const planned=key==='actionEvidenceRef'?plan.map(link=>link?.action?.field):plan.flatMap(link=>Array.isArray(link?.conditions)?link.conditions.map((anchor:any)=>anchor?.field):[]);
  return [...new Set([...(key==='actionEvidenceRef'?ACTION_EVIDENCE_FIELDS:CONDITION_EVIDENCE_FIELDS),...planned.filter((field):field is string=>typeof field==='string'),...(plan.length?['payoff']:[])])];
}
/** Extra-role evidence must be actual non-result text in the same premise.
 * This checks address integrity only; independent semantic review still decides causality. */
function unplannedPayoffEvidenceIssues(row:any,candidate:Record<string,any>,key:string,field:string):string[]{
 const quoteKey=key==='actionEvidenceRef'?'actionEvidenceQuote':'conditionEvidenceQuote',quote=row[quoteKey];
 const plan=Array.isArray(candidate.causalPlan)?candidate.causalPlan:[];
 const planned=key==='actionEvidenceRef'?plan.map(link=>link?.action?.field):plan.flatMap(link=>Array.isArray(link?.conditions)?link.conditions.map((a:any)=>a.field):[]);
 if(quote===undefined&&(field!=='payoff'||planned.includes(field)))return [];
 const text=candidate[field];
 if(typeof quote!=='string'||quote.trim().length<4||typeof text!=='string'||!text.includes(quote))
  return [row.ref+'的'+quoteKey+'须逐字定位本题材中的实际行动或独立条件'];
 const resultRanges=plan.filter(link=>link?.result?.field===field&&typeof link.result.quote==='string')
  .flatMap(link=>{const out:Array<[number,number]>=[];let at=text.indexOf(link.result.quote);while(at>=0){out.push([at,at+link.result.quote.length]);at=text.indexOf(link.result.quote,at+1);}return out;});
 let at=text.indexOf(quote),separate=false;
 while(at>=0){if(resultRanges.every(([start,end])=>at+quote.length<=start||at>=end))separate=true;at=text.indexOf(quote,at+1);}
 if(!separate||field==='payoff'&&!resultRanges.length)return [row.ref+'不能把计划结果断言或其片段当作行动或必要条件'];
 return [];
}
export function premisePayoffCatalog(selection:PremiseSelectionResult){
  return selection.selected.map((item,index)=>({ref:'S'+(index+1)+'.payoff',premiseId:String(item.premiseId)}));
}
export function premisePayoffReviewDirective(selection:PremiseSelectionResult){
  return '\n按已注入GEN-002的缺口路由合同，gap项额外返回gapRepair=restore_source_conditions|replace_from_pool；restore_source_conditions须加sourceConditionQuote，逐字引用同ID原池已建立的全部缺失条件；原池也缺条件或无法给出真实引用时返回replace_from_pool，不补造条件。\n按已注入GEN-002的兑现必要条件合同独立检查，不把结局声称当成立条件。\n【必返payoffChecks目录】'+JSON.stringify(premisePayoffCatalog(selection))
    +'\n【逐环节因果计划目录；行动与条件原文见待锁定胚子的causalPlan，不重复发送】'+JSON.stringify(selection.selected.flatMap((item,index)=>premiseCausalCatalog(item,`S${index+1}.`).map(({ref})=>({ref}))))
    +'\n先核对每个causalPlan环节：action只能直接改变什么、conditions是否实际建立并足以导致result。每个payoffChecks新增links数组，逐一返回本题材目录的{ref,status:"supported|gap|unknown",reason:"具体必要条件为何充分或缺失，至少8字"}，不得漏项、重复、跨题材或靠一条总体认可代替。conditions为空不自动通过，遇到实际必要条件未写仍须gap；原池与展开一起漏写的条件同样为gap。计划遗漏的关键中间结果也须在本题材整体payoffChecks中报告gap，不能仅核对作者自行列出的环节。整体status须与links一致：任一unknown则unknown，其次任一gap则gap，其余才supported；发现计划外缺口可整体gap但保留links的真实结论。'
    +'\n【逐题材允许的行动和条件字段，包含本计划实际使用的字段】'+JSON.stringify(selection.selected.map((candidate,index)=>({ref:`S${index+1}.payoff`,actionFields:permittedEvidenceFields(candidate,'actionEvidenceRef'),conditionFields:permittedEvidenceFields(candidate,'conditionEvidenceRef')})))+'。每个编号须加本卡S序号前缀，不引用自评或读者问题。causalPlan是定位索引，不是证据的封闭白名单；先在本题材全部实际故事字段寻找必要条件，再判断gap。必要行动或条件写在payoff而未被计划选中时，另返actionEvidenceQuote或conditionEvidenceQuote，逐字引用不与计划result断言重叠的实际行动/独立条件；只引用结果或其片段仍拒绝，不为原文没有的条件补故事。'
    +'\npayoffChecks每个ref恰好一项，形状为{"ref":"S1.payoff","status":"supported|gap|unknown","actionEvidenceRef":"S1.activeChoice","conditionEvidenceRef":"S1.escalation","links":'+JSON.stringify(premiseCausalCatalog(selection.selected[0], 'S1.').map(({ref})=>({ref,status:'supported|gap|unknown',reason:'逐项说明该环节的行动和必要条件是否足以导致结果'})))+',"reason":"至少8字逐项说明决定性结果的必要条件如何取得或缺失"}。证据编号只选本题材实际展开字段名（S序号加字段名）；supported须有行动证据，额外必要条件须有conditionEvidenceRef；普通直接因果无需另造手续。gap与unknown可省略证据，不编造引用。不能用payoff中的结果断言或另一处相同断言自证；实际行动或独立条件恰在payoff段内时，须由causalPlan绑定其中不同于结果的真实原文，不能以字段名代替语义角色。';
}
export function premisePayoffReviewIssues(value:any,selection:PremiseSelectionResult):string[]{
  const expected=premisePayoffCatalog(selection),rows=value?.payoffChecks,errors:string[]=[];
  if(!Array.isArray(rows)||rows.length!==expected.length)return ['payoffChecks须逐卡覆盖全部兑现必要条件审查'];
  const seen=new Set<string>();
  for(const row of rows){
    const item=expected.find(item=>item.ref===row?.ref);
    if(!item||seen.has(row.ref)){errors.push('兑现审查编号未知或重复');continue;}seen.add(row.ref);
    if(!['supported','gap','unknown'].includes(row.status)||typeof row.reason!=='string'||row.reason.trim().length<8)errors.push(row.ref+'缺少明确状态与必要条件依据');
    const candidate=selection.selected.find(candidate=>candidate.premiseId===item.premiseId)!;
    if(row.gapRepair!==undefined&&!['restore_source_conditions','replace_from_pool'].includes(row.gapRepair))errors.push(row.ref+'的gapRepair模式无效');
    if(row.gapRepair==='restore_source_conditions'){
      const source=selection.pool.find(seed=>seed.premiseId===item.premiseId);
      if(row.status!=='gap'||typeof row.sourceConditionQuote!=='string'||row.sourceConditionQuote.trim().length<8
        ||!String(source?.storyCore||'').includes(row.sourceConditionQuote))
        errors.push(row.ref+'恢复展开条件须逐字引用同ID原池已有的全部缺失条件，不得补造来源');
    }
    if(candidate.causalPlan!==undefined){
      errors.push(...premiseCausalPlanIssues(candidate).map(error=>row.ref+'：'+error));
      const expectedLinks=premiseCausalCatalog(candidate,row.ref.slice(0,row.ref.indexOf('.')+1)),links=row.links;
      if(!Array.isArray(links)||links.length!==expectedLinks.length)errors.push(row.ref+'的links须覆盖全部关键因果环节');
      else {
        const seenLinks=new Set<string>();
        for(const link of links){
          if(!expectedLinks.some(item=>item.ref===link?.ref)||seenLinks.has(link?.ref))errors.push(row.ref+'的因果环节编号未知、跨卡或重复');
          seenLinks.add(link?.ref);
          if(!['supported','gap','unknown'].includes(link?.status)||typeof link?.reason!=='string'||link.reason.trim().length<8)errors.push(row.ref+'的因果环节缺少明确结论及依据');
        }
        if(links.some((link:PremiseCausalCheck)=>link.status==='unknown')&&row.status!=='unknown')errors.push(row.ref+'不能把未确认的因果条件当成已完成审查');
        if(links.some((link:PremiseCausalCheck)=>link.status==='gap')&&row.status==='supported')errors.push(row.ref+'不能用总体通过掩盖中间因果缺口');
      }
    }
    for(const key of ['actionEvidenceRef','conditionEvidenceRef']){
      const ref=row[key];
      if(ref===undefined){if(key==='actionEvidenceRef'&&row.status==='supported')errors.push(row.ref+'缺少实际行动证据');continue;}
      const prefix=row.ref.slice(0,row.ref.indexOf('.')+1),field=typeof ref==='string'&&ref.startsWith(prefix)?ref.slice(prefix.length):'';
      const candidate=selection.selected.find(candidate=>candidate.premiseId===item.premiseId);
      const fields=permittedEvidenceFields(candidate,key);
      if(!fields.includes(field)||typeof candidate?.[field]!=='string'||String(candidate[field]).trim().length<8)
        errors.push(row.ref+'证据须引用本题材已有行动或成立条件，不得用兑现结论自证');
      else errors.push(...unplannedPayoffEvidenceIssues(row,candidate!,key,field));
    }
  }
  return errors;
}
export function materializePremisePayoffReview(value:any,selection:PremiseSelectionResult):PremiseSelectionReview['issues']{
  const errors=premisePayoffReviewIssues(value,selection);if(errors.length)throw Error(errors.join('；'));
  const unknown=value.payoffChecks.filter((row:PremisePayoffCheck)=>row.status==='unknown');
  if(unknown.length)throw Error('锁定前兑现必要条件未评估：'+unknown.map((row:PremisePayoffCheck)=>row.ref+'：'+row.reason).join('；'));
  return value.payoffChecks.filter((row:PremisePayoffCheck)=>row.status==='gap').map((row:PremisePayoffCheck)=>{
    const item=premisePayoffCatalog(selection).find(item=>item.ref===row.ref)!;
    return {kind:'selection_fit' as const,premiseId:item.premiseId,referencePremiseId:item.premiseId,
      ...(row.gapRepair==='restore_source_conditions'?{}:{repairMode:'replace_from_pool' as const}),
      quote:String(selection.selected.find(p=>p.premiseId===item.premiseId)!.payoff),
      referenceQuote:String(selection.pool.find(p=>p.premiseId===item.premiseId)!.storyCore),reason:[row.reason,...(row.links||[]).filter(link=>link.status==='gap').map(link=>link.ref+'：'+link.reason)].join('；')};
  });
}
