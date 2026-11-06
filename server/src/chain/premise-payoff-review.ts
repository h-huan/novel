import { type PremiseSelectionResult } from './idea-discovery-contract';
import { type PremiseSelectionReview, PREMISE_REVIEW_PROTOCOL_REASON } from './premise-selection-review';
import { premiseCausalCatalog, premiseCausalPlanIssues, PREMISE_CAUSAL_NARRATIVE_FIELDS } from './premise-causal-plan';
export interface PremiseCausalCheck {ref:string;status:'supported'|'gap'|'unknown';reason:string;decisionCheck?:{status:'supported'|'gap'|'unknown'|'not_required';deciderQuote?:string;basisQuote?:string;reason:string};}
export interface PremisePayoffCheck {ref:string;status:'supported'|'gap'|'unknown';protocolIncomplete?:boolean;reversalCheck?:{status:'supported'|'gap'|'unknown';actionEvidenceRef?:string;actionEvidenceQuote?:string;reason:string};actionEvidenceRef?:string;conditionEvidenceRef?:string;reason:string;actionEvidenceQuote?:string;conditionEvidenceQuote?:string;gapRepair?:'restore_source_conditions'|'replace_from_pool';sourceConditionQuote?:string;links?:PremiseCausalCheck[];}
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
 // Source projection can give the SAME text several narrative field names.
 // Compute result exclusions across those exact aliases; a renamed result is
 // still a result, and a separately anchored action stays a separate action.
 const resultRanges=plan.filter(link=>PREMISE_CAUSAL_NARRATIVE_FIELDS.includes(link?.result?.field)
   &&candidate[link.result.field]===text&&typeof link.result.quote==='string')
  .flatMap(link=>{const out:Array<[number,number]>=[];let at=text.indexOf(link.result.quote);while(at>=0){out.push([at,at+link.result.quote.length]);at=text.indexOf(link.result.quote,at+1);}return out;});
 let at=text.indexOf(quote),separate=false;
 while(at>=0){if(resultRanges.every(([start,end])=>at+quote.length<=start||at>=end))separate=true;at=text.indexOf(quote,at+1);}
 if(!separate||field==='payoff'&&!resultRanges.length)return [row.ref+'不能把计划结果断言或其片段当作行动或必要条件'];
 return [];
}
/** A reviewer must cite facts for a changed external decision, not invent them in its reason. */
export function premiseDecisionEvidenceIssues(check:any,candidate:Record<string,any>,ref:string,resultQuote?:string):string[]{
 if(!check||!['supported','gap','unknown','not_required'].includes(check.status)||typeof check.reason!=='string'||check.reason.trim().length<8)return [ref+'缺少决定者与决定依据的独立核对'];
 if(check.status!=='supported')return [];
 // A later result is not a prerequisite of an earlier decision. The former
 // filter removed only THIS result and let the model cite a future win or
 // reward as the already-established basis for an earlier approval.
 // Earlier completed results may remain as facts; source review must still
 // independently judge whether they can actually support this decision.
 const plan=Array.isArray(candidate.causalPlan)?candidate.causalPlan:[];
 const indexMatch=/causalPlan\\[(\\d+)\\]$/.exec(ref);
 const currentIndex=indexMatch?Number(indexMatch[1]):0;
 const unavailableResults=plan.slice(currentIndex).flatMap((link:any)=>
  typeof link?.result?.quote==='string'?[link.result.quote]:[]);
 if(typeof resultQuote==='string')unavailableResults.push(resultQuote);
 const text=PREMISE_CAUSAL_NARRATIVE_FIELDS.map(field=>{
  let value=String(candidate[field]||'');
  for(const result of unavailableResults)value=value.split(result).join('');
  return value;
 });
 return ['deciderQuote','basisQuote'].flatMap(key=>typeof check[key]==='string'&&check[key].trim().length>=4&&text.some(value=>value.includes(check[key]))?[]:[ref+'的'+key+'须引用本题材已建立的决定者或改变决定依据，不能使用结果断言或评审新造条件']);
}
export function premisePayoffCatalog(selection:PremiseSelectionResult){
  return selection.selected.map((item,index)=>({ref:'S'+(index+1)+'.payoff',premiseId:String(item.premiseId)}));
}
/**
 * Audit focus only: an independently claimed outcome can be omitted from
 * causalPlan.result even when the plan has a correctly anchored payoff link.
 * Surface that existing sentence in the SAME review call. This is not a
 * keyword-based quality verdict or a new model Gate; reviewers must still
 * determine whether the outcome is material and causally established.
 */
