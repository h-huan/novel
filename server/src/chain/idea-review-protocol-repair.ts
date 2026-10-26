
import {readerGoalReviewIssues,READER_GOAL_LABELS} from './reader-goal-review';
import {targetIdeaReviews,presentationReviewIssues} from './idea-presentation-review';
import {ideaReviewEvidenceReferenceIssues,ideaPayoffBridgeIssues,resolveIdeaReviewEvidence,ideaReviewEvidenceCatalog,ideaReviewCitableNarrativeText} from './idea-review-evidence';

/** Reuse the existing single protocol correction, retaining every valid judgment. */
export function ideaReaderGoalRepairPlan(value:any,cards:readonly any[],references:readonly any[]=[]){
 const base=targetIdeaReviews(value,cards,references);
 const resolved=resolveIdeaReviewEvidence(base,cards);
 if(!Array.isArray(resolved?.reviews))return null;
 const withoutGoals={reviews:resolved.reviews.map(({readerGoals,...rest}:any)=>rest)};
 if(presentationReviewIssues(withoutGoals,cards).length||ideaPayoffBridgeIssues(base,cards).length
  ||ideaReviewEvidenceReferenceIssues(base,cards).some(error=>!error.includes('readerGoals.')))return null;
 const refIssues=ideaReviewEvidenceReferenceIssues(base,cards);
 const targets:{position:number;key:string;previous:any}[]=resolved.reviews.flatMap((row:any)=>{
  const errors=readerGoalReviewIssues(row.readerGoals,ideaReviewCitableNarrativeText(cards[row.position-1]));
  return Object.keys(READER_GOAL_LABELS).filter(key=>
    errors.some(error=>error.startsWith(key+'（'))
    // An unknown goal with a broken evidenceRef materializes to quote='', so
    // the quote validator alone cannot notice its invalid server reference.
    || refIssues.some(error=>error.startsWith('第'+row.position+'张题材审查：readerGoals.'+key+'.evidenceRef')))
   .map(key=>({position:row.position,key,previous:base.reviews.find((item:any)=>item.position===row.position)?.readerGoals?.[key]}));
 });
 if(!targets.length)return null;
 const positions=new Set(targets.map(target=>target.position));
 // A short citation-only patch is valid ONLY when the earlier verdict already
 // contains a legal status and reason. Otherwise the model must return its own
 // actual semantic judgment. A one-size-fits-all evidence-only JSON example
 // previously caused missing-status repairs to fail after nine minutes.
 const patchExample={goalPatches:targets.map(target=>{
  const before=target.previous;
  const validStatus=before&&['supported','weak','unknown'].includes(before.status);
  const validReason=typeof before?.reason==='string'&&before.reason.trim().length>=8;
  return {position:target.position,key:target.key,item:validStatus&&validReason
   ?{evidenceRef:'C'+target.position+'.description'}
   :{status:validStatus?before.status:'weak|unknown|supported（按本卡真实证据独立选择）',
     evidenceRef:'C'+target.position+'.description',
     reason:validReason?before.reason:'根据本卡真实事件写至少8字的具体支持或薄弱理由'}};
 })};
 return {base,targets,prompt:'只补正点名的readerGoals协议项，不重新审整批，不改故事或其它判断。'
  +'原有效status、reason必须原样保留；缺失状态须按实际故事判断，不能从错误字段名推定通过。'
  +'已经具有合法status及至少8字reason的项，只补正evidenceRef；status和reason由服务器保留，无须重抄。若原status=unknown且确无可引用事件，应省略evidenceRef键（不是写空字符串），服务器会回填空quote；原status=supported或weak而真实故事无可支持的编号时不能伪造，保持协议阻断。缺失或不合法的status/reason才返回完整真实status及reason；绝不可升级原弱项或改写原理由。'
  +'\n【待补正固定位置】'+JSON.stringify(targets)
  +'\n【这些卡的完整故事证据目录】'+JSON.stringify(ideaReviewEvidenceCatalog(cards).filter(row=>positions.has(row.position)))
  +'\n【本次各位置的确切补正JSON形状（按实际字段缺失情况分别生成）】'+JSON.stringify(patchExample)
  +'\n上方status中的竖线表示候选值，实际返回只能是supported、weak、unknown之一，不得原样返回竖线或括号说明。对缺失status的项，必须按本卡证据独立返回一个真实状态；对原status及reason均有效的项，item只能补evidenceRef，不得改动原结论。示例evidenceRef不是自动成立的结论，必须以真实本卡证据目录支持原判断才使用；真实unknown且无本卡支持事件时省略evidenceRef键，不得写空串；原supported/weak没有证据则保留阻断，不能暗中降低。不能引用uniquePoint、noveltyProof等自述卖点字段。每个点名项恰好一条，其它项不返回。'};
}
export function applyIdeaReaderGoalRepair(plan:NonNullable<ReturnType<typeof ideaReaderGoalRepairPlan>>,value:any){
 const patches=value?.goalPatches;
 if(!Array.isArray(patches)||patches.length!==plan.targets.length)throw Error('阅读目标补正须恰好覆盖点名位置，不返回整批reviews');
 const seen=new Set<string>();const next=structuredClone(plan.base);
 for(const patch of patches){
  const target=plan.targets.find(row=>row.position===patch?.position&&row.key===patch?.key);
  const key=patch?.position+':'+patch?.key;
  if(!target||seen.has(key)||!patch.item||typeof patch.item!=='object'||Array.isArray(patch.item))throw Error('阅读目标补正位置未知、重复或缺少item');
  seen.add(key);
  const before=target.previous;
  if(before&&['supported','weak','unknown'].includes(before.status)
    &&patch.item.status!==undefined&&patch.item.status!==before.status)
   throw Error('协议补正不能改变原有效阅读目标状态');
  if(typeof before?.reason==='string'&&before.reason.trim().length>=8
    &&patch.item.reason!==undefined&&patch.item.reason!==before.reason)
   throw Error('协议补正不能改写原有效阅读目标理由');
  const statusValid=before&&['supported','weak','unknown'].includes(before.status);
  const reasonValid=typeof before?.reason==='string'&&before.reason.trim().length>=8;
  // Pure citation correction must never ask the model to retranscribe existing
  // judgments. Their statuses/reasons stay byte-for-byte identical; the normal
  // full report validator still proves the selected ref belongs to this card.
  const revisedItem=statusValid&&reasonValid
    ?{...before,evidenceRef:patch.item.evidenceRef}
    :{...before,...patch.item};
  // An unknown judgment with no supporting source uses the existing
  // unreferenced/empty-quote protocol. Clearing a stale, model-authored
  // quotation is citation materialization, not a change to its verdict.
  if(revisedItem.status==='unknown' && (revisedItem.evidenceRef===undefined
      || revisedItem.evidenceRef===null || revisedItem.evidenceRef==='')){
    delete revisedItem.evidenceRef;
    revisedItem.quote='';
  }
  if(!statusValid&&!['supported','weak','unknown'].includes(revisedItem.status))
   throw Error('缺失的阅读目标状态未补齐');
  if(!reasonValid&&(typeof revisedItem.reason!=='string'||revisedItem.reason.trim().length<8))
   throw Error('缺失的阅读目标理由未补齐');
  next.reviews.find((row:any)=>row.position===target.position).readerGoals={
   ...next.reviews.find((row:any)=>row.position===target.position).readerGoals,[target.key]:revisedItem};
 }
 return next;
}


