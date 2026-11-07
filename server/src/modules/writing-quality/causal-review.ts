import { resolveQualityEvidence } from './quality-issue';
import { STORY_CAUSAL_REVIEW_POLICY } from '../../../shared/src/system-workflow-rules.registry';

/** Keep every real source clause, its original address and all original text,
 * but don't retransmit the SAME text at the JSON field, sentence and clause
 * levels for the initial compact framework proof. A parent's literal text may
 * be omitted from the model transport only if its immediate children
 * concatenate back to exactly those bytes, in original order. The complete
 * source/address catalog remains unchanged for strict server validation.
 * An unsupported/partial segmentation retains the full parent text.
 */
export function compactCausalProofSourceCatalog<
 T extends {id:string;source:string;text:string;path?:string}
>(catalog:readonly T[]):Array<{id:string;source:string;path?:string;text?:string}> {
 const children=new Map<string,T[]>();
 for(const entry of catalog){
  const match=entry.id.match(/^(.*):(c\d+|s\d+)$/);
  if(!match)continue;
  const group=children.get(match[1])||[];
  group.push(entry);children.set(match[1],group);
 }
 return catalog.map(entry=>{
  if(entry.source==='body')return entry;
  const parts=children.get(entry.id);
  if(!parts||parts.length<2||parts.some(row=>row.source!==entry.source))return entry;
  const ordered=[...parts].sort((a,b)=>{
   const num=(id:string)=>Number(id.match(/:(?:c|s)(\d+)$/)?.[1]||0);
   return num(a.id)-num(b.id);
  });
  if(ordered.map(row=>row.text).join('')!==entry.text)return entry;
  return {id:entry.id,source:entry.source,...(entry.path?{path:entry.path}:{})};
 });
}