export function premiseUnmappedOutcomeClaims(selection:PremiseSelectionResult){
  return selection.selected.flatMap((item,index)=>{
    const results=(Array.isArray(item.causalPlan)?item.causalPlan:[])
      .map((link:any)=>typeof link?.result?.quote==='string'?link.result.quote.trim():'')
      .filter(Boolean);
    return (['reversalEffect','payoff'] as const).flatMap(field=>{
      const narrative=String(item[field]||'');
      // A verbatim payoff alias of reversalEffect is one already-existing
      // claim inventory, not a second event to review. Avoid asking the SAME
      // independent source Gate to inspect identical claims twice. All other
      // outcome fields, causal links and semantic checks remain unchanged.
      if(field==='payoff'&&narrative===String(item.reversalEffect||''))return [];
      return narrative.split(/[；。！？\n]+/u).flatMap(sentence=>{
        const text=sentence.trim();
        if(!text)return [];
        // A citation to ONE result clause does not establish the other
        // outcomes in the same sentence. Remove exactly the cited spans,
        // leaving the rest for the existing independent payoff review.
        if(results.some(quote=>quote.includes(text)))return [];
        let uncovered=text;
        for(const quote of results){
          if(uncovered.includes(quote))uncovered=uncovered.replace(quote,'');
        }
        const claim=uncovered.replace(/^[，、,：:\s]+|[，、,：:\s]+$/gu,'').trim();
        return claim.length>=6?[{ref:`S${index+1}.${field}`,claim:claim.slice(0,160)}]:[];
      });
    });
  });
}
/** One model-facing link schema, including every field required by admission. */
const premisePayoffLinkExample=(ref:string)=>({ref,status:'supported|gap|unknown',
 decisionCheck:{status:'supported|gap|unknown|not_required',
  deciderQuote:'supported时逐字引用本题材实际决定者；其它状态可省略',
  basisQuote:'supported时逐字引用实际采纳依据，不能引用结果断言；其它状态可省略',
  reason:'按既有事实说明是否依赖他人改变决定及其成立依据，至少8字'},
 reason:'逐项说明该环节的行动和必要条件是否足以导致结果，至少8字'});
