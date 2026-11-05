import { resolveQualityEvidence } from './quality-issue';
import { STORY_CAUSAL_REVIEW_POLICY } from '../../../shared/src/system-workflow-rules.registry';

export function causalAuditRepairPrompt(audit: unknown, errors: string[], content: string, sources: Record<string, string>, includePolicy = true, stateContract = false) {
  const targets=causalAuditRepairTargets(audit,errors);
  // This is the SAME selectable catalog used by the citation resolver. For
  // structured outline JSON its addresses are body:v... and clause IDs,
  // not prose-only body:p... IDs. Never ask for an ID absent from the list.
  const visibleAnchors=causalEvidenceAnchorOptions(content,sources);
  return {
    systemPrompt: (targets.length ? '只修复因果审查的引用合同，' : stateContract ? '你是独立因果反证核查员。先从完整章纲提取行动前状态，再核对行动如何改变该状态，禁止从结果倒推条件已经具备。' : '独立审查行动与已声称结果是否成立，核对同一引文内的完整先后顺序、必要前提与对手原有能力；前提字段重复结果或结局目标不能充当实际机制证据。') + '保留真实缺口，不改正文、不改分数。只选择下方可选目录中真实存在的原文地址，系统提取原文，禁止重写引文；结构化章纲可能使用body:v及其分句编号，普通正文可能使用body:p编号，不能凭示例猜编号。supported必须填写有效的bridgeAnchorId，gap及planned允许为空。planned仅适用于原文明示的未来安排或线索埋设，不得用来豁免已声称兑现的实际结果。自己取出并保管物件的直接结果，可以选择实际交代其支配和保管状态的同一段作为桥接编号；不必虚构额外条件。涉及他人决定、权限、传播或时间的结果，仍须证明对应条件，不能用结果本身证明。',
    prompt: `${includePolicy ? STORY_CAUSAL_REVIEW_POLICY : "按已注入QLT-003必要因果判据执行。"}\n原因果账目：${JSON.stringify(targets.length&&Array.isArray((audit as any)?.transitions)
      ?{status:(audit as any).status,reason:(audit as any).reason,
        retainedValidatedRows:(audit as any).transitions.length-targets.length,
        fixOnly:targets.map(index=>({index,...(audit as any).transitions[index]}))}
      :audit)}\n校验错误：${errors.join('；')}\n可选原文证据编号（唯一允许的地址全集）：${JSON.stringify(visibleAnchors)}\n${targets.length ? `本次仅纠正编号${JSON.stringify(targets)}（从0开始），其它已验证行不能重审、增删或改结论。返回JSON:{"repairs":[{"index":"点名编号", "actionAnchorId":"目录中的真实行动编号","resultAnchorId":"目录中的真实结果编号","bridgeAnchorId":"目录中的真实成立条件编号；gap可为空","status":"supported|gap|planned","reason":"至少8字实际依据"}]}。` : '只输出JSON:{"causalAudit":{"status":"evaluated|not_applicable","reason":"至少8字说明","transitions":[{"actionAnchorId":"目录中的真实行动编号","resultAnchorId":"目录中的真实结果编号","bridgeAnchorId":"目录中的真实成立条件编号；gap可为空","status":"supported|gap|planned","reason":"至少8字说明"}]}}。'}核对输入中全部实际决定处境的关键行动结果；不因项数截掉必要结果，也不为凑项数补普通动作。编号必须从上表逐字选择；不适用须有实际理由；无成立条件时保留gap，不能用计划、主角希望或旁白结论证明已发生的结果。`,
  };
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
      const unambiguousCondition=/^(?:如果|假如|倘若|只要|一旦|除非|若(?!干)|当.{1,24}时|在.{1,24}(?:时|后))/.test(left);
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

/** A last reviewer response can supply genuine action and outcome quotes but
 * leave a supported bridge unproven. After the existing citation correction
 * was exhausted, record this as a BLOCKING causal gap rather than treating
 * the whole chapter as an opaque protocol error. No condition or outcome is
 * synthesized, and the calling quality gate must still reject the draft.
 * Never convert missing action/result, conflicting addresses or incomplete
 * audit coverage. */
export function quarantineUnprovedCausalBridges(
 audit:any,errors:readonly string[],content:string,sources:Record<string,string>,
){
 if(audit?.status!=='evaluated'||!Array.isArray(audit?.transitions)||!errors.length
   ||errors.some(error=>!/^第[1-9]\d*项因果审查缺少可验证行动、结果或成立条件（supported缺少有效成立条件原文）$/.test(error)))return audit;
 const indices=[...new Set(errors.map(error=>Number(error.match(/^第(\d+)项/)?.[1])-1))];
 if(indices.some(index=>!Number.isInteger(index)||index<0||index>=audit.transitions.length))return audit;
 const selected=new Set(indices);
 const transitions=audit.transitions.map((row:any,index:number)=>{
  if(!selected.has(index))return row;
  if(row?.status!=='supported'||typeof row.reason!=='string'||row.reason.trim().length<8
    ||!resolveQualityEvidence(content,row.actionEvidence).verified
    ||!resolveQualityEvidence(content,row.resultEvidence).verified)return null;
  const source=row.basisSource==='body'?content:sources[row.basisSource];
  if(resolveQualityEvidence(source||'',row.bridgeEvidence).verified)return null;
  return {...row,status:'gap',bridgeAnchorId:'',bridgeEvidence:'',basisSource:'body',
    reason:'原因果审查未提供可验证的结果成立条件，须修复章节事实或收回过度断言：'+row.reason};
 });
 if(transitions.some((row:any)=>row===null))return audit;
 const reduced={...audit,transitions};
 return validateCausalAudit(reduced,content,sources).verified?reduced:audit;
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
   return {...fixed,...(row.chapterNumber!==undefined?{chapterNumber:row.chapterNumber}:{})};
 })};
}