/** Recover a response that omitted review rows, without judging or rewriting any
 * already completed row. Only complete, independently verifiable rows are kept.
 * The existing one protocol retry must review every missing card in full. */
export function ideaMissingPresentationRowsPlan(value:any,cards:readonly any[],references:readonly any[]=[]){
 let original:any;
 try{original=targetIdeaReviews(value,cards,references);}catch{return null;}
 if(!Array.isArray(original?.reviews)||!original.reviews.length)return null;
 // A malformed verdict is NOT a content rejection. Retain only independently
 // valid positions; leave missing, invalid or duplicated positions unreviewed.
 const counts=new Map<number,number>();
 for(const row of original.reviews){
  if(Number.isInteger(row?.position))counts.set(row.position,(counts.get(row.position)||0)+1);
 }
 const verified:any[]=[];
 for(const row of original.reviews){
  const position=row?.position;
  if(!Number.isInteger(position)||position<1||position>cards.length
    ||counts.get(position)!==1||row.title!==cards[position-1]?.title)continue;
  if(ideaReviewEvidenceReferenceIssues({reviews:[row]},cards).length
    ||ideaPayoffBridgeIssues({reviews:[row]},cards).length)continue;
  const rebase=(item:any):any=>Array.isArray(item)?item.map(rebase)
    :item&&typeof item==='object'?Object.fromEntries(Object.entries(item).map(([key,entry])=>[key,rebase(entry)]))
    :typeof item==='string'?item.replace(new RegExp('^C'+position+'\\.'),'C1.'):item;
  const single={...rebase(row),position:1};
  try{
   const resolved=resolveIdeaReviewEvidence({reviews:[single]},[cards[position-1]]);
   if(presentationReviewIssues(resolved,[cards[position-1]],true).length
     ||ideaPayoffBridgeIssues({reviews:[single]},[cards[position-1]]).length)continue;
  }catch{continue;}
  verified.push(row);
 }
 if(!verified.length)return null;
 const seen=new Set(verified.map(row=>row.position));
 const missing=cards.map((_card,index)=>index+1).filter(position=>!seen.has(position));
 return missing.length?{base:{reviews:verified},missing}:null;
}

export function applyIdeaMissingPresentationRows(plan:NonNullable<ReturnType<typeof ideaMissingPresentationRowsPlan>>,
 value:any,cards:readonly any[],references:readonly any[]=[]){
 const patched=targetIdeaReviews(value,cards,references);
 if(!Array.isArray(patched?.reviews)||patched.reviews.length!==plan.missing.length)
  throw Error('补齐审查须完整覆盖缺失位置，不能重审已保留结论');
 const missing=new Set(plan.missing),seen=new Set<number>();
 for(const row of patched.reviews){
  if(!row||!missing.has(row.position)||seen.has(row.position)
    ||row.title!==cards[row.position-1]?.title)throw Error('补齐审查位置未知、重复或篡改原题材');
  seen.add(row.position);
 }
 return {reviews:[...plan.base.reviews,...patched.reviews].sort((a:any,b:any)=>a.position-b.position)};
}