export function causalAuditRepairPrompt(audit: unknown, errors: string[], content: string, sources: Record<string, string>, includePolicy = true, stateContract = false, compactPlanningProof = false, requiredResultSubset?:readonly string[]) {
  const targets=causalAuditRepairTargets(audit,errors);
  // This is the SAME selectable catalog used by the citation resolver. For
  // structured outline JSON its addresses are body:v... and clause IDs,
  // not prose-only body:p... IDs. Never ask for an ID absent from the list.
  const visibleAnchors=causalEvidenceAnchorOptions(content,sources);
  const lockedMissingResults=targets.flatMap(index=>{
    const row=(audit as any)?.transitions?.[index];
    return typeof row?.resultAnchorId==='string'&&row?.actionAnchorId===undefined
      &&row?.status===undefined&&row?.actionEvidence===undefined
      &&row?.resultEvidence===undefined
      ?[{index,chapterNumber:row.chapterNumber,resultAnchorId:row.resultAnchorId,
         resultText:visibleAnchors.find(anchor=>anchor.id===row.resultAnchorId)?.text||''}]:[];
  });
  // Put the exact missing outcome first. Keep the unchanged full evidence
  // catalog available for finding genuine causes (including prior chapters
  // and project rules), without forcing the model to hunt for the missing ID.
  // A missing result owns an exact chapter, not the whole outline. In the
  // existing local correction call retain all evidence for each affected
  // chapter plus all world/planning sources; other chapters cannot supply
  // this result's own action. This cuts repeated long JSON catalogs without
  // removing any real candidate action or required bridge in its chapter.
  const chapterRows=(()=>{try{
    const parsed=JSON.parse(content);
    return Array.isArray(parsed)?parsed:[];
  }catch{return [] as any[];}})();
  const targetChapterIndices=new Set(lockedMissingResults.flatMap(row=>
    chapterRows.flatMap((chapter:any,index:number)=>Number(chapter?.chapterNumber)===Number(row.chapterNumber)?[index]:[])));
  const canFocus=lockedMissingResults.length===targets.length
    &&targetChapterIndices.size>0
    &&lockedMissingResults.every(row=>chapterRows.some((chapter:any)=>
      Number(chapter?.chapterNumber)===Number(row.chapterNumber)));
  const selectable=canFocus?visibleAnchors.filter(anchor=>anchor.source!=='body'
    ||(typeof anchor.path==='string'&&targetChapterIndices.has(Number(anchor.path.split('.')[0]))))
    :visibleAnchors;
  const focusedAnchors=lockedMissingResults.length
    ?[...selectable.filter(anchor=>lockedMissingResults.some(row=>row.resultAnchorId===anchor.id)),
      ...selectable.filter(anchor=>!lockedMissingResults.some(row=>row.resultAnchorId===anchor.id))]
    :selectable;
  // The initial outline call already carries the unabridged chapter JSON.
  // Do not retransmit its non-result prose in a second evidence list. The
  // original text is located by the SAME path and ID in that JSON. Keep
  // every required outcome's exact text (including punctuation-level IDs).
  // External world/planning text is retained losslessly across leaf clauses;
  // omit only parent-level duplicate text when the children exactly rebuild
  // it. Full evidence stays on the server for the unchanged literal validator.
  const requiredResultIds=compactPlanningProof&&chapterRows.length
    ?new Set(causalChapterEvidenceCatalog(chapterRows,visibleAnchors.filter(a=>a.source==='body'))
        .entries.flatMap(entry=>entry.resultAnchorIds).filter(id=>!requiredResultSubset||requiredResultSubset.includes(id)))
    :new Set<string>();
  const proofSourceCatalog=compactPlanningProof
    ?compactCausalProofSourceCatalog(focusedAnchors):focusedAnchors;
  const promptAnchors=compactPlanningProof
    ?proofSourceCatalog.map(anchor=>
      anchor.source==='body'&&!requiredResultIds.has(anchor.id)
        ?{id:anchor.id,source:anchor.source,...(anchor.path?{path:anchor.path}:{})}
        :anchor)
    :focusedAnchors;
  return {
    systemPrompt: (lockedMissingResults.length ? '对服务器已锁定编号但尚未审查的结果，首次独立核对其真实行动、前置状态及必要条件；严格保留缺口，不得仅修正编号或假设该结果已通过。' : targets.length ? '只修复因果审查的引用合同，' : stateContract ? '你是独立因果反证核查员。先从完整章纲提取行动前状态，再核对行动如何改变该状态，禁止从结果倒推条件已经具备。' : '独立审查行动与已声称结果是否成立，核对同一引文内的完整先后顺序、必要前提与对手原有能力；前提字段重复结果或结局目标不能充当实际机制证据。') + '保留真实缺口，不改正文、不改分数。只选择下方可选目录中真实存在的原文地址，系统提取原文，禁止重写引文；结构化章纲可能使用body:v及其分句编号，普通正文可能使用body:p编号，不能凭示例猜编号。supported必须填写有效的bridgeAnchorId，gap及planned允许为空。planned仅适用于原文明示的未来安排或线索埋设，不得用来豁免已声称兑现的实际结果。自己取出并保管物件的直接结果，可以选择实际交代其支配和保管状态的同一段作为桥接编号；不必虚构额外条件。散会收起资料、实际离场、当面提醒等直接发生的普通动作，只要content已写出相同执行者与动作，supported即可用其真正发生的行动地址作bridgeAnchorId；不得要求另一个人批准这些普通动作，更不能把指令、安排、计划升级成工资已发、人员已更换等独立生效结果。涉及他人决定、权限、传播或时间的结果，仍须证明对应条件，不能用结果本身证明。',
    prompt: `${includePolicy ? STORY_CAUSAL_REVIEW_POLICY : "按已注入QLT-003必要因果判据执行。"}\n原因果账目：${JSON.stringify(targets.length&&Array.isArray((audit as any)?.transitions)
      ?{status:(audit as any).status,reason:(audit as any).reason,
        retainedValidatedRows:(audit as any).transitions.length-targets.length,
        fixOnly:targets.map(index=>({index,...(audit as any).transitions[index]}))}
      :audit)}\n校验错误：${errors.join('；')}\n${lockedMissingResults.length?'【服务器锁定的漏审结果；不能改写或改编号，只补真实行动、条件和审核结论】'+JSON.stringify(lockedMissingResults)+'\\n':''}可选原文证据编号（唯一允许的地址全集）：${JSON.stringify(promptAnchors)}\n${targets.length ? `本次仅纠正编号${JSON.stringify(targets)}（从0开始），其它已验证行不能重审、增删或改结论。只返回JSON对象，顶层仅含repairs数组；每个元素包含index（点名的数字索引）、actionAnchorId与resultAnchorId（从上方实际目录复制地址）、bridgeAnchorId（supported必选实际地址，gap/planned可为空）、status（supported、gap或planned）及至少8字的reason。对上方服务器锁定的漏审结果，resultAnchorId可省略、由服务器回填；如提供必须逐字等于其锁定编号，不能换成已审结果或自行改章号。遗漏结果尚未经语义审核，必须真实反证必要条件，不能只修形式或默认supported。禁止输出模板占位编号。` : compactPlanningProof ? '只返回JSON对象，顶层仅含causalAudit对象；对象包含status="evaluated"、至少8字的reason和proofRows数组（不返回transitions）。proofRows每行恰好5项，按顺序为[resultOrdinal,actionAnchorId,bridgeAnchorId,status,reason]。resultOrdinal按服务器结果目录的章节顺序及每章resultAnchorIds顺序从1连续编号，恰好每号一条；结果和章号由服务器按唯一编号绑定，禁止重复、漏项、换号。这是完整因果审核的短传输格式，不是抽样或统一判定。每个actionAnchorId以及非空bridgeAnchorId须来自实际目录；supported必须填有效bridgeAnchorId，gap/planned可填空串。每行status=supported|gap|planned且reason至少8字说明本结果的实际成立条件或缺口；成立的直接结果通常用8—30字明确行动和必要条件，不复述整段章纲；真实gap须完整解释缺失条件，不限制必要长度。行数必须与本次服务器结果目录完全一致；不能借其它行的证明、不能省略真实反对证据。服务器把每行无损转换成完整transitions并逐项执行同一个验证器；漏一项仍会阻断。禁止模板编号、自造依据或整体通过代替逐项判断。' : '只返回JSON对象，顶层仅含causalAudit对象；对象包含status（evaluated或not_applicable）、至少8字的reason与transitions数组。每项transitions包含actionAnchorId、resultAnchorId、bridgeAnchorId、status、reason；每个编号必须从上方实际目录复制，supported的成立条件必须有真实bridgeAnchorId，gap/planned可为空。禁止输出模板占位编号。'}核对输入中全部实际决定处境的关键行动结果；不因项数截掉必要结果，也不为凑项数补普通动作。编号必须从上表逐字选择；不适用须有实际理由；无成立条件时保留gap，不能用计划、主角希望或旁白结论证明已发生的结果。`,
  };
}


/** Lossless TRANSPORT ONLY for large causal-ledger responses.
 * Every result still has its own real chapter, exact result/action/bridge
 * addresses, negative or positive status, and explanation. The normal
 * materialize/coverage/cross-field quality gates run on the expanded ledger.
 * Reject dual schemas, malformed tuples and missing evidence: this function
 * never supplies a verdict, quote or inferred fact.
 */
