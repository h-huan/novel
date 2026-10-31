import { CROSS_STAGE_REVIEW_POLICY, SOURCE_QUALITY_POLICY } from '../../shared/src/system-workflow-rules.registry';
import { CHAPTER_RESPONSIBILITY_REPAIR_BOUNDARIES } from '../../shared/src/chapter-responsibility-review';
import { SOURCE_BOUNDARY_AUTHORITY_SCOPE_DIRECTIVE, SOURCE_BOUNDARY_OBSERVATION_SCOPE_DIRECTIVE, exclusiveClaimReviewMismatch, resolveSourceContextEvidence, sourceEvidenceCatalog } from '../modules/writing-quality/source-quality-review';

/** Confirmed stage outcomes remain obligations when a mechanism is replaced. */
export function crossStagePromiseCatalog(brief:string):Array<{ref:string;path:string;outcome:string}> {
  let value:any;try{value=JSON.parse(brief);}catch{return [];}
  const story=value.confirmedStory??value;
  return Array.isArray(story.scopeBreakdown)?story.scopeBreakdown.flatMap((stage:any,index:number)=>
    typeof stage?.outcome==='string'&&stage.outcome.trim()?[{ref:'P'+(index+1),path:`confirmedStory.scopeBreakdown[${index}].outcome`,outcome:stage.outcome}]:[]):[];
}
/** Diagnostics locate a failure; they never replace the confirmed obligation. */
export function crossStageRepairObligations(brief:string,findings:readonly string[],chapters:readonly any[]=[],fallbackTargetIds:readonly string[]=[]) {
  const refs=new Set(findings.flatMap(finding=>[...finding.matchAll(/【阶段兑现 (P[1-9]\d*)\b/g)].map(match=>match[1])));
  const affected=new Set<string>();
  for(const finding of findings){
    for(const chapter of chapters)if(typeof chapter.id==='string'&&finding.includes(chapter.id))affected.add(chapter.id);
    for(const match of finding.matchAll(/chapters\[(\d+)\]/g)){
      const row=chapters[Number(match[1])];if(row?.id)affected.add(row.id);
    }
  }
  // Source/causal failures carry entity ownership, not the promise-audit label.
  // Replacing their means must still preserve the outcome of those stages.
  // Book/volume ownership alone has no numbered stage. Resolve its linked
  // chapter targets too; an upper-plan failure must not skip outcome design.
  if(![...affected].some(id=>chapters.some(row=>row.id===id&&Number.isInteger(row.chapterIndex)&&row.chapterIndex>0)))
    for(const id of fallbackTargetIds)if(chapters.some(row=>row.id===id))affected.add(id);
  if(affected.size)for(const stage of crossStagePromiseReviewInputs(brief,[...chapters])){
    const rows=JSON.parse(stage.candidateText).chapters;
    if(rows.some((row:any)=>affected.has(row.id)))refs.add(stage.ref);
  }
  return crossStagePromiseCatalog(brief).filter(promise=>refs.has(promise.ref));
}
export function crossStageRepairPlanDirective(obligations:ReturnType<typeof crossStageRepairObligations>,mechanismText:string):string {
  if(!obligations.length)return '';
  return SOURCE_BOUNDARY_OBSERVATION_SCOPE_DIRECTIVE+SOURCE_BOUNDARY_AUTHORITY_SCOPE_DIRECTIVE
    +'\n【先完成路径设计，再生成位置修订】诊断是待解决的缺口，不是降低成果的指令；其中引用的嫌疑、未知或申请是失败状态，不能当替代目标。先按固定成果逆推需要取得什么、由谁按既有权限实际取得、如何交到行动者手里、何时完成，并逐个排除诊断指出的反例。普通取得和沟通可安排为未执行计划中的行动；不把尚未发生的行动误写成已发生历史。主体取得某类资料的权限不足时，使用已确认有权限的主体完成实际核验及结论交付，不能只提交申请、等待手续或声称已经查明。取得资料不等于得出排他结论；核验须覆盖承诺的同一对象、范围与确定程度。最小影响只在能够兑现成果的方案之间选择，不优先保留失败路径。方案应由事件推进，不能靠免责解释、枚举程序或加长旁白圆回。'
    +'\n先对照被指出的具体反例与原位置：原样保留的旧行动可支持未出错的成果，却不能说明待修缺口已经解决。feasible必须通过实际条件变化排除被指出的反例；仅声称规章禁止、未来会核查或缩小结果口径，都不构成排除。历史时段的记录不能直接证明另一时段，只有实际查证或行动安排覆盖相同时段时才可成立。无法补齐就返回blocked，不回送原文并宣称修复。'
    +'\n【本批路径必须完成的成果】'+JSON.stringify(obligations)
    +'\n【路径机制引用目录，原文见不可修改来源】'+JSON.stringify(sourceEvidenceCatalog(mechanismText).map(({id,path})=>({id,path})))
    + '\n在同一次回复的edits之前返回repairPlans，每项{ref:"实际P编号",status:"feasible|blocked",mechanismRefs:["实际S编号"],actions:[{anchorId:"实际E编号",evidence:"可选：逐字摘自本次实际edits.replacement的取得行动"}],remainingCounterexamples:["仍无法排除的真实缺口"]}。只有已经写进edits.replacement的新动作漏填anchorId时才返回该动作连续原文evidence；服务端只在唯一实际修订位置能够逐字核对时补齐缺失编号，不得凭设计文字猜编号或改变明确给出的编号。逐项覆盖上述成果。feasible必须有实际行动并且remainingCounterexamples为空，机制引用只用独立来源；actions只引用实际取得、核验或交付行动的位置编号，不抄写旧原文或另写证据句。服务端从该编号的replacement或未修改原文读取实际候选；位置引用不能自证行动成立，完整候选仍须独立核验实际取得与依赖。edits仅列实际改动，不复制无需修改的位置；未修改行动可支持保留的成果，但不能说明待修缺口已解决。blocked须说明缺口且不返回任何edits；无法形成方案就如实阻断，不拿降级文本充作有效输出。此设计只用于审查，不写入小说正文；后续独立验收仍决定是否通过。';
}
/** A model may quote an action from its actual edit but omit the E coordinate.
 * Bind only verbatim evidence with ONE matching edited location. Never invent
 * actions, rewrite a proposed edit, override an explicit coordinate, or judge
 * a promised result as delivered: the full candidate is independently reviewed. */