export function premisePayoffReviewDirective(selection:PremiseSelectionResult){
  return '\n整体及本环节status均为supported时，links项必须返回decisionCheck:{status:"supported|gap|unknown|not_required",deciderQuote:"实际有权决定者的既有原文，supported必填",basisQuote:"已存在、能够真实支撑本次决定的动机或约束原文，supported必填",reason:"按已注入候选条件判据核对，不在评审理由中新增事实"}。not_required说明该结果为何是普通直接后果、不依赖他人改变决定；gap或unknown不能配link.status=supported。deciderQuote/basisQuote必须来自同题材实际字段中独立于结果的原文。已判gap或unknown的阻断项保留原结论，不为补齐决定依据字段增加调用。\n按已注入GEN-002的缺口路由合同，每个status=gap项必须明确返回gapRepair=restore_source_conditions|replace_from_pool；只有status=gap时才可出现gapRepair。status=supported或unknown必须完全省略gapRepair与sourceConditionQuote字段（不要返回null或空串）；不能因为问题讨论过缺口就让已判supported的项附带修复指令。缺省不是自动要求换题。若原池storyCore和入选展开已经写出后来实际发生的物证核验、权限、传递及决定，仅causalPlan把终局错误地绑定到较早环节，则返回restore_source_conditions，并用sourceConditionQuote逐字引用原池已存在的关键事件或条件：优先保留同ID原题材，局部纠正因果引用，经过独立来源/兑现/同构复核后方能通过。restore_source_conditions必须加sourceConditionQuote，逐字引用同ID原池已建立的相关关键条件；若原池确实缺少决定性条件或找不到原始引用，则返回replace_from_pool，不得通过改引用伪造条件。\n按已注入GEN-002的兑现必要条件合同独立检查，不把结局声称当成立条件。\n【必返payoffChecks目录】'+JSON.stringify(premisePayoffCatalog(selection))
    +'\n【逐环节因果计划目录；行动与条件原文见待锁定胚子的causalPlan，不重复发送】'+JSON.stringify(selection.selected.flatMap((item,index)=>premiseCausalCatalog(item,`S${index+1}.`).map(({ref})=>({ref}))))
    +'\n先核对每个causalPlan环节：action只能直接改变什么、conditions是否实际建立并足以导致result。涉及机构登记、处罚、公开决定或限制他人现有权益时，还要核对发起者当下具有的实际权利或权限、有权机构的受理及生效动作；仅有未来可能获得的资格、提出申请或当事人意愿，不能当作已完成的决定或对抗他人的有效限制。另须核对reversalEffect中每项已经发生的关键反转结果，不能只审payoff段的结局和代价。对每个题材返回reversalCheck={status,actionEvidenceRef,reason}：supported引用本题材此前实际行动或升级；优先引用本题材openingEvent、activeChoice或escalation里真实发生、能够支撑反转的在先行动。若必须引用reversalEffect中的独立操作，只有causalPlan已分别逐字锚定本段独立行动及本段结果时才可直接复用action；否则必须另返actionEvidenceQuote逐字定位与结果断言不重叠的真实操作。只给S序号.reversalEffect字段名却没有独立操作的逐字锚点属于证据协议不完整，不能判supported；说明所有决定性反转结果的必要条件如何真实成立；gap须将本项整体status标为gap并按同一gapRepair处理，unknown令整体unknown。causalPlan把反转里的结果误填作action时，该结果不构成自身成立的证据。逐个核对结局声称改变的对象、数量和时间跨度是否落在前述行动实际影响的范围内；每项决定性结果必须由已经写出的行动、真实必要条件和人物动机支持。对手已明示的反制、现有权利约束及直接阻碍须有实际克服路径；但不得凭故事外任意假设、未出现的拒绝可能或无关行政程序否决普通直接结果。若确实缺少决定性条件，整体或对应links必须判gap；原池确实漏条件时replace_from_pool，仅原池已有条件、causalPlan错引时restore_source_conditions。昨天入库与今天报失并不天然矛盾，发现故障并不表示备件已修复装机，挪位协议不等于经营许可或主管机关已撤销资格。暂停受理、中止办理、进入调查等程序状态不能直接推出最终撤销、继承计划永久落空、处罚生效或款项已经退还；必须检查作出最终决定的主体、依据、期限与执行。对手已有警觉、拒绝或逃避的动机时，不能把请求开门、交付材料、改口配合视为必然成功；核对当时在场者实际掌握什么信息、为什么会行动，是否已有使其无法拒绝或合理误判的条件。过去的投诉录音、旧账与历史档案只能证明其中真实记载的事件，不能被当作以后另一份雇佣约定、当事人自认或授权的证据。影响起始时间晚于声称的追溯期，或中止某机制却声称既有损失已恢复时，须指出缺少的历史来源、核算、决定或执行条件，不能替故事补出未写的补救行动。这只是必要因果核查，不要求所有故事出现账目或手续。每个payoffChecks新增links数组，逐一返回本题材目录的全部环节，字段形状以末尾完整JSON示例为准，不得漏项、重复、跨题材或靠一条总体认可代替。conditions为空不自动通过，遇到实际必要条件未写仍须gap；原池与展开一起漏写的条件同样为gap。计划遗漏的关键中间结果也须在本题材整体payoffChecks中报告gap，不能仅核对作者自行列出的环节。若关键照片、录音、原始母带、样本、账本等证据受公司、对手或他人保管控制，而结局要求主角提交给警方、机构或有决定权者，必须分别核对产生证据、实际取得或获准复制、保全不被撤销、移交接收这几步在原池与展开中是否真实发生；能录到内容不等于取得受他人控制的原件，不能从录音间存在母带直接推定主角能带出或提交。证据只在主角或熟人手中时同样核对谁实际交付、谁接收、接收者知情且有权怎样处理；仅有报案或口头建议不等于证据进入处理流程。原池和展开都漏掉这道决定性桥接时整体应为gap，不可因终局已经写出就标supported。整体status须与links一致：任一unknown则unknown，其次任一gap则gap，其余才supported；发现计划外缺口可整体gap但保留links的真实结论。'
    +'\n【因果计划未逐字覆盖的已有结果句（仅定位，非新增质量门）】'+JSON.stringify(premiseUnmappedOutcomeClaims(selection))+'。这只是对原有反转/兑现字段的遗漏引用提醒，逐句判断其是否为决定性结果、是否由故事已写的实际行动及必要条件支持；若关键结果存在独立审批、证据保全、取得或归责缺口，整体必须gap；若是普通后果且因果完整，不因未单列计划就误判。不得只审causalPlan已有的result，更不得把结局当作成立条件。'
    +'\n【逐题材允许的行动和条件字段，包含本计划实际使用的字段】'+JSON.stringify(selection.selected.map((candidate,index)=>({ref:`S${index+1}.payoff`,actionFields:permittedEvidenceFields(candidate,'actionEvidenceRef'),conditionFields:permittedEvidenceFields(candidate,'conditionEvidenceRef')})))+'。每个编号须加本卡S序号前缀，不引用自评或读者问题。causalPlan是定位索引，不是证据的封闭白名单；先在本题材全部实际故事字段寻找必要条件，再判断gap。必要行动或条件写在payoff而未被计划选中时，另返actionEvidenceQuote或conditionEvidenceQuote，逐字引用不与计划result断言重叠的实际行动/独立条件；只引用结果或其片段仍拒绝，不为原文没有的条件补故事。'
    +'\npayoffChecks每个ref恰好一项，形状为{"ref":"S1.payoff","status":"supported|gap|unknown","reversalCheck":{"status":"supported|gap|unknown","actionEvidenceRef":"S1.activeChoice","reason":"核对反转中全部实际已声称结果的成立条件"},"actionEvidenceRef":"S1.activeChoice","conditionEvidenceRef":"S1.escalation","links":'+JSON.stringify(premiseCausalCatalog(selection.selected[0], 'S1.').map(({ref})=>premisePayoffLinkExample(ref)))+',"reason":"至少8字逐项说明决定性结果的必要条件如何取得或缺失"}。证据编号只选本题材实际展开字段名（S序号加字段名）；supported须有行动证据，额外必要条件须有conditionEvidenceRef；普通直接因果无需另造手续。gap与unknown可省略证据，不编造引用。不能用payoff中的结果断言或另一处相同断言自证；实际行动或独立条件恰在payoff段内时，须由causalPlan绑定其中不同于结果的真实原文，不能以字段名代替语义角色。'
    +'\n【缺口路由的真实JSON形状，只有status=gap才返回，仍然是拒绝结论】'+JSON.stringify({ref:'S1.payoff',status:'gap',gapRepair:'replace_from_pool',reversalCheck:{status:'gap',reason:'缺少已建立的必要行动或实际决定'},reason:'原池和展开缺少支撑最终结果的实际条件；必须从原池换选'})+'；如同ID原池已经有全部遗漏条件，改用gapRepair=restore_source_conditions并附sourceConditionQuote为同ID storyCore逐字连续原文。无论哪一种gap均不通过，不能因自动补路由声明已补齐因果。';
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
    if(row.status==='gap'&&!['restore_source_conditions','replace_from_pool'].includes(row.gapRepair))errors.push(row.ref+'缺少可执行的真实缺口路由gapRepair；不得默认把仅有索引问题的成熟题材强制换选');
    if(row.status!=='gap'&&row.gapRepair!==undefined)errors.push(row.ref+'非gap项不得无故要求补救');
    if(row.gapRepair==='restore_source_conditions'){
      const source=selection.pool.find(seed=>seed.premiseId===item.premiseId);
      if(row.status!=='gap'||typeof row.sourceConditionQuote!=='string'||row.sourceConditionQuote.trim().length<8
        ||!String(source?.storyCore||'').includes(row.sourceConditionQuote))
        errors.push(row.ref+'恢复展开条件须逐字引用同ID原池已有的全部缺失条件，不得补造来源');
    }
    if(typeof candidate.reversalEffect==='string'&&candidate.reversalEffect.trim()){
      const reversal=row.reversalCheck;
      if(!reversal||!['supported','gap','unknown'].includes(reversal.status)
        ||typeof reversal.reason!=='string'||reversal.reason.trim().length<8)
        errors.push(row.ref+'必须单独审核反转阶段全部已声称结果');
      else {
        if(reversal.status==='unknown'&&row.status!=='unknown')
          errors.push(row.ref+'不能把未知的反转结果判为已评估');
        if(reversal.status==='gap'&&row.status==='supported')
          errors.push(row.ref+'反转存在因果缺口时整体不得通过');
        if(reversal.status==='supported'){
          const prefix=row.ref.slice(0,row.ref.indexOf('.')+1);
          const field=typeof reversal.actionEvidenceRef==='string'&&reversal.actionEvidenceRef.startsWith(prefix)
            ?reversal.actionEvidenceRef.slice(prefix.length):'';
          if(!['openingEvent','activeChoice','escalation','reversalEffect'].includes(field)
            ||typeof candidate[field]!=='string'||candidate[field].trim().length<8)
            errors.push(row.ref+'反转成立必须引用本题材实际行动，不能用反转结果自证');
          else if(field==='reversalEffect'){
            // A reviewed causalPlan already contains the exact field-local action
            // quotation. Do not demand the same citation a second time in the
            // payoff verdict: that redundant field made one valid model response
            // abort all independent source batches. Never synthesize story text.
            const supplied=reversal.actionEvidenceQuote;
            const planActions=Array.isArray(candidate.causalPlan)
              ?candidate.causalPlan.filter((link:any)=>link?.action?.field==='reversalEffect')
                .map((link:any)=>link.action.quote).filter((quote:unknown):quote is string=>typeof quote==='string')
              :[];
            // A plan action in the reversal field may itself be the claimed
            // reversal (e.g. the suspect was caught). Reuse it only when that
            // same source text ALSO has a separately anchored result to check
            // against, including exact reversalEffect/payoff projections.
            // Otherwise the review must cite an earlier actual action or an
            // explicitly located independent operation, never infer separation.
            const hasReversalResult=Array.isArray(candidate.causalPlan)
              &&candidate.causalPlan.some((link:any)=>PREMISE_CAUSAL_NARRATIVE_FIELDS.includes(link?.result?.field)
                &&candidate[link.result.field]===candidate.reversalEffect);
            const quotes=supplied===undefined?(hasReversalResult?planActions:[]):[supplied];
            const valid=quotes.some((quote:string)=>quote.trim().length>=8
              &&quote!==candidate.reversalEffect
              &&String(candidate.reversalEffect).includes(quote)
              &&unplannedPayoffEvidenceIssues({ref:row.ref,actionEvidenceQuote:quote},
                candidate,'actionEvidenceRef','reversalEffect').length===0);
            if(!valid)errors.push(row.ref+'反转证据必须有独立行动的逐字锚点（可复用本卡已核对causalPlan.action），不能用结果自证');
          }
        }
      }
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
          if(row.status==='supported'&&link?.status==='supported')errors.push(...premiseDecisionEvidenceIssues(link?.decisionCheck,candidate,String(link?.ref),(Array.isArray(candidate.causalPlan)?candidate.causalPlan:[])[Number(/causalPlan\[(\d+)\]$/.exec(String(link?.ref))?.[1])]?.result?.quote).map(error=>row.ref+'：'+error));
          if(link?.status==='supported'&&['gap','unknown'].includes(link?.decisionCheck?.status))errors.push(row.ref+'不能以该环节通过掩盖决定依据缺失');
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
/** A completed source review may fail to cite a usable reversal-stage action
 * for just one premise. Preserve the substantive review and mark THAT premise
 * unverified instead of treating its missing redundant coordinate as a failure
 * of all peer reviews. This never invents an action, edits story facts, or
 * upgrades an uncertain result; the standard materializer rejects unknown. */
export function quarantineUnprovenReversalEvidence(value:any,selection:PremiseSelectionResult):any{
 if(!Array.isArray(value?.payoffChecks))return value;
 const faults=premisePayoffReviewIssues(value,selection);
 const affected=new Set(value.payoffChecks.filter((row:PremisePayoffCheck)=>
   row&&typeof row.ref==='string'&&faults.some(error=>error.startsWith(row.ref+'反转证据必须有独立行动的逐字锚点'))).map((row:PremisePayoffCheck)=>row.ref));
 if(!affected.size)return value;
 return {...value,payoffChecks:value.payoffChecks.map((row:PremisePayoffCheck)=>
   !affected.has(row?.ref)?row:{...row,status:'unknown' as const,protocolIncomplete:true,
     reason:PREMISE_REVIEW_PROTOCOL_REASON+'：本题材反转行动的独立引用仍未确认：'+row.reason,
     reversalCheck:{...row.reversalCheck,status:'unknown' as const,
       reason:'已有反转行动证据不能与结果断言分离：'+(row.reversalCheck?.reason||row.reason)}})};
}
/** A missing routing token in a NEGATIVE payoff finding is a transport defect,
 * not an additional reason to spend a model call or discard its semantic verdict.
 * Conservatively replace unless an explicit source quote is truly in the
 * immutable same-ID pool. Never invent a condition or promote gap to supported. */
export function normalizePremisePayoffGapRoutes(value:any,selection:PremiseSelectionResult):any {
 if(!Array.isArray(value?.payoffChecks))return value;
 let changed=false;
 const rows=value.payoffChecks.map((row:any)=>{
   if(!row||row.status!=='gap'||row.gapRepair!==undefined)return row;
   const position=Number(/^S(\d+)\.payoff$/.exec(String(row.ref))?.[1])-1;
   const candidate=selection.selected[position],seed=selection.pool.find(item=>item.premiseId===candidate?.premiseId);
   if(!candidate||!seed)return row;
   const quote=row.sourceConditionQuote;
   if(quote!==undefined && (typeof quote!=='string'||quote.trim().length<8||!String(seed.storyCore||'').includes(quote)))
     return row; // Invalid citations stay blocked; never guess or fabricate them.
   changed=true;
   return {...row,gapRepair:quote===undefined?'replace_from_pool':'restore_source_conditions'};
 });
 return changed?{...value,payoffChecks:rows}:value;
}

export function materializePremisePayoffReview(value:any,selection:PremiseSelectionResult):PremiseSelectionReview['issues']{
  const errors=premisePayoffReviewIssues(value,selection);if(errors.length)throw Error(errors.join('；'));
  // Preserve unknown as a per-premise negative verdict: it is not approval,
  // and it cannot poison already verified peers in the same source batch.
  return value.payoffChecks.filter((row:PremisePayoffCheck)=>row.status!=='supported').map((row:PremisePayoffCheck)=>{
    const item=premisePayoffCatalog(selection).find(item=>item.ref===row.ref)!;
    return {kind:'selection_fit' as const,premiseId:item.premiseId,referencePremiseId:item.premiseId,
      ...(row.status==='unknown'||row.gapRepair!=='restore_source_conditions'?{repairMode:'replace_from_pool' as const}:{}),
      ...(row.protocolIncomplete ? {protocolIncomplete:true} : {}),
      quote:String(selection.selected.find(p=>p.premiseId===item.premiseId)![row.reversalCheck?.status==='gap'?'reversalEffect':'payoff']),
      referenceQuote:String(selection.pool.find(p=>p.premiseId===item.premiseId)!.storyCore),reason:[...(row.status==='unknown'?['兑现必要条件未确认，不得锁定']:[]),row.reason,...(row.reversalCheck?.status==='gap'?['反转阶段：'+row.reversalCheck.reason]:[]),...(row.links||[]).filter(link=>link.status==='gap').map(link=>link.ref+'：'+link.reason)].join('；')};
  });
}