export function decodePlanningProofRows(
 value:any,
 // The server already owns both the chapter and every distinct result address.
 // The reviewer returns ONLY the independent action/condition/verdict for each
 // ordered result. Never let it rename, omit or duplicate an outcome by JSON.
 expectedRows:readonly {chapterNumber:number;resultAnchorId:string}[]=[],
):any {
 if(!value||typeof value!=='object'||!Object.prototype.hasOwnProperty.call(value,'proofRows'))return value;
 if(value.transitions!==undefined)throw new Error('因果审核不能混用精简结果账目与完整transitions');
 if(!Array.isArray(value.proofRows))throw new Error('精简因果审核缺少逐项proofRows数组');
 if(!expectedRows.length||new Set(expectedRows.map(row=>row.chapterNumber+':'+row.resultAnchorId)).size!==expectedRows.length
   ||expectedRows.some(row=>!Number.isSafeInteger(row.chapterNumber)||row.chapterNumber<1
     ||typeof row.resultAnchorId!=='string'||!row.resultAnchorId.trim()))
   throw new Error('精简因果审核缺少唯一的服务器结果目录');
 const {proofRows,...header}=value;
 const usedOrdinals=new Set<number>();
 if(proofRows.length!==expectedRows.length)
   throw new Error('精简因果审核结果数量与服务器目录不一致：应为'+expectedRows.length+'项，实际'+proofRows.length+'项');
 return {...header,transitions:proofRows.map((row:any,index:number)=>{
   if(!Array.isArray(row)||row.length!==5)
     throw new Error('精简因果审核第'+(index+1)+'项必须恰好包含结果序号、行动编号、桥接编号、状态与理由');
   const [rawOrdinal,rawAction,rawBridge,status,reason]=row;
   // A digit-string ordinal is an unambiguous transport spelling of an
   // already-owned result. Never accept leading zeros, decimals or extra rows.
   const ordinal=typeof rawOrdinal==='string'&&/^[1-9]\d*$/.test(rawOrdinal)
     ?Number(rawOrdinal):rawOrdinal;
   if(!Number.isSafeInteger(ordinal)||ordinal<1||ordinal>expectedRows.length||usedOrdinals.has(ordinal))
     throw new Error('精简因果审核第'+(index+1)+'项结果序号无效、重复或越界');
   usedOrdinals.add(ordinal);
   // null means no bridge for a genuine negative/planned verdict, exactly
   // like the documented empty string; it NEVER certifies a supported link.
   // All actual action/result/bridge IDs remain subject to the full source
   // and per-chapter coverage validators after decoding.
   const actionAnchorId=typeof rawAction==='string'?rawAction.trim():rawAction;
   const bridgeAnchorId=rawBridge===null&&['gap','planned'].includes(status)
     ?'':typeof rawBridge==='string'?rawBridge.trim():rawBridge;
   if(typeof actionAnchorId!=='string'||!actionAnchorId
      ||typeof bridgeAnchorId!=='string'
      ||!['supported','gap','planned'].includes(status)
      ||(status==='supported'&&!bridgeAnchorId)
      ||typeof reason!=='string'||reason.trim().length<8)
     throw new Error('精简因果审核第'+(index+1)+'项行动、成立条件、状态或实际解释缺失');
   return {...expectedRows[ordinal-1],actionAnchorId,bridgeAnchorId,status,reason};
 })};
}

/** Addresses only: keep punctuation and the complete source, including conditional context. */
function causalAssertionParts(text: string): string[] {
  const pairs: Record<string,string> = {'“':'”','‘':'’','「':'」','『':'』','（':'）','(':')','[':']'};
  const stack: string[] = [], parts: string[] = [];
  let start=0, attachedCondition=false;
  for(let index=0;index<text.length;index++){
    const char=text[index];
    if(char===stack.at(-1)){stack.pop();continue;}
    if(char==='"'){stack.push('"');continue;}
    if(pairs[char]){stack.push(pairs[char]);continue;}
    if(!stack.length && (char==='，'||char===',' && !(/\d/.test(text[index-1]||'')&&/\d/.test(text[index+1]||'')))){
      const left=text.slice(start,index).trimStart();
      const right=text.slice(index+1).trimStart();
      // A conditional antecedent is not an independent achieved outcome.
      // Join it to its consequence before subdividing any later results;
      // the original complete source and all other outcome addresses remain.
      // Introductory causal, concessive and purpose clauses are prerequisites,
      // not achieved outcomes. Keep their exact original characters attached
      // to the following consequence; independently asserted later outcomes
      // still receive distinct addresses and the unchanged semantic Gate.
      const unambiguousCondition=/^(?:如果|假如|倘若|只要|一旦|除非|若(?!干)|因为|由于|虽然|尽管|即使|即便|为了|当.{1,24}时|在.{1,24}(?:时|后))/.test(left);
      const onlyCondition=/^只有/.test(left) && /^(?:才|方|就|便|则|可以|可|会|将|应|必须|不能|不得)/.test(right);
      if(!attachedCondition && (unambiguousCondition||onlyCondition)){
        attachedCondition=true;continue;
      }
      parts.push(text.slice(start,index+1));start=index+1;attachedCondition=false;
    }
  }
  if(start<text.length)parts.push(text.slice(start));
  return parts;
}
function completeResultAnchors(anchors: ReturnType<typeof causalEvidenceAnchors>, parent: {id:string}) {
  const clauses=anchors.filter(anchor=>anchor.id.startsWith(parent.id+':c')&&!anchor.id.includes(':s'));
  return (clauses.length?clauses:anchors.filter(anchor=>anchor.id===parent.id)).flatMap(clause=>{
    const parts=anchors.filter(anchor=>anchor.id.startsWith(clause.id+':s'));
    return parts.length?parts:[clause];
  });
}