export function bindCrossStageRepairActionCoordinates(value:any):any {
 if(!Array.isArray(value?.edits)||!Array.isArray(value?.repairPlans))return value;
 for(const plan of value.repairPlans){
  if(!Array.isArray(plan?.actions))continue;
  for(const action of plan.actions){
   if(!action||typeof action!=='object'||Array.isArray(action)||action.anchorId!==undefined)continue;
   const evidence=action.evidence;
   if(typeof evidence!=='string'||evidence.trim().length<8)continue;
   const matches=value.edits.filter((edit:any)=>typeof edit?.anchorId==='string'
    && /^E[1-9]\d*$/.test(edit.anchorId)
    && typeof edit.replacement==='string'&&edit.replacement.includes(evidence));
   if(matches.length===1)action.anchorId=matches[0].anchorId;
  }
 }
 return value;
}
export function describeCrossStageRepairPlanValidation(value:any,obligations:ReturnType<typeof crossStageRepairObligations>,mechanismText:string,anchors:readonly {id:string;value:string}[]=[]):string[] {
  if(!obligations.length)return [];
  const plans=value?.repairPlans;
  if(!Array.isArray(plans)||plans.length!==obligations.length||new Set(plans.map((plan:any)=>plan?.ref)).size!==obligations.length
    ||plans.some((plan:any)=>!obligations.some(item=>item.ref===plan?.ref)))return ['repairPlans必须逐项覆盖本批固定成果'];
  const sources=new Set(sourceEvidenceCatalog(mechanismText).map(item=>item.id)),errors:string[]=[];
  for(const plan of plans){
    if(!['feasible','blocked'].includes(plan.status)||!Array.isArray(plan.remainingCounterexamples)
      ||plan.remainingCounterexamples.some((text:any)=>typeof text!=='string'||!text.trim())){errors.push(plan.ref+'缺少路径可行性与剩余反例');continue;}
    if(plan.status==='blocked'){
      if(!plan.remainingCounterexamples.length||(Array.isArray(value.edits)&&value.edits.length)||(Array.isArray(value.patches)&&value.patches.length))errors.push(plan.ref+'阻断方案须保留缺口且不能返回修改');
      continue;
    }
    if(plan.remainingCounterexamples.length)errors.push(plan.ref+'仍有未排除反例，不能声称可行');
    if(!Array.isArray(plan.mechanismRefs)||!plan.mechanismRefs.length||plan.mechanismRefs.some((ref:any)=>!sources.has(ref)))errors.push(plan.ref+'路径缺少独立机制来源编号');
    if(!Array.isArray(plan.actions)||!plan.actions.length||plan.actions.some((action:any)=>{
      const edit=value.edits?.find((item:any)=>item.anchorId===action?.anchorId);
      const candidateText=edit?edit.replacement:anchors.find(anchor=>anchor.id===action?.anchorId)?.value;
      // New proposals use position references. Legacy explicit quotes must
      // still match the actual candidate, never its overwritten source text.
      const evidence=action?.evidence===undefined?candidateText:action.evidence;
      return typeof evidence!=='string'||evidence.trim().length<8||typeof candidateText!=='string'||!candidateText.includes(evidence);
    }))errors.push(plan.ref+'取得路径没有落实到实际位置修订');
  }
  return errors;
}
/** A provisional causal design is not a patch or an accepted story fact. */
export function describeCrossStagePathDesign(value:any,obligations:ReturnType<typeof crossStageRepairObligations>,mechanismText:string,findings:readonly string[]):string[] {
  const plans=value?.plans;
  if(!Array.isArray(plans)||plans.length!==obligations.length||new Set(plans.map((p:any)=>p?.ref)).size!==obligations.length
    ||plans.some((p:any)=>!obligations.some(o=>o.ref===p?.ref)))return ['路径设计须覆盖本批固定成果'];
  if(value.edits!==undefined||value.patches!==undefined)return ['路径设计阶段不能返回位置补丁'];
  const sources=new Set(sourceEvidenceCatalog(mechanismText).map(s=>s.id));
  const errors:string[]=[];
  for(const plan of plans){
    if(!['feasible','blocked'].includes(plan.status)||!Array.isArray(plan.remainingCounterexamples)
      ||plan.remainingCounterexamples.some((s:any)=>typeof s!=='string'||!s.trim())){errors.push(plan.ref+'缺少可行性和剩余缺口');continue;}
    if(plan.status==='blocked'){if(!plan.remainingCounterexamples.length)errors.push(plan.ref+'阻断必须说明缺口');continue;}
    if(plan.remainingCounterexamples.length||!Array.isArray(plan.mechanismRefs)||!plan.mechanismRefs.length
      ||plan.mechanismRefs.some((s:any)=>!sources.has(s)))errors.push(plan.ref+'缺少有效来源或仍有反例');
    if(!Array.isArray(plan.actions)||!plan.actions.length||plan.actions.some((s:any)=>typeof s!=='string'||s.trim().length<12))errors.push(plan.ref+'缺少实际行动路径');
  }
  const checks=value?.counterexampleChecks;
  if(!plans.some((p:any)=>p.status==='blocked')&&(!Array.isArray(checks)||checks.length!==findings.length
    ||new Set(checks.map((c:any)=>c?.ref)).size!==findings.length||checks.some((c:any)=>!/^F[1-9]\d*$/.test(c?.ref)
      ||Number(c.ref.slice(1))>findings.length||typeof c?.conditionChange!=='string'||c.conditionChange.trim().length<12)))errors.push('须逐项说明诊断反例如何由实际条件变化排除');
  return errors;
}
export function crossStagePathReviewInput(brief:string,obligations:ReturnType<typeof crossStageRepairObligations>,mechanismText:string,design:any,findings:readonly string[]) {
  const value=JSON.parse(brief),story=value.confirmedStory??value;
  story.scopeBreakdown=story.scopeBreakdown.map((stage:any,index:number)=>obligations.some(item=>item.ref==='P'+(index+1))?stage:{chapters:stage.chapters});
  const reviewBrief=JSON.stringify(value),candidate=JSON.stringify({plans:design.plans});
  const prompt=`${SOURCE_QUALITY_POLICY}${CHAPTER_RESPONSIBILITY_REPAIR_BOUNDARIES}\n${crossStageRepairPlanDirective(obligations,mechanismText).split('【本批路径必须完成的成果】')[0]}
这是补丁生成前的路径复核，不评价文风，不输出补丁。不能因为JSON合法或方案自称feasible就通过。逐项核对同一主体、对象、范围、确定程度和到期阶段；原承诺不能缩小成记录范围或人物可见范围。核对动作使用的权限与器件性质是否由不可修改来源支持，未来计划不能授予新能力。
【固定故事】${reviewBrief}\n【不可修改来源】${mechanismText}\n【未接受的候选路径】${candidate}\n【原始反例】${JSON.stringify(findings)}
${crossStageReviewDirective()}${crossStagePromiseDirective(reviewBrief,candidate)}`;
  return {brief:reviewBrief,candidate,prompt};
}
export function bindCrossStagePromiseEvidence(value:any,candidateText:string):any {
  if(!Array.isArray(value?.promiseChecks))return value;
  const sources=sourceEvidenceCatalog(candidateText);
  return {...value,promiseChecks:value.promiseChecks.map((check:any)=>check?.candidateEvidenceRef===undefined?check:
    {...check,candidateEvidence:sources.find(source=>source.id===check.candidateEvidenceRef)?.text??''})};
}
/** A stage verdict depends on that stage, never on a later stage's success. */
export function crossStagePromiseReviewInputs(brief:string,rows:any[]) {
  let value:any;try{value=JSON.parse(brief);}catch{return [];}
  const story=value.confirmedStory??value,stages=story.scopeBreakdown;
  if(!Array.isArray(stages))return [];
  let next=1,knownRange=true;
  return stages.flatMap((stage:any,index:number)=>{
    const count=stage?.chapters;
    knownRange=knownRange&&Number.isInteger(count)&&count>0;
    const start=next,end=knownRange?next+count-1:undefined;
    if(end!==undefined)next=end+1;
    if(typeof stage?.outcome!=='string'||!stage.outcome.trim())return [];
    if(!knownRange)throw Error('固定阶段缺少有效章节分配，不能用全书或后章成果代替阶段验收');
    const stageRows=end===undefined?rows:rows.filter(row=>row.chapterIndex>=start&&row.chapterIndex<=end);
    const stageBrief=JSON.stringify({confirmedStory:{scopeBreakdown:stages.map((item:any,position:number)=>
      position===index?item:{chapters:item?.chapters})}});
    return [{ref:'P'+(index+1),brief:stageBrief,candidateText:JSON.stringify({chapters:stageRows})}];
  });
}
/** Evidence positions and repair ownership are both resolved by the server. */
export function crossStagePromiseFindings(value:any,candidateText:string,brief?:string):string[] {
  const bound=bindCrossStagePromiseEvidence(value,candidateText),sources=sourceEvidenceCatalog(candidateText);
  const promises=brief?crossStagePromiseCatalog(brief):[];
  let rows:any[]=[];try{rows=JSON.parse(candidateText).chapters||[];}catch{}
  return (bound?.promiseChecks||[]).flatMap((check:any)=>{
    const promise=promises.find(item=>item.ref===check.ref);
    const mismatch=check.status==='preserved'&&promise?exclusiveClaimReviewMismatch(promise.outcome,check.reason):null;
    if(check.status==='preserved'&&!mismatch)return [];
    const source=sources.find(item=>item.id===check.candidateEvidenceRef);
    const index=source?.path.match(/^chapters\.(\d+)\./)?.[1];
    const ids=index!==undefined?[rows[Number(index)]?.id]:rows.map(row=>row.id);
    return ['【阶段兑现 '+check.ref+' '+ids.filter(Boolean).join(' ')+'】'+(mismatch?mismatch+' | 评审依据: ':'')+check.reason+' | 正文: '+(check.candidateEvidence||'该阶段未提供兑现来源')];
  });
}
export function crossStagePromiseDirective(brief:string,candidateText?:string):string {
  const catalog=crossStagePromiseCatalog(brief);if(!catalog.length)return '';
  return '\n【不得因修订而降级的固定阶段兑现清单】'+JSON.stringify(catalog)
    +(candidateText?'\n【候选实际原文位置编号，文本见本轮完整资料】'+JSON.stringify(sourceEvidenceCatalog(candidateText).map(({id,path})=>({id,path}))):'')
    +'\npromiseChecks逐个P编号恰好返回一条{ref,status:"preserved|weakened|missing|unknown",candidateEvidenceRef:"实际S编号",reason:"具体比较阶段前后局面、人物所得与代价"}。candidateEvidence由服务器按实际编号绑定，不抄写、不概括或拼接原文；没有来源时missing或unknown可省略编号。允许合法等效手段，不能把已承诺的确定成果降成嫌疑、申请、将来可能或仅有希望来消除机制缺口。缺必要条件则修订上游取得路径，不能删掉兑现。非preserved为阻断；不能因consistent=true或warnings而略过任一阶段。';
}
export function stagePromiseReviewPrompt(brief:string,candidateText:string):string {
  return CROSS_STAGE_REVIEW_POLICY+'\n只核对固定阶段兑现，不做整体一致性判断，不评文风，不改故事。逐项比较本阶段实际行动、所得与代价；全书目标或后章未来安排不能代替本阶段兑现，确定成果不能解释成仅在人物可见范围内的猜测来宣称保留。'
    +'\n每项先做反事实核对：即使引用的候选行动全部成立，基准所承诺的结果是否仍可能不成立？若仍可能，不能判preserved。比较同一主体、对象、范围、确定程度和到期阶段，不通过重释基准来缩小承诺。例如“找到一个可行出口”不能兑现“排除其它出口后找到唯一出口”；“有线索指向某一方”不能兑现“查明指定责任人的行为”。这些是判别示例，不是要添加进故事的事实。reason须写明排除了什么反例，或什么反例仍未排除；不能只复述候选或称“成果齐备”。'
    +crossStagePromiseDirective(brief,candidateText)+'\n【实际阶段章纲】'+candidateText
    +'\n只返回JSON:{"checks":[{"ref":"实际P编号","status":"preserved|weakened|missing|unknown","candidateEvidenceRef":"实际S编号","reason":"对应成果、实际行动与缺口"}]}，不返回整体consistent、contradictions或warnings。';
}
export function describeStagePromiseReviewValidation(value:any,brief:string,candidateText:string):string[] {
  return describeCrossStageReviewValidation({consistent:Array.isArray(value?.checks)&&value.checks.every((row:any)=>row?.status==='preserved'),contradictions:[],unrelatedInventions:[],promiseChecks:value?.checks},brief,candidateText);
}