function expandCausalSourceAnchors(values: Array<{id:string;source:string;text:string;path?:string}>) {
  // Keep the old IDs stable, but offer exact clauses so one broad quotation
  // cannot stand in for several different outcome proofs.
  const clauses = values.flatMap(value => {
    const parts = value.text.match(/[^。！？；]+[。！？；]?/g)?.filter(text => text.replace(/[\s\\“”"‘’]/g, '').length) || [];
    return parts.length > 1 ? parts.map((text, index) => ({
      id: `${value.id}:c${index + 1}`, source:value.source, text, path: value.path,
    })) : [];
  });
  const clauseParents=new Set(clauses.map(clause=>clause.id.replace(/:c\d+$/,'')));
  const assertions=[...values.filter(value=>!clauseParents.has(value.id)),...clauses].flatMap(value=>{
    // Conditions need the same selectable granularity as result claims.
    // Otherwise an independent condition shares an indivisible address with
    // its consequence and the reviewer cannot correct a broad bridge.
    const parts=causalAssertionParts(value.text);
    return parts.length>1?parts.map((text,index)=>({id:value.id+':s'+(index+1),source:value.source,text,path:value.path})):[];
  });
  return [...clauses,...assertions];
}

export function causalEvidenceAnchors(content: string, sources: Record<string,string>): Array<{id:string;source:string;text:string;path?:string}> {
  return Object.entries({body:content,...sources}).flatMap(([source,text])=> {
    const raw = String(text || '');
    const paragraphs = raw.split(/\n\s*\n/).map((text,index)=>({id:`${source}:p${index+1}`,source,text:text.trim()})).filter(x=>x.text);
    if (!/^[\s]*[\[{]/.test(raw)) return [...paragraphs,...expandCausalSourceAnchors(paragraphs)];
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return [...paragraphs,...expandCausalSourceAnchors(paragraphs)]; }
    const paths: string[] = [];
    const collect = (value: unknown, fieldPath: string) => {
      if (typeof value === 'string') {
        if (JSON.stringify(value).slice(1, -1).trim()) paths.push(fieldPath);
      } else if (value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) collect(child, fieldPath ? `${fieldPath}.${key}` : key);
      }
    };
    collect(parsed, '');
    // Keep exact serialized string values as smaller addresses; never decode or rewrite quotations.
    const values = [...raw.matchAll(/"((?:[^"\\]|\\.)*)"/g)]
      .filter(match => !/^\s*:/.test(raw.slice(match.index! + match[0].length)) && match[1].trim())
      .map((match,index)=>({id:`${source}:v${index+1}`,source,text:match[1],path:paths[index]}));
    return [...paragraphs, ...values, ...expandCausalSourceAnchors(values)];
  });
}

/** Structured fields already cover the source; omit duplicate whole JSON paragraphs from model input. */
export function causalEvidenceAnchorOptions(content: string, sources: Record<string, string>) {
  const anchors = causalEvidenceAnchors(content, sources);
  const structuredSources = new Set(anchors.filter(anchor => /:v\d+$/.test(anchor.id)).map(anchor => anchor.source));
  return anchors.filter(anchor => !structuredSources.has(anchor.source) || !/:p\d+$/.test(anchor.id));
}

/** A frozen exit field owns its result inventory; the reviewer cannot choose a sample. */
export function causalExitResultAnchors(
 anchors: ReturnType<typeof causalEvidenceAnchors>, exitState: unknown, chapterIndex?: number,
) {
 if(typeof exitState!=='string')return [];
 const encoded=JSON.stringify(exitState).slice(1,-1);
 // For multi-chapter outlines identical exit text is NOT the same address.
 // The chapter's serialized path, not its words, establishes ownership.
 const parent=anchors.find(anchor=>anchor.source==='body'&&anchor.text===encoded
   &&(chapterIndex===undefined||anchor.path===chapterIndex+'.exitState'));
 return parent?completeResultAnchors(anchors,parent):[];
}

/** The server owns the complete result inventory, including scene outcomes and
 * payoff/state fields that can disagree with characterActions.result. */
export function causalChapterResultAnchors(anchors: ReturnType<typeof causalEvidenceAnchors>, chapterIndex: number) {
  const prefix = chapterIndex + '.';
  const resultPath = /^(?:scenes\.\d+\.outcome|characterActions\.\d+\.result|conflicts\.\d+\.resolution|highlights\.\d+\.point|characterStates\.\d+\.stateAfter|foreshadowingRecover\.\d+\.(?:method|payoff))$/;
  const parents = anchors.filter(anchor => anchor.source === 'body' && /:v\d+$/.test(anchor.id)
    && anchor.path?.startsWith(prefix) && resultPath.test(anchor.path.slice(prefix.length)));
  return parents.flatMap(parent => completeResultAnchors(anchors,parent));
}

/** Review identical result assertions once inside the SAME chapter, then
 * project the evidenced verdict to every exact source field. Unlike fuzzy
 * story similarity this cannot merge different wording, time, numbers or
 * negation. Preserve duplicate assertions within a single field: repeated
 * events in that field can have different timelines. Other factual
 * consistency checks still inspect every original field independently. */
export function causalChapterResultReviewGroups(
 anchors:ReturnType<typeof causalEvidenceAnchors>,chapterIndex:number,
):{review:ReturnType<typeof causalChapterResultAnchors>;aliasesByReview:Record<string,string[]>}{
 const all=causalChapterResultAnchors(anchors,chapterIndex);
 const review:typeof all=[],aliasesByReview:Record<string,string[]>={};
 const representativeByText=new Map<string,typeof all[number]>();
 for(const row of all){
  const prior=representativeByText.get(row.text);
  if(prior && prior.path!==row.path){
   (aliasesByReview[prior.id]??=[]).push(row.id);
  }else{
   review.push(row);
   if(!prior)representativeByText.set(row.text,row);
  }
 }
 return {review,aliasesByReview};
}


export interface CausalChapterEvidenceEntry {
 chapterNumber:number;anchorIds:string[];resultAnchorIds:string[];
}
/** One authoritative chapter index for provider prompts, literal binding and
 * server validation. Never infer ownership from identical text in another chapter. */
export function causalChapterEvidenceCatalog(
 chapters: readonly Record<string,unknown>[],
 anchors:ReturnType<typeof causalEvidenceAnchors>,
 resultField?:'exitState',
):{entries:CausalChapterEvidenceEntry[];aliasesByReview:Record<string,string[]>}{
 const aliasesByReview:Record<string,string[]>={};
 const entries=chapters.map((chapter,index)=>{
  const own=anchors.filter(a=>a.source==='body'&&a.path?.startsWith(index+'.'));
  const review=resultField
    ?{review:causalExitResultAnchors(anchors,chapter[resultField],index),
      aliasesByReview:{} as Record<string,string[]>}
    :causalChapterResultReviewGroups(anchors,index);
  Object.assign(aliasesByReview,review.aliasesByReview);
  return {chapterNumber:Number(chapter.chapterNumber),anchorIds:own.map(a=>a.id),
    resultAnchorIds:review.review.map(a=>a.id)};
 });
 return {entries,aliasesByReview};
}


/** Model-facing reference projection only: all original chapter actions and
 * outcome obligations remain in the shared evidence catalog and strict Gate.
 * A sibling action is a location hint, never proof of its claimed outcome. */
export function causalPlanningProofPromptCatalog(
 chapters:readonly Record<string,unknown>[],
 entries:readonly CausalChapterEvidenceEntry[],
 anchors:ReturnType<typeof causalEvidenceAnchors>,
) {
 if(entries.length!==chapters.length)throw new Error('章纲结果目录与章节数量不一致');
 const byId=new Map(anchors.map(a=>[a.id,a]));
 const fields=new Map(anchors.filter(a=>a.source==='body'&&/^body:v\d+$/.test(a.id)&&a.path)
   .map(a=>[a.path!,a.id]));
 return entries.map((entry,index)=>{
   const actionLookup:Array<{resultAnchorId:string;actionAnchorId:string}>=[];
   const reviewedResults=entry.resultAnchorIds.map(id=>byId.get(id)).filter(
     (row):row is NonNullable<typeof row>=>!!row&&row.source==='body'&&row.path?.startsWith(index+'.')===true);
   const actualResults=causalChapterResultAnchors(anchors,index);
   const actions=(chapters[index] as any)?.characterActions;
   if(Array.isArray(actions))for(let i=0;i<actions.length;i++){
     const path=index+'.characterActions.'+i;
     const actionId=fields.get(path+'.action');
     if(!actionId)continue;
     // The reviewer may own a scene outcome as the representative of an
     // IDENTICAL characterActions.result. The sibling action is still a
     // valid location hint for that result, even when the result's address
     // points at scenes rather than at this character action.
     for(const actualResult of actualResults.filter(row=>row.path===path+'.result'))
       for(const reviewedResult of reviewedResults)
         if(reviewedResult.text===actualResult.text
           &&!actionLookup.some(hint=>hint.resultAnchorId===reviewedResult.id&&hint.actionAnchorId===actionId))
           actionLookup.push({resultAnchorId:reviewedResult.id,actionAnchorId:actionId});
   }
   // The latest live review spent its bounded correction on dozens of
   // result-self citations despite the chapter already containing explicit
   // character actions. Surface only the existing same-chapter ACTION field
   // addresses, never a pre-decided causal link or a new story fact.
   const actionAnchorIds=Array.isArray(actions)?actions.map((_action:any,i:number)=>
     fields.get(index+'.characterActions.'+i+'.action')).filter((id):id is string=>typeof id==='string'):[];
   return {chapterNumber:entry.chapterNumber,bodyIndex:index,
     resultAnchorIds:[...entry.resultAnchorIds],actionAnchorIds,actionLookup};
 });
}

/** Partition a large planning proof by actual chapter-result workload,
 * not by an arbitrary chapter count. The original audit was allowed an
 * initial call and one correction. Two *single-pass* independent shards
 * use at most that same two-call envelope, while each reviewer still sees
 * full scenes, states, actions and every mandatory result in its chapters.
 *
 * Distinct result assertions are never dropped or merged to hit a quota.
 * A chapter remains indivisible: cross-field/cross-scene chronology is
 * required for its individual result proof.
 */
/** If chapter-complete splitting still leaves one overloaded audit, split the
 * SERVER-OWNED result inventory across the same two physical first-pass calls.
 * Both reviewers receive every original chapter and its complete prior state;
 * only result obligations are disjoint. No result or quality judgment is
 * sampled, inferred or dropped. Totals beyond twice the nominal per-call count
 * must not fall back to one oversized response: that previously exhausted the
 * review model's 32768-token output cap. Two independent first-pass calls still
 * fit the original initial-plus-correction allowance. */
export function causalPlanningProofResultPartitions(
 chapters:readonly Record<string,unknown>[],maxSinglePassResults=72,
):string[][] {
 if(!chapters.length)return [[]];
 const body=JSON.stringify(chapters);
 const anchors=causalEvidenceAnchorOptions(body,{});
 const ids=causalChapterEvidenceCatalog(chapters,anchors).entries.flatMap(entry=>entry.resultAnchorIds);
 if(ids.length<=maxSinglePassResults)return [ids];
 const midpoint=Math.ceil(ids.length/2);
 return [ids.slice(0,midpoint),ids.slice(midpoint)];
}
export function causalPlanningProofGroups(
 chapters:readonly Record<string,unknown>[],maxSinglePassResults=72,
):Record<string,unknown>[][]{
 if(chapters.length<2)return [[...chapters]];
 const burden=chapters.map(chapter=>{
   const body=JSON.stringify([chapter]);
   const anchors=causalEvidenceAnchorOptions(body,{});
   return causalChapterResultReviewGroups(anchors,0).review.length;
 });
 const total=burden.reduce((a,b)=>a+b,0);
 if(total<=maxSinglePassResults)return [[...chapters]];
 let cut=1, best=Number.POSITIVE_INFINITY;
 for(let i=1;i<chapters.length;i++){
   const left=burden.slice(0,i).reduce((a,b)=>a+b,0);
   const score=Math.max(left,total-left);
   if(score<best){best=score;cut=i;}
 }
 // Chapter-complete sharding must not leave one oversized first pass.
 // When a dominant chapter exceeds the per-call result threshold, the caller
 // next partitions exact SERVER-OWNED result IDs while supplying the same
 // complete chapter context to both existing proof calls. Do not partition a
 // chapter's source facts or drop a result just to fit the output envelope.
 if(best>maxSinglePassResults)return [[...chapters]];
 return [[...chapters.slice(0,cut)],[...chapters.slice(cut)]];
}

/** A single contract for every provider-facing causal address.
 * An absent ID may be recovered ONLY from one exact, server-owned quotation
 * in the same declared chapter (or uniquely in a permitted bridge source).
 * An explicit ID, even incorrect, is never rewritten. Duplicate text or
 * paraphrase never generates an inferred action, cause, or verdict. */
export function bindCausalReviewEvidenceAddresses(
 value:any,
 catalog:readonly CausalChapterEvidenceEntry[],
 anchors:ReturnType<typeof causalEvidenceAnchors>,
 resultField?:'exitState',
){
 if(!value||!Array.isArray(value.transitions))return value;
 const byId=new Map(anchors.map(anchor=>[anchor.id,anchor]));
 const unique=(ids:readonly string[],quote:unknown):string|undefined=>{
  if(typeof quote!=='string'||!quote.trim())return undefined;
  const matches=ids.filter(id=>byId.get(id)?.text===quote);
  return matches.length===1?matches[0]:undefined;
 };
 const bodyIds=anchors.filter(a=>a.source==='body').map(a=>a.id);
 return {...value,transitions:value.transitions.map((row:any)=>{
  if(!row||typeof row!=='object')return row;
  const next={...row};
  const chapter=Number.isInteger(row.chapterNumber)
    ?catalog.find(entry=>entry.chapterNumber===row.chapterNumber):undefined;
  if(chapter){
   for(const [key,quote,ids] of [
    ['actionAnchorId','actionEvidence',chapter.anchorIds],
    ['beforeStateAnchorId','beforeStateEvidence',chapter.anchorIds],
    ['resultAnchorId','resultEvidence',resultField
       ?chapter.resultAnchorIds:chapter.resultAnchorIds.length?chapter.resultAnchorIds:chapter.anchorIds],
   ] as const){
    if(next[key]!==undefined)continue;
    const bound=unique(ids,next[quote]);
    // Some valid optional results are in a chapter's direct event prose rather
    // than dedicated outcome fields; mandatory result inventory remains intact.
    const fallback=key==='resultAnchorId'&&!resultField&&!bound
      ?unique(chapter.anchorIds,next[quote]):undefined;
    if(bound||fallback)next[key]=bound||fallback;
   }
  }
  if(next.bridgeAnchorId===undefined&&next.status==='supported'
    &&typeof next.bridgeEvidence==='string'&&next.bridgeEvidence.trim().length>=8){
   const ids=next.basisSource===undefined?anchors.map(a=>a.id)
     :next.basisSource==='body'?bodyIds
       :anchors.filter(a=>a.source===next.basisSource).map(a=>a.id);
   const bound=unique(ids,next.bridgeEvidence);
   if(bound)next.bridgeAnchorId=bound;
  }
  return next;
 })};
}
/** Reject cross-chapter or unaddressed proof even if the same words are found
 * somewhere else in the complete JSON. Role checks share the exact catalog
 * used to instruct the reviewer; every negative quality verdict is retained. */
export function causalChapterEvidenceAddressIssues(
 value:any,catalog:readonly CausalChapterEvidenceEntry[],resultField?:'exitState',
):string[]{
 if(!Array.isArray(value?.transitions))return [];
 const duplicated=new Set<number>(),seen=new Set<number>();
 for(const chapter of catalog){
  if(seen.has(chapter.chapterNumber))duplicated.add(chapter.chapterNumber);
  seen.add(chapter.chapterNumber);
 }
 return value.transitions.flatMap((row:any,index:number)=>{
  const msg=(part:string)=>'第'+(index+1)+'项因果审查'+part;
  if(!row||!Number.isInteger(row.chapterNumber)
    ||duplicated.has(row.chapterNumber))return [msg('的章号不存在或不唯一')];
  const chapter=catalog.find(entry=>entry.chapterNumber===row.chapterNumber);
  if(!chapter)return [msg('的章号不存在于当前审查分组')];
  const errors:string[]=[];
  if(!chapter.anchorIds.includes(row.actionAnchorId))
    errors.push(msg('的行动编号未绑定本章原文'));
  if(!chapter.anchorIds.includes(row.resultAnchorId)
    ||(resultField&&!chapter.resultAnchorIds.includes(row.resultAnchorId)))
    errors.push(msg('的结果编号未绑定本章'+(resultField?'实际出口状态':'原文')));
  if(row.beforeStateAnchorId!==undefined&&!chapter.anchorIds.includes(row.beforeStateAnchorId))
    errors.push(msg('的行动前状态编号未绑定本章原文'));
  return errors;
 });
}

/** A reviewer can cite an exact duplicate field rather than the advertised
 * representative result ID, because both remain in the body action catalog.
 * Recover ONLY the identity of the already-reviewed identical claim in the
 * same chapter. Never invent a verdict or overwrite a separately reviewed
 * representative; differing texts and cross-chapter citations remain invalid.
 * This prevents one correct alias citation from causing a redundant full
 * missing-result correction and an otherwise false outline failure. */
export function normalizeReviewedCausalResultAliases(
 value:any, aliasesByReview:Record<string,string[]>,
 anchors:ReturnType<typeof causalEvidenceAnchors>,
){
 if(!value||!Array.isArray(value.transitions)||!Object.keys(aliasesByReview).length)return value;
 const byId=new Map(anchors.map(anchor=>[anchor.id,anchor]));
 const aliasToRepresentative=new Map<string,string>();
 for(const [representativeId,aliasIds] of Object.entries(aliasesByReview)){
  const representative=byId.get(representativeId);
  for(const aliasId of aliasIds){
   const alias=byId.get(aliasId);
   const sameChapter=representative?.path?.split('.')[0]===alias?.path?.split('.')[0];
   if(!representative||!alias||representative.source!=='body'||alias.source!=='body'
     ||!sameChapter||representative.text!==alias.text)
    throw new Error('同文因果审核别名与服务器目录不一致');
   aliasToRepresentative.set(aliasId,representativeId);
  }
 }
 const alreadyCovered=new Set<string>(value.transitions.flatMap((row:any)=>{
   const id=String(row?.resultAnchorId||'');
   return aliasToRepresentative.has(id)?[]:[id];
 }));
 return {...value,transitions:value.transitions.map((row:any)=>{
  const alias=String(row?.resultAnchorId||'');
  const representative=aliasToRepresentative.get(alias);
  if(!representative||alreadyCovered.has(representative))return row;
  alreadyCovered.add(representative);
  return {...row,resultAnchorId:representative};
 })};
}

/** Project a complete independent judgment to only identical literal claims.
 * The server re-validates every expanded quote; a missing reviewed identity,
 * missing source address or differing content is an error, never a pass. */
export function expandCausalReviewedResultAliases(value:any,aliasesByReview:Record<string,string[]>,
 content:string,sources:Record<string,string>){
 if(!value||!Array.isArray(value.transitions))return value;
 const anchors=new Map(causalEvidenceAnchors(content,sources).map(anchor=>[anchor.id,anchor]));
 const seen=new Map<string,any>();
 for(const row of value.transitions){
  const id=String(row?.resultAnchorId||'');
  if(id&&seen.has(id))throw new Error('因果审核的同一结果地址存在多条互斥审查，必须逐项澄清：'+id);
  if(id)seen.set(id,row);
 }
 const extra:any[]=[];
 for(const row of value.transitions){
  const representative=anchors.get(String(row.resultAnchorId||''));
  const aliases=aliasesByReview[String(row.resultAnchorId||'')]||[];
  for(const id of aliases){
   const target=anchors.get(id);
   if(!representative||!target||representative.source!=='body'||target.source!=='body'
     ||representative.text!==target.text)throw new Error('因果审核的同文结果别名地址不一致');
   // A reviewer may independently assess an alias even when the prompt
   // contains only the representative result ID. That verdict has already
   // been paid for; do not throw and discard the complete chapter, or
   // overwrite its independently cited action/condition/gap.
   // Both rows remain subject to the original per-row citation validator.
   if(seen.has(id))continue;
   seen.set(id,row);
   extra.push({...row,resultAnchorId:id,resultEvidence:target.text});
  }
 }
 return {...value,transitions:[...value.transitions,...extra]};
}

/** IDs resolve to exact source paragraphs; no fuzzy quote correction or invented bridge. */
export function materializeCausalAuditAnchors(value: any, content: string, sources: Record<string,string>) {
  if (!value || !Array.isArray(value.transitions)) return value;
  // The advertised catalog is also the only catalog accepted by the server.
  // A JSON whole-paragraph address is NOT offered when the canonical source
  // has fine-grained body:v fields; do not accept a hidden fallback address.
  const allAnchors=causalEvidenceAnchorOptions(content,sources);
  const anchors=new Map(allAnchors.map(x=>[x.id,x]));
  const bound=bindCausalReviewEvidenceAddresses(value,[],allAnchors);
  return {...bound,transitions:bound.transitions.map((row:any,index:number)=>{
    const originallyAddressed=['actionAnchorId','resultAnchorId','bridgeAnchorId','beforeStateAnchorId']
      .some(key=>Object.prototype.hasOwnProperty.call(value.transitions[index],key));
    // Previously completed literal-quote audits with no address protocol
    // must remain byte-for-byte unchanged. Only addressed audits can receive
    // a unique omitted bridge ID; standalone legacy verdicts are not upgrades.
    if(!originallyAddressed)return value.transitions[index];
    const action=anchors.get(row?.actionAnchorId);
    const result=anchors.get(row?.resultAnchorId);
    const bridge=anchors.get(row?.bridgeAnchorId);
    const before=anchors.get(row?.beforeStateAnchorId);
    return {...row,
      // An exact raw quote can be server-bound to a unique result ID without
      // inventing an action address. Preserve the raw action ONLY when no
      // actionAnchorId was supplied; a false provided ID must still fail shut.
      actionEvidence:action?.source==='body'?action.text:
        row.actionAnchorId===undefined?String(row.actionEvidence||''):'',
      resultEvidence:result?.source==='body'?result.text:
        row.resultAnchorId===undefined?String(row.resultEvidence||''):'',
      ...(Object.prototype.hasOwnProperty.call(row,'beforeStateAnchorId') ? {beforeStateEvidence:before?.source==='body'?before.text:''} : {}),
      bridgeEvidence:bridge?.text||'',basisSource:bridge?.source||'body'};
  })};
}

/** Reuse a verified quotation when an independent check agrees on the same
 * action, prior state and result, but omits its bridge address. Never change
 * a new gap or borrow evidence from a different causal pair. */
export function preserveCausalCountercheckAnchors(original: any, value: any, content: string, sources: Record<string, string>) {
  if (!Array.isArray(value?.transitions)) return value;
  return {...value, transitions: value.transitions.map((row: any) => {
    if (row?.status !== 'supported' || row.bridgeAnchorId) return row;
    const prior = original?.transitions?.find((old: any) => old.status === 'supported'
      && ['chapterNumber', 'actionAnchorId', 'resultAnchorId', 'beforeStateAnchorId'].every(key =>
        row[key] !== undefined && row[key] === old[key]));
    if (!prior?.bridgeAnchorId || !validateCausalAudit({status: 'evaluated', reason: '继承同一因果关系已核验引文',
      transitions: [prior]}, content, sources).verified) return row;
    return {...row, bridgeAnchorId: prior.bridgeAnchorId};
  })};
}

/** Validate the reviewer's action/result ledger, not the truth of its literary judgement. */
export function validateCausalAudit(value: any, content: string, sources: Record<string, string>) {
  const errors: string[] = [];
  const issues: any[] = [];
  if (!value || !['evaluated', 'not_applicable'].includes(value.status)
    || typeof value.reason !== 'string' || value.reason.trim().length < 8 || !Array.isArray(value.transitions)) {
    return { verified: false, errors: ['必要因果审查未返回完整结论与行动结果账目'], issues };
  }
  if (value.status === 'not_applicable') {
    if (value.transitions.length) errors.push('不适用结论不能同时包含已评行动结果');
    return { verified: errors.length === 0, errors, issues };
  }
  if (!value.transitions.length) errors.push('已评因果结论缺少关键行动与结果证据');
  // The same assertion may be projected into several result fields with
  // different addresses. Resolve the exact text too, then invalidate uses of
  // that same result-only bridge until the existing citation correction has
  // located actual conditions. Do not mistake different field IDs for proof.
  const resultOnlyBridges=new Set<string>();
  for(const row of value.transitions){
    if(row?.status!=='supported'||row.basisSource!=='body'||typeof row.bridgeAnchorId!=='string')continue;
    const action=resolveQualityEvidence(content,row.actionEvidence),result=resolveQualityEvidence(content,row.resultEvidence);
    const bridge=resolveQualityEvidence(content,row.bridgeEvidence);
    if(action.verified&&result.verified&&bridge.verified&&bridge.quote.includes(result.quote)&&!bridge.quote.includes(action.quote))resultOnlyBridges.add(row.bridgeAnchorId);
  }
  value.transitions.forEach((row: any, index: number) => {
    const action = resolveQualityEvidence(content, row?.actionEvidence);
    const result = resolveQualityEvidence(content, row?.resultEvidence);
    const source = row?.basisSource === 'body' ? content : sources[row?.basisSource];
    const bridge = resolveQualityEvidence(source || '', row?.bridgeEvidence);
    if (!action.verified || !result.verified || !['supported', 'gap', 'planned'].includes(row?.status)
      || typeof row?.reason !== 'string' || row.reason.trim().length < 8
      || (row.status === 'supported' && !bridge.verified)) {
      const wrong=[
        !action.verified&&'actionEvidence不是正文连续原文',
        !result.verified&&'resultEvidence不是正文连续原文',
        !['supported','gap','planned'].includes(row?.status)&&'status不合法',
        (typeof row?.reason!=='string'||row.reason.trim().length<8)&&'reason缺少实际说明',
        row?.status==='supported'&&!bridge.verified&&'supported缺少有效成立条件原文',
      ].filter(Boolean);
      errors.push(`第${index + 1}项因果审查缺少可验证行动、结果或成立条件（${wrong.join('、')}）`);
      return;
    }
    // A result and its enclosing paragraph are the same assertion. If that
    // paragraph does not even contain the cited action, it cannot serve as
    // an independent bridge. Ask the existing citation correction to locate
    // actual conditions; this is NOT an automatically invented story defect.
    if(row.status==='supported'&&row.basisSource==='body'
      &&typeof row.bridgeAnchorId==='string'&&typeof row.resultAnchorId==='string'
      &&(resultOnlyBridges.has(row.bridgeAnchorId)||row.resultAnchorId===row.bridgeAnchorId||row.resultAnchorId.startsWith(row.bridgeAnchorId+':'))
      &&!bridge.quote.includes(action.quote)){
      errors.push(`第${index + 1}项因果审查以结果自身或其上层段落自证，须定位独立成立条件；直接结果可引用含实际行动的同段`);
      return;
    }
    if (row.status === 'gap') issues.push({
      issueType: 'causality_gap', severity: 'high', title: '关键行动与结果缺少成立条件',
      summary: row.reason, evidence: result.quote, evidenceKind: 'causal_gap',
      basisSource: 'body', basisEvidence: action.quote, basisReason: row.reason,
      suggestion: '先核对上游设定和章纲，补足真正决定结果的条件或收回过度断言；不要用旁白总结、重复动作或临时新规则圆回。',
      tags: ['causality_gap'],
    });
  });
  return { verified: errors.length === 0, errors, issues };
}

export function causalAuditRepairTargets(audit:any,errors:string[]) {
 if(!Array.isArray(audit?.transitions))return [];
 const targets=[...new Set(errors.flatMap(error=>{const match=error.match(/^第(\d+)项因果审查/);return match?[Number(match[1])-1]:[]}))];
 return targets.filter(index=>index>=0&&index<audit.transitions.length);
}
export function applyCausalAuditRepair(original:any,errors:string[],value:any) {
 const targets=causalAuditRepairTargets(original,errors);
 if(!targets.length)return value?.causalAudit;
 const rows=Array.isArray(value?.repairs)?value.repairs:Array.isArray(value?.causalAudit?.transitions)&&value.causalAudit.transitions.length===original.transitions.length?targets.map(index=>({index,...value.causalAudit.transitions[index]})):undefined;
 const normalized=Array.isArray(rows)?rows.map(row=>({...row,index:typeof row?.index==='string'&&/^(0|[1-9]\d*)$/.test(row.index)?Number(row.index):row?.index})):rows;
 if(!Array.isArray(normalized)||normalized.length!==targets.length||new Set(normalized.map(row=>row?.index)).size!==targets.length||normalized.some(row=>!targets.includes(row?.index)))throw new Error('因果协议纠错必须完整覆盖点名行，不能重审或增删已验证行');
 return {...original,transitions:original.transitions.map((row:any,index:number)=>{
   const fixed=normalized.find(item=>item.index===index);
   if(!fixed)return row;
   if(row.chapterNumber!==undefined&&fixed.chapterNumber!==undefined&&fixed.chapterNumber!==row.chapterNumber)throw new Error('因果协议纠错不能改变点名行章号');
   // A missing mandatory result was appended by the server with its exact
   // chapter and result address. The reviewer must assess THAT result, not
   // redirect the repair to an already-reviewed, easier outcome. Retain both
   // server-owned addresses even when the reviewer omits resultAnchorId.
   // Ordinary invalid citations have existing action/status fields and are
   // still permitted to correct a wrong result address under the full Gate.
   const lockedMissingResult=typeof row.resultAnchorId==='string'
     &&row.actionAnchorId===undefined&&row.status===undefined
     &&row.actionEvidence===undefined&&row.resultEvidence===undefined;
   if(lockedMissingResult&&fixed.resultAnchorId!==undefined
     &&fixed.resultAnchorId!==row.resultAnchorId)
     throw new Error('遗漏结果纠错不能改动服务器锁定的结果编号');
   return {...fixed,
     ...(lockedMissingResult?{resultAnchorId:row.resultAnchorId}:{}),
     ...(row.chapterNumber!==undefined?{chapterNumber:row.chapterNumber}:{})};
 })};
}