/** One review contract for both the live bundle and uncommitted repair candidates. */
export function crossStageReviewDirective(includePolicy = true): string {
  return `${includePolicy ? CROSS_STAGE_REVIEW_POLICY : "按已注入QLT-003跨模块判据执行。"}\n只输出JSON:{"consistent":true,"contradictions":[],"unrelatedInventions":[],"warnings":[]}，有固定阶段清单时另含promiseChecks。contradictions和unrelatedInventions问题项可用非空字符串，或具有canonicalSource、conflictingSource、evidence、impact四个非空字符串字段的对象；warnings只用字符串。保留字段与原文，不返回整份资料的事实重述。`;
}
function validFinding(item:any):boolean {
  return typeof item==='string'?!!item.trim():!!item&&typeof item==='object'
    &&['canonicalSource','conflictingSource','evidence','impact'].every(key=>typeof item[key]==='string'&&!!item[key].trim());
}

export function describeCrossStageReviewValidation(value: any,brief?:string,candidateText?:string): string[] {
  if(candidateText)value=bindCrossStagePromiseEvidence(value,candidateText);
  const issues: string[] = [];
  if (!value || typeof value.consistent !== 'boolean') issues.push('consistent必须为布尔值');
  for (const field of ['contradictions', 'unrelatedInventions']) {
    if (!Array.isArray(value?.[field]) || value[field].some((item: unknown) => !validFinding(item))) {
      issues.push(`${field}必须为有完整来源、原文和影响的具体问题数组；没有问题时返回空数组`);
    }
  }
  if (value?.warnings !== undefined && (!Array.isArray(value.warnings)
    || value.warnings.some((item: unknown) => typeof item !== 'string' || !item.trim()))) {
    issues.push('warnings必须为非空字符串数组；没有建议时返回空数组');
  }
  const promises=brief?crossStagePromiseCatalog(brief):[];
  if(promises.length){
    const checks=value?.promiseChecks;
    if(!Array.isArray(checks)||checks.length!==promises.length||new Set(checks.map((item:any)=>item?.ref)).size!==promises.length
      ||checks.some((item:any)=>!promises.some(p=>p.ref===item?.ref)))issues.push('promiseChecks必须覆盖全部固定阶段兑现编号，不能漏项或重复');
    for(const promise of promises){
      const check=Array.isArray(checks)?checks.find((item:any)=>item?.ref===promise.ref):undefined;
      if(!check||!['preserved','weakened','missing','unknown'].includes(check.status)||typeof check.reason!=='string'||check.reason.trim().length<8){issues.push(promise.ref+'缺少明确阶段兑现比较');continue;}
      if(check.candidateEvidenceRef!==undefined&&(!candidateText||!sourceEvidenceCatalog(candidateText).some(source=>source.id===check.candidateEvidenceRef)))issues.push(promise.ref+'候选原文编号不存在');
      if(['preserved','weakened'].includes(check.status)&&(!candidateText||!resolveSourceContextEvidence(candidateText,check.candidateEvidence).verified))issues.push(promise.ref+'阶段兑现缺少候选实际原文，不接受基准自证');
    }
  }
  if (issues.length === 0) {
    const hasBlockingIssues = crossStageBlockingIssues(value).length > 0;
    if (value.consistent === hasBlockingIssues) {
      issues.push('审查结论自相矛盾：consistent必须且只能在contradictions和unrelatedInventions均为空、固定阶段兑现也全部保留时为true；资料冗余建议放warnings。请重新核对原始资料，不得仅清空真实冲突或仅改布尔值凑合通过。');
    }
  }
  return issues;
}

export function crossStageBlockingIssues(value: any): string[] {
  const findings=['contradictions','unrelatedInventions'].flatMap(field=>Array.isArray(value?.[field])?value[field].filter(validFinding):[]);
  return [...['contradictions', 'unrelatedInventions'].flatMap(field =>
    Array.isArray(value?.[field]) ? value[field].filter(validFinding).map((item:any)=>typeof item==='string'?item.trim():JSON.stringify(item)) : []),
    ...(Array.isArray(value?.promiseChecks)?value.promiseChecks.filter((item:any)=>item?.status!=='preserved'
      &&!findings.some((finding:any)=>typeof finding==='object'&&/^P[1-9]\d*$/.test(item.ref)
        &&finding.canonicalSource.includes(`scopeBreakdown[${Number(item.ref.slice(1))-1}].outcome`)))
      .map((item:any)=>`【阶段兑现 ${item.ref}】${item.reason} | 候选: ${item.candidateEvidence||'缺少兑现'}`):[])];
}

export function crossStageAdvisories(value: any): string[] {
  return Array.isArray(value?.warnings) ? value.warnings.map((item: string) => `跨模块资料建议：${item}`) : [];
}
