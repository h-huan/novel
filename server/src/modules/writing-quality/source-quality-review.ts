import { resolveCitationAnchor } from './citation-anchor';
import { resolveQualityEvidence } from './quality-issue';
import { readerGoalReviewIssues, type ReaderGoalReview } from '../../chain/reader-goal-review';
import { SOURCE_QUALITY_POLICY, STORY_CAUSAL_REVIEW_POLICY, CROSS_STAGE_REVIEW_POLICY, CONTINUITY_SCOPE_POLICY } from '../../../shared/src/system-workflow-rules.registry';
import { isStructuredOutputTruncated } from '../../chain/structured-truncation';
import { isDeepStrictEqual } from 'node:util';

/** Shrink only a physically truncated checklist. Every fixed item still runs;
 * unrelated failures are never converted into passes or retried here. */
export async function reviewFixedCatalog<T,R>(items:T[],review:(items:T[])=>Promise<R>):Promise<R[]> {
  try{return [await review(items)];}
  catch(error){
    if(!isStructuredOutputTruncated(error)||items.length<2)throw error;
    const middle=Math.ceil(items.length/2);
    return [...await reviewFixedCatalog(items.slice(0,middle),review),...await reviewFixedCatalog(items.slice(middle),review)];
  }
}
/** A valid partial checklist is retained, never accepted as full coverage.
 * Ask once for omitted items only; final coverage/citation checks remain mandatory. */
export async function reviewFixedSourceChecklist<T extends {id:string},R extends {checks:any[]}>(items:T[],review:(items:T[])=>Promise<R>):Promise<R[]> {
  const responses=await reviewFixedCatalog(items,review);
  const missing=()=>items.filter(item=>!responses.some(response=>response.checks.some(check=>check.id===item.id)));
  const omitted=missing();
  if(omitted.length)responses.push(...await reviewFixedCatalog(omitted,review));
  if(missing().length)throw Error('来源清单补全仍有遗漏，未验收：'+missing().map(item=>item.id).join(','));
  const ids=responses.flatMap(response=>response.checks.map(check=>check.id));
  if(new Set(ids).size!==ids.length||ids.some(id=>!items.some(item=>item.id===id)))throw Error('来源清单存在重复或额外编号，未验收');
  return responses;
}

/** Contract ownership is QLT-003. This checks coverage/evidence, not semantic truth. */
export const SOURCE_QUALITY_AXES = ['promise', 'continuity', 'agency', 'professional', 'progression', 'voice'] as const;
export const CONTINUITY_EVIDENCE_CONTRACT = CONTINUITY_SCOPE_POLICY + '有previousChapter时，continuity的supported也必须引用context中已保存前序完整正文的basisEvidence；逐项对照本章对过去事件、人物所知、位置及权限等状态的声称，不用本章回忆或章纲当作前章事实。明确回溯的旧事件或原话可引用historicalChapters中的完整已保存正文；当前状态仍以紧邻前章为准，旧状态不得覆盖新状态。只有摘要或中段省略而没有完整前章时标unknown，不宣称核对完成。';
export function continuityClaimCatalog(content: string) {
  return [...new Set(content.split(/\r?\n/).map(row=>row.trim()).filter(row=>/(?:昨天|昨日|昨夜|昨晚|上次|上回|前一天|前章|此前|之前|第一次|首次)/.test(row)))]
    .map((evidence,index)=>({ref:'C'+(index+1),evidence,requiresPrior:/(?:昨天|昨日|昨夜|昨晚|上次|上回|前一天|前章)/.test(evidence)}));
}
export function continuityClaimReviewDirective(content: string, refs?: string[]) {
  return CONTINUITY_EVIDENCE_CONTRACT+'服务端固定的前序声称清单：'+JSON.stringify(continuityClaimCatalog(content).filter(claim=>!refs||refs.includes(claim.ref)))
    +'。有前章时sourceQualityAudit.checks.continuity.claimChecks返回清单每个C编号恰一条：{ref,status:"consistent|conflict|new_information|not_prior|unknown",basisEvidence:"对应来源连续逐字原文",reason:"至少8字具体比较"}。consistent和conflict须用前章原文对照该条具体声称的主体、行为、地点、时点与肯定/否定状态，不能只引正确的一半或另一条回忆证明此条；冲突如实返回conflict，地点不同不能因同为“打量”忽略。本章首次披露的新增背景、首次取得的历史调查资料或人物请求可new_information，basisEvidence引用本条正文并说明为什么没有改写前章已确认事实；前章已明确的地点、投诉、人物所知等状态不同不得包装为新增信息。requiresPrior=true不得not_prior；其它确属本章内新发生事件可not_prior并解释实际先后。未能核对依据返回unknown，不以摘要或单条记忆概括全部连续性。正文正常省略细节无需补解释段。';
}
export function continuityClaimReviewPrompt(content: string, context: string, refs?: string[]) {
  return '只审查本章前序声称与已保存前序正文的实际一致性。当前状态以紧邻前章为准；明确回溯的旧事件或原话可核对historicalChapters，不能用旧状态覆盖新状态。不改正文，不补解释，不评其它维度。\n'
    +continuityClaimReviewDirective(content,refs)+'\n【实际前章与支持上下文】\n'+context+'\n【本章正文】\n'+content
    +'\n此专项只返回一个合法JSON对象：{"claimChecks":[{"ref":"C编号","status":"consistent|conflict|new_information|not_prior|unknown","basisEvidence":"对应来源连续逐字原文","reason":"至少8字具体比较"}]}。不返回完整章节评审，不输出其它字段。';
}
function claimLocationTokens(text: string) {
  return [...text.matchAll(/(?:\d{3,5})(?=门口|门前|室|号房|房间)|[一二两三四五六七八九十百\d]+(?:楼|层(?=楼|大厅|大堂|走廊|门口|电梯|的|[，。；、！？\s]|$))/g)].map(match=>match[0]);
}
export function sourceBoundaryRiskKinds(content:string):string[] {
  const kinds:string[]=[];
  if(/(截图|图片|文件|转发|复制|拷贝|照片|录像|视频)/.test(content)&&/(看不到|看不见|不可见|只有.{0,12}(?:看|见))/.test(content))kinds.push('visibility');
  if(/(授权|许可|权限)/.test(content)&&/(不(?:用|必|需)|不刷卡|不记名|敞开|一直.{0,12}开)/.test(content))kinds.push('permission');
  if(/唯一.{0,20}(?:时间窗|进出|作案|路径|通道)|(?:锁定|推出|还原).{0,20}唯一|(?:只有|仅有|只剩).{0,20}(?:一|这|此)(?:条|趟|个|段|次).{0,30}(?:能|可以|通道|路径|窗口|时间窗|进出|作案|不留名|卡在|对上|对齐|终点|时限)/.test(content))kinds.push('exclusivity');
  if(/反锁/.test(content)||/把.{1,20}(?:反锁|锁在|关在).{0,20}(?:屋|室|门)|(?:门卡|钥匙).{0,30}(?:困住|无法离开|不能离开)|被(?:困|反锁|锁|关).{0,15}(?:屋|室|内|无法|不能)|(?:被反锁|反锁).{0,30}(?:只剩|出不来|无法|不能)/.test(content))kinds.push('restraint');
  return kinds;
}
export function needsSourceBoundaryReview(content: string) {
  return sourceBoundaryRiskKinds(content).length>0;
}
/** The execution standard is a constraint source, not a fictional event.
 * Give the reviewer and citation validator the same explicit source set. */
export function sourceBoundaryEvidenceContext(context:string) {
  let story:any=context;try{story=JSON.parse(context);}catch{}
  return JSON.stringify({storySources:story,executionStandard:{sourceQualityPolicy:SOURCE_QUALITY_POLICY}});
}
/** Preserve narrative prerequisites omitted by structured actions. Only omit
 * an inline action copy when it decodes identically to the retained actions;
 * each remaining original span stays separate for citation binding. */
export function outlineNarrativeSourceCatalog(rows:Array<{id:string;content?:unknown;scenes?:unknown;plan_json?:unknown}>) {
  return rows.flatMap(row=>{
    if(typeof row.content!=='string'||!row.content.trim())return [];
    let plan:any=row.plan_json||row.scenes;try{if(typeof plan==='string')plan=JSON.parse(plan);}catch{}
    const segments:string[]=[];let cursor=0;
    if(Array.isArray(plan?.characterActions))for(const match of row.content.matchAll(/^[ \t]*人物行动[：:]([^\r\n]*)/gm)){
      try{
        const payload=match[1].trim();
        const copy=JSON.parse(payload.startsWith('[')?payload:'['+payload.replace(/}\s*；\s*{/g,'},{')+']');
        if(!isDeepStrictEqual(copy,plan.characterActions))continue;
        if(match.index!>cursor)segments.push(row.content.slice(cursor,match.index));cursor=match.index!+match[0].length;
      }catch{}
    }
    if(cursor<row.content.length)segments.push(row.content.slice(cursor));
    return [{chapterId:row.id,segments:segments.filter(segment=>segment.trim())}];
  });
}
/** Source positions, like target positions, are server-owned. Decode nested
 * JSON fields without merging different source fields into one quotation. */
export function sourceEvidenceCatalog(context:string) {
  const entries:Array<{id:string;path:string;text:string}>=[];
  const visit=(value:any,path:string[])=>{
    if(typeof value==='string'){
      try{const parsed=JSON.parse(value);if(parsed&&typeof parsed==='object'){visit(parsed,path);return;}}catch{}
      if(value.trim())entries.push({id:'S'+(entries.length+1),path:path.join('.'),text:value});
    }else if(value&&typeof value==='object')Object.entries(value).forEach(([key,item])=>visit(item,[...path,key]));
  };
  try{visit(JSON.parse(context),[]);}catch{visit(context,[]);}
  return entries;
}
function sourceReferenceList(value:unknown):string[] {
  return Array.isArray(value)?value:typeof value==='string'?value.split(/[,，、/]/).map(ref=>ref.trim()):[];
}
/** Enforce the existing scope/strength contract, without judging an unquoted
 * missing fact. A reviewer cannot support an exclusive claim by explaining
 * only a suspicion. This reports the review's own contradiction, not a new
 * fictional fact; explicitly tentative claims and negated examples stay valid. */
export function exclusiveClaimReviewMismatch(claim:string,reason:string):string|null {
  const exclusive=claim.split(/[。；;\n]/).some(part=>(/唯一/.test(part)||sourceBoundaryRiskKinds(part).includes('exclusivity'))
    &&! /唯一(?:的)?(?:嫌疑|候选)|(?:是否|寻找|查找|可能|未能|无法|不能|尚未|未确定|未确认).{0,10}(?:唯一|只有|仅有|只剩)/.test(part));
  if(!exclusive)return null;
  // A bounded record conclusion can be valid, but cannot retrospectively
  // narrow an unqualified promise of uniqueness.
  if(!/(?:记录|可见|所见|候选|嫌疑)[^。；\n]{0,20}(?:范围|中|里|内)|(?:范围|范围内)[^。；\n]{0,12}(?:唯一|只有)/.test(claim)){
    const scopeChanges=/(?:[“"‘']?唯一[”"’']?[^。；\n]{0,8}被(?:限定|收窄|缩小)|(?:将|把)[^。；\n]{0,12}唯一[^。；\n]{0,12}(?:限定|收窄|缩小))[^。；\n]{0,40}(?:范围|记录|可见|所见)/g;
    for(const match of reason.matchAll(scopeChanges)){
      if(/(?:不|并未|并非|不是|没有)\s*$/.test(reason.slice(Math.max(0,match.index!-6),match.index!)))continue;
      return '评审结论与依据不一致：原承诺未限定的唯一结果，被支持理由缩小到记录或可见范围；不得通过重释承诺宣称保留。';
    }
  }
  const narrowed=/(?:属(?:于)?[^。；\n]{0,20}|(?:仅(?:能|仅|是)?|只(?:能|是)|仍(?:是|属))[^。；\n]{0,12})(?:嫌疑|待查|推测|猜测)/g;
  for(const match of reason.matchAll(narrowed)){
    const before=reason.slice(Math.max(0,match.index!-5),match.index!);
    if(/(?:不|并非|不是|不再|排除|排除了|否定)[“"'‘]?\s*$/.test(before)
      ||/不是|并非|不只是|不仅|已排除|排除了/.test(match[0]))continue;
    return '评审结论与依据不一致：原文断言唯一，支持理由却仅解释嫌疑或推测；须核对实际排他条件，不能重释原文后放行。';
  }
  return null;
}
function bindSourceEvidence(row:any,context:string) {
  if(!row)return row;
  if(row.basisRef===undefined)return {...row,additionalBasisEvidence:undefined};
  const refs=sourceReferenceList(row.basisRef);
  const catalog=sourceEvidenceCatalog(context),sources=refs.map((ref:any)=>catalog.find(item=>item.id===ref));
  if(!refs.length||new Set(refs).size!==refs.length||sources.some((source:any)=>!source)
    ||row.basisEvidence!==undefined&&!sources.some((source:any)=>resolveQualityEvidence(source.text,row.basisEvidence).verified))
    return {...row,basisEvidence:''};
  return {...row,basisEvidence:row.basisEvidence??sources[0]!.text,additionalBasisEvidence:sources.slice(1).map((source:any)=>source.text)};
}
function sourceEvidenceText(row:any) {
  return [row.basisEvidence,...(row.additionalBasisEvidence||[])].join(' | ');
}
function hasFutureGoalEvidence(row:any,context:string) {
  const catalog=sourceEvidenceCatalog(context);
  const refs=row.basisRef===undefined?null:sourceReferenceList(row.basisRef);
  const proofs=[row.basisEvidence,...(row.additionalBasisEvidence||[])];
  const sources=refs?catalog.filter(source=>refs.includes(source.id)):catalog.filter(source=>proofs.some(proof=>resolveQualityEvidence(source.text,proof).verified));
  return sources.some(source=>/(?:^|\.)(?:ending|endingDirection|ending_direction|growthArc|growth_arc)(?:\.|$)/i.test(source.path)
    ||/candidatePrerequisites\.plannedCharacters\.\d+\.arc(?:\.|$)/.test(source.path));
}
export function sourceBoundaryReviewPrompt(content:string,context:string,outline:string) {
  return '只核对决定结果的来源边界，不改正文。'+SOURCE_QUALITY_POLICY
    +'\n【未来方案与已确认事实】'+CROSS_STAGE_REVIEW_POLICY
    +'\n【行动与派生结果】'+STORY_CAUSAL_REVIEW_POLICY
    +'\n重点核对账号/主体许可是否被扩成物理持续状态、他人权限、同一屏幕的感知或复制文件的效果；审查真实世界来源，不能用正文结果断言自证机制。世界中的history、endingDirection、故事目标和情节安排可以提供事件、动机或实际取得条件的来源，但不能代替规则授予器件新性质或扩大权限；背景声称“唯一途径”不能证明特定设备在整个许可时段维持某物理状态，也不能证明其他主体的既有权限或其它记录路径已被排除。奇幻等已有明确能力授权可以成立，不凭词面判错；本来正常的分享或权限操作无需新增手续。'
    +'\n【本次支持来源】'+context+'\n【实际章纲】'+outline+'\n【正文】'+content
    +'\n只返回一个合法JSON对象：{"status":"supported|gap|conflict|unknown","evidence":"正文连续逐字原文","basisEvidence":"上下文中授权或约束的连续逐字原文","reason":"至少8字说明作用对象、载体与实际成立条件","origin":"body|chapter_plan","outlineEvidence":"仅章纲也承诺同一错误机制时填写章纲连续逐字原文，其它为空"}。支持与缺口都须具体依据；尚未核实用unknown。章纲确有同一错误才origin=chapter_plan，不能为正文错误反改正确章纲。';
}
export function resolveSourceContextEvidence(context:string,candidate:unknown) {
  const values:string[]=[context,...sourceEvidenceCatalog(context).map(item=>item.text)];
  try {const visit=(value:any)=>{if(typeof value==='string')values.push(value);else if(value&&typeof value==='object')Object.values(value).forEach(visit);};visit(JSON.parse(context));} catch {}
  for(const value of values){const result=resolveQualityEvidence(value,candidate);if(result.verified)return result;}
  return resolveQualityEvidence('',candidate);
}
export function validateSourceBoundaryReview(row:any,content:string,context:string,outline:string) {
  const errors:string[]=[],findings:string[]=[],sourceConflicts:string[]=[];
  if(!row||!['supported','gap','conflict','unknown'].includes(row.status)||typeof row.reason!=='string'||row.reason.trim().length<8
    ||!resolveQualityEvidence(content,row.evidence).verified||!resolveSourceContextEvidence(context,row.basisEvidence).verified
    ||row.additionalBasisEvidence!==undefined&&(!Array.isArray(row.additionalBasisEvidence)||row.additionalBasisEvidence.some((evidence:unknown)=>!resolveSourceContextEvidence(context,evidence).verified))
    ||!['body','chapter_plan'].includes(row.origin))errors.push('来源边界核对缺少实际正文、来源依据或明确结论；不得拼接不同字段的引文');
  else if(hasFutureGoalEvidence(row,context))errors.push('来源角色错误：未来结局计划、人物成长弧与候选人物arc不能作为已授权能力或必须恢复原手段的依据，与其它来源混引也不能授权机制；须核对独立机制或完整叙事中的实际行动条件。');
  else if(row.status==='unknown')errors.push('来源边界尚未核实：'+row.reason);
  else if(['gap','conflict'].includes(row.status)) {
    const preview=(text:string)=>text.length>240?text.slice(0,240)+'…（仅预览，完整证据见留存记录）':text;
    const finding='【来源边界】'+row.reason+' | 正文: '+preview(row.evidence)+' | 来源: '+preview(sourceEvidenceText(row));
    if(row.origin==='chapter_plan') {
      if(!resolveQualityEvidence(outline,row.outlineEvidence).verified)errors.push('来源边界认定章纲有错但缺实际章纲证据');
      else sourceConflicts.push(finding+' | 章纲: '+row.outlineEvidence);
    } else findings.push(finding);
  }
  return {verified:!errors.length,errors,findings,sourceConflicts};
}
/** Reuse the body boundary contract before prose exists. Every risky chapter
 * must have its own result; one correct claim cannot cover the other chapters. */
function outlineSourceBoundaryClauses(rows: Array<{id:string;[key:string]:any}>) {
  return rows.flatMap(row=>{
    const claims:Array<{id:string;chapterId:string;content:string}>=[];
    const visit=(value:any,path:string[])=>{if(typeof value==='string'){
      try{const parsed=JSON.parse(value);if(parsed&&typeof parsed==='object'){visit(parsed,path);return;}}catch{}
      value.split(/[。；\n]+/).forEach((text:string,index:number)=>{
        const id=row.id+'-B-'+path.join('.')+'-'+index;
        if(text.trim())claims.push({id,chapterId:row.id,content:text.trim()});
      });
    }else if(value&&typeof value==='object')Object.entries(value).forEach(([key,item])=>visit(item,[...path,key]));};
    for(const [key,value] of Object.entries(row))if(!['id','title'].includes(key))visit(value,[key]);
    return claims;
  });
}
export function outlineSourceBoundaryCatalog(rows: Array<{id:string;[key:string]:any}>, requiredIds: readonly string[] = []) {
  const required=new Set(requiredIds);
  return outlineSourceBoundaryClauses(rows).filter(item=>needsSourceBoundaryReview(item.content)||required.has(item.id));
}
/** Sentence indexes are local coordinates, not identities across edits.
 * Follow unchanged text; for rewritten claims cover the replacement between
 * surviving neighbors. Ambiguous movement conservatively reviews the field. */
export function remapOutlineSourceBoundaryTargets(previous:Array<{id:string;[key:string]:any}>,current:Array<{id:string;[key:string]:any}>,targets:readonly {id:string;content:string}[]):string[] {
  return remapSourceBoundaryUnits(outlineSourceBoundaryClauses(previous),outlineSourceBoundaryClauses(current),targets);
}
function remapSourceBoundaryUnits(before:readonly {id:string;content:string}[],after:readonly {id:string;content:string}[],targets:readonly {id:string;content:string}[]) {
  const required=new Set<string>();
  const field=(id:string)=>id.replace(/-\d+$/,'');
  for(const target of targets){
    const old=before.filter(item=>field(item.id)===field(target.id)),next=after.filter(item=>field(item.id)===field(target.id));
    const index=old.findIndex(item=>item.id===target.id&&item.content===target.content);
    if(index<0){next.forEach(item=>required.add(item.id));continue;}
    const exact=next.filter(item=>item.content===target.content);
    if(exact.length){exact.forEach(item=>required.add(item.id));continue;}
    let start=-1,end=next.length;
    for(let i=index-1;i>=0;i--){const matches=next.flatMap((item,n)=>item.content===old[i].content?[n]:[]);if(matches.length===1){start=matches[0];break;}}
    for(let i=index+1;i<old.length;i++){const matches=next.flatMap((item,n)=>item.content===old[i].content?[n]:[]);if(matches.length===1){end=matches[0];break;}}
    const replacement=start<end?next.slice(start+1,end):next;
    replacement.forEach(item=>required.add(item.id));
  }
  return [...required];
}
/** A supported entry mechanism cannot stand for every derived result.
 * Cover the structured action/result list. Keyword selection let a repair
 * erase its own review target by changing the wording of a conclusion. */
export function outlineResultClaimCatalog(rows:Array<{id:string;scenes?:unknown;plan_json?:unknown}>) {
  return rows.flatMap(row=>{
    let plan:any=row.plan_json||row.scenes;
    if(typeof plan==='string')try{plan=JSON.parse(plan);}catch{return [];}
    if(!Array.isArray(plan?.characterActions))return [];
    return plan.characterActions.flatMap((item:any,index:number)=>{
      if(typeof item?.action!=='string'||typeof item?.result!=='string')return [];
      const clauses=item.result.split(/[，；。]/).map((text:string)=>text.trim()).filter(Boolean);
      return (clauses.length?clauses:[item.result]).map((result:string,clauseIndex:number)=>({
        ref:row.id+'-A'+(index+1)+'-R'+(clauseIndex+1),chapterId:row.id,character:String(item.character||''),
        action:item.action,result,parentResult:item.result,
      }));
    });
  });
}
const SOURCE_INFERENCE_SCOPE_DIRECTIVE='\n逐个id核对实际声称的全部必要条件，一条正常权限不能覆盖另一条排他结论。历史记录只证明该历史时段，不自动证明未来时段；规章允许查处不等于已实际查处，也不能据此排除提前进入、滞留等仍符合已知条件的具体反例。必要反例未排除时保留gap，不要求枚举无关理论可能。';
function sourceInferenceScopeDirective(content:string) {
  return /(?:唯一|只有|仅有|只剩|排除)[^。\n]{0,50}(?:时间窗|窗口|时段|区间)|(?:时间窗|窗口|时段|区间)[^。\n]{0,50}(?:唯一|只有|仅有|只剩)/.test(content)
    ? SOURCE_INFERENCE_SCOPE_DIRECTIVE
    : '';
}
export function outlineResultClaimPrompt(rows:Array<{id:string;scenes?:unknown;plan_json?:unknown}>,context:string,refs?:readonly string[]) {
  return '只核对下面固定清单中行动到关键结果的必要条件，不改写章纲或正文。'+SOURCE_QUALITY_POLICY+'\n'+STORY_CAUSAL_REVIEW_POLICY
    +sourceInferenceScopeDirective(outlineResultClaimCatalog(rows).filter(item=>!refs||refs.includes(item.ref)).map(item=>item.result).join('\n'))
    +'\n结果可继承同章此前通过实际行动取得的知识、物件或状态，不要求每次继续行动都重新取得；须核对取得动作、先后与本项对象相同。掌握或把线索掐在手里等信息表达不自动等于留存原始记录。basisEvidence引用实际取得或本项成立动作。涉及额外机制时，若取得动作在候选章纲而机制条件在独立来源，分开返回mechanismBasisRef与mechanismEvidence（独立来源编号与连续原文）；两类证据一起核对，不能只凭动作授予新能力，也不能只凭世界中存在机制就证明人物已经取得结果。排他结论仍须核对排除范围与实际比对，不以掌握信息的口语豁免唯一性。'
    +'\n每项分别核对：正常打开门不证明这是唯一作案路径；主体有进入能力不证明有困住对手的能力；请求机构介入不证明其已经到场处置。这些是区分条件的说明，不是对输入预判。明确授权的特殊能力按其来源执行；普通直接因果无需额外手续。同一行动的多个结果已经拆成不同ref，各结果分别举证；不能引用录音制度证明限制人身移动，不能引用进入权限证明内侧无法离开，不能以结果词本身当对象机制。依据必须支持当前ref的结果，不得用另一结果的有效依据代替。不要因另一项正常就跳过本项。'
    +'\n【固定关键结果清单】'+JSON.stringify(outlineResultClaimCatalog(rows).filter(item=>!refs||refs.includes(item.ref)))+'\n【完整当前章纲与来源编号】'+JSON.stringify(sourceEvidenceCatalog(context))
    +'\n逐个ref恰好返回一行，只输出JSON:{"checks":[{"ref":"实际ref","status":"supported|gap|conflict|unknown","basisRef":"实际S编号","basisEvidence":"所选来源中实际行动或必要条件的连续逐字短引文","reason":"至少8字说明必要条件如何成立或缺失"}]}。行动与结果由服务器按ref绑定，不复述actionEvidence/resultEvidence。basisEvidence必须从所选来源引用具体行动或成立条件，不能引用本项结果或重复结果的句子当成立依据；候选result字段是待证结论，不是独立来源。涉及复制内容、他人权限、排他推论、限制屋内人员离开等额外机制时，basisEvidence必须引用候选chapters与candidatePrerequisites之外的独立机制资料；不能引用候选content中的同义结果，不把历史结局或执行标准本身当能力授权。普通直接因果可引用已明确的对应行动，不要求新增手续。额外性质、排他推论或限制他人行动须引用独立机制，引用计划声称效果发生不能证明这个效果具备成立条件。来源编号须对应这段实际引文，不能用无关来源代替。只证明已选实际路径，不用目标、效果词或未选择方案代替操作机制。不把完整词面引文等同因果证明。';
}
export function validateOutlineResultClaims(value:any,rows:Array<{id:string;scenes?:unknown;plan_json?:unknown}>,context:string,refs?:readonly string[]) {
  const catalog=outlineResultClaimCatalog(rows).filter(item=>!refs||refs.includes(item.ref)),checks=value?.checks,errors:string[]=[],findings:string[]=[];
  if(!Array.isArray(checks)||checks.length!==catalog.length||new Set(checks.map((row:any)=>row?.ref)).size!==catalog.length
    ||checks.some((row:any)=>!catalog.some(item=>item.ref===row?.ref)))errors.push('关键结果专项须逐项覆盖固定ref，不能遗漏或用其它项代替');
  for(const item of catalog){
    const received=bindSourceEvidence(Array.isArray(checks)?checks.find((row:any)=>row?.ref===item.ref):undefined,context);
    const row=received?{...received,actionEvidence:received.actionEvidence??item.action,resultEvidence:received.resultEvidence??item.result}:undefined;
    if(!row||!['supported','gap','conflict','unknown'].includes(row.status)||typeof row.reason!=='string'||row.reason.trim().length<8
      ||!resolveQualityEvidence(item.action,row.actionEvidence).verified||!resolveQualityEvidence(item.result,row.resultEvidence).verified
      ||!resolveSourceContextEvidence(context,row.basisEvidence).verified){errors.push(item.ref+'缺少对应行动、结果或来源证据');continue;}
    if(row.status==='supported'){
      const mismatch=exclusiveClaimReviewMismatch(item.result,row.reason);
      if(mismatch)findings.push(item.chapterId+'【关键结果】'+mismatch+' | 结果: '+item.result+' | 评审依据: '+row.reason);
      const supplied=checks.find((check:any)=>check?.ref===item.ref)?.basisEvidence;
      const proof=typeof supplied==='string'?supplied.trim():'';
      const resultOnly=proof&&[item.result,item.parentResult].some(result=>resolveQualityEvidence(result,proof).verified);
      if(!proof||resultOnly)errors.push(item.ref+'成立依据须引用实际行动或独立条件，不能由待证结果自证');
      if(needsSourceBoundaryReview(item.result)){
        const suppliedRef=checks.find((check:any)=>check?.ref===item.ref)?.basisRef;
        const refs=sourceReferenceList(suppliedRef);
        const independentProof=(proofRefs:string[],evidence:string)=>sourceEvidenceCatalog(context).some(source=>proofRefs.includes(source.id)
          &&!/(?:^|\.)chapters(?:\.|$)|(?:^|\.)candidatePrerequisites(?:\.|$)/.test(source.path)
          &&!/(?:^|\.)(?:history|endingDirection|ending|sourceQualityPolicy)(?:\.|$)/.test(source.path)
          &&!hasFutureGoalEvidence({basisRef:source.id},context)
          &&resolveQualityEvidence(source.text,evidence).verified);
        const suppliedRow=checks.find((check:any)=>check?.ref===item.ref);
        const mechanismRefs=sourceReferenceList(suppliedRow?.mechanismBasisRef);
        const mechanismProof=typeof suppliedRow?.mechanismEvidence==='string'?suppliedRow.mechanismEvidence.trim():'';
        const independent=independentProof(refs,proof)||Boolean(mechanismProof&&mechanismRefs.length&&independentProof(mechanismRefs,mechanismProof));
        if(!independent)errors.push(item.ref+'额外能力或限制效果须引用独立机制，不能引用候选章纲的结果或其叙述副本');
      }
    }
    if(row.status==='unknown')errors.push(item.ref+'必要条件尚未核实');
    else if(row.status!=='supported')findings.push(item.chapterId+'【关键结果】'+row.reason+' | 行动: '+row.actionEvidence+' | 结果: '+row.resultEvidence+' | 来源: '+sourceEvidenceText(row));
  }
  return {verified:!errors.length,errors,findings};
}
function priorInferenceSource(row:{id:string;content?:unknown},context:string) {
  if(!/\.characterStates\.\d+\.stateBefore-/.test(row.id)||!/(?:锁定|确认|推出|还原).{0,24}唯一/.test(String(row.content??'')))return null;
  try{
    const narratives=JSON.parse(context).storySources?.candidatePrerequisites?.currentNarratives;
    const index=narratives?.findIndex((narrative:any)=>narrative.chapterId===row.id.split('-B-')[0]);
    return index>0?{path:'storySources.candidatePrerequisites.currentNarratives.'+(index-1)+'.segments.',segments:narratives[index-1].segments}:null;
  }catch{return null;}
}
export const SOURCE_BOUNDARY_OBSERVATION_SCOPE_DIRECTIVE = '\n清单中的句子可能同时包含正常事件和机制断言，只核对实际额外能力、权限、排他效果及其必要条件。未执行计划中的普通观察、数据异常或发现线索不要求世界观预先逐项列出；发现两份记录不同本身不授予新设备能力，也不自动证明真伪、篡改者或唯一结论。若异常被用于推出上述额外结果，仍核对对应推论与必要条件；与已确认规则互斥的异常仍属冲突，不因是新情节而豁免。';
export const SOURCE_BOUNDARY_AUTHORITY_SCOPE_DIRECTIVE = '\n先区分制度要求、技术强制和具体事件。规章要求某人取得许可、违规者会被清出或报警，不等于未经许可的人物在物理上绝不可能行动；违规路径须有实际操作、风险与后果，不能把违规成功当取得合法权限。技术明确要求逐人验身、单人通道或权限控制到特定层时仍按该限制核对，不能借普通动作绕过已确认的强制性质。已存在的普通门、电梯与手机按其普通用途使用，不要求世界观预先列出每次开门、同乘、查看或计时事件；本次由有权限者实际开门后的普通同行不同于让他人取得刷卡权限，乘到该单有权限的楼层不同于取得其它楼层权限。本次具体开门或扶门事件的持续时间不同于器件在整个授权时段必然持续敞开；后者仍须独立机制，前者核对实际操作及是否与已确认限制互斥。只给授权却没有实际开门条件，不能自动判可通行。信息先分投递、接收、持有与显示：改变密码、退出再登录或停止后续授权，不当然删除此前已接收的信息；原载体已确认的计时显示不等于又收到新推送，不因授权变化就另要求已收信息的存在授权。若声称新消息继续抵达、持久访问已撤销资源、静态复制品继续刷新，或与明确销毁规则互斥，仍核对所声称效果的独立机制；不凭普通信息留存授权这些额外效果。';
function bodySourceBoundaryParagraphs(content:string) {
  return content.split(/\n\s*\n/).map((text,index)=>({id:'B'+(index+1),content:text.trim()})).filter(row=>row.content);
}
export function bodySourceBoundaryCatalog(content:string,requiredIds:readonly string[]=[]) {
  // Whole-body cross-paragraph targets are distinct from the first paragraph.
  if(requiredIds.includes('B0'))return [{id:'B0',content}];
  const rows=bodySourceBoundaryParagraphs(content).filter(row=>needsSourceBoundaryReview(row.content)||requiredIds.includes(row.id));
  return rows.length||!needsSourceBoundaryReview(content)?rows:[{id:'B0',content}];
}
export function remapBodySourceBoundaryTargets(previous:string,current:string,targets:readonly {id:string;content:string}[]) {
  if(targets.some(row=>row.id==='B0'||row.content===previous))return ['B0'];
  const convert=(row:{id:string;content:string})=>({...row,id:'body-'+row.id.slice(1)});
  return remapSourceBoundaryUnits(bodySourceBoundaryParagraphs(previous).map(convert),bodySourceBoundaryParagraphs(current).map(convert),targets.map(convert)).map(id=>'B'+id.slice(5));
}
export function bodySourceBoundaryReviewPrompt(rows:Array<{id:string;content:string}>,context:string,outline:string,content:string) {
  return sourceBoundaryReviewPrompt(content,JSON.stringify(sourceEvidenceCatalog(context)),outline)
    +SOURCE_BOUNDARY_OBSERVATION_SCOPE_DIRECTIVE+SOURCE_BOUNDARY_AUTHORITY_SCOPE_DIRECTIVE
    +'\n【不能用作机制basisRef的未来计划编号】'+JSON.stringify(sourceEvidenceCatalog(context).filter(source=>hasFutureGoalEvidence({basisRef:source.id},context)).map(source=>({id:source.id,path:source.path})))
    +'\n【服务端固定正文风险清单】'+JSON.stringify(rows)
    +SOURCE_INFERENCE_SCOPE_DIRECTIVE
    +'\n只返回JSON:{"checks":[{"id":"实际id","status":"supported|gap|conflict|unknown","basisRef":"实际S编号，可多个","origin":"body|chapter_plan","outlineEvidence":"仅章纲也有同一错误时引用实际章纲连续原文，其它为空","reason":"实际条件和仍未排除的关键反例"}]}。每个id恰好一条；正文及来源引文由服务器按id和basisRef绑定，不能用一处正常描述代替全清单。basisRef只选本次目录中实际存在的编号，允许覆盖本条真实机制所需的多个来源；每个编号恰好一次，不返回拼接的basisEvidence。来源原文由服务器绑定，所有来源仍逐项核对角色，不得引用未来计划授权机制。';
}
export function validateBodySourceBoundaryReview(value:any,rows:Array<{id:string;content:string}>,context:string,outline:string) {
  const errors:string[]=[],findings:string[]=[],sourceConflicts:string[]=[];
  const checks=value?.checks;
  if(!Array.isArray(checks)||checks.length!==rows.length||new Set(checks.map(row=>row?.id)).size!==rows.length||checks.some(row=>!rows.some(item=>item.id===row?.id)))errors.push('正文来源边界必须逐项覆盖实际id，不能遗漏、重复或替换清单');
  for(const item of rows) {
    const received=bindSourceEvidence(Array.isArray(checks)?checks.find(row=>row?.id===item.id):undefined,context);
    const checked=validateSourceBoundaryReview(received?{...received,evidence:item.content}:undefined,item.content,context,outline);
    errors.push(...checked.errors.map(error=>item.id+'：'+error));findings.push(...checked.findings);sourceConflicts.push(...checked.sourceConflicts);
    const mismatch=received?.status==='supported'?exclusiveClaimReviewMismatch(item.content,received.reason):null;
    if(mismatch)findings.push(mismatch+' | 正文: '+item.content+' | 评审依据: '+received.reason);
  }
  return {verified:!errors.length,errors,findings,sourceConflicts};
}
export function outlineSourceBoundaryReviewPrompt(rows:Array<{id:string;[key:string]:any}>,context:string) {
  // The caller owns the fixed targets, including earlier reported targets.
  // Re-scanning here silently dropped corrected rows before their recheck.
  const catalog=rows.map(row=>({id:row.id,content:String(row.content??'')}));
  return sourceBoundaryReviewPrompt('本次审查对象是下列尚未执行的章纲，而非正文。',JSON.stringify(sourceEvidenceCatalog(context)),'')
    +'\n【仅供理解目标，不能列入机制basisRef的未来计划】'+JSON.stringify(sourceEvidenceCatalog(context).filter(source=>hasFutureGoalEvidence({basisRef:source.id},context)).map(source=>({id:source.id,path:source.path})))+'。这些目标仍须保留，但结果不能给手段授权；即使混引其它正常行动也不能证明反锁、排他推论等额外性质。basisRef多个来源用逗号或JSON数组，每个来源须支持所审查的具体机制。'
    +'\n【服务端固定章纲清单】'+JSON.stringify(catalog)
    +sourceInferenceScopeDirective(catalog.map(row=>row.content).join('\n'))
    +SOURCE_BOUNDARY_OBSERVATION_SCOPE_DIRECTIVE
    +SOURCE_BOUNDARY_AUTHORITY_SCOPE_DIRECTIVE
    +(catalog.some(row=>priorInferenceSource(row,context))?'\n开章stateBefore中的排他性推断属于人物在前章已经取得的认知。supported须同时引用紧邻前章currentNarratives的实际S编号与不超过400字的连续basisEvidence，对照前章是否已经排除其它路径；世界背景中客观存在唯一窗口，不等于人物已知或已排除其它路径。只得到嫌疑或排不掉其它路径时，不能判已锁定唯一结论。':'')
    +'\n针对清单每个id恰好返回一条checks，不遗漏、不合并，不将计划中的结果当能力来源。核对该句中的实际机制声称，即使它位于字数理由、亮点或情绪说明中，也不能只评价字段用途或字数而忽略排他性、能力或权限断言。evidence、outlineEvidence、origin及来源原文由服务器按实际id和basisRef绑定，不复述。只输出JSON:{"checks":[{"id":"实际id","status":"supported|gap|conflict|unknown","basisRef":"实际S编号","reason":"具体能力边界与结果"}]}。basisRef须是本次提供的实际编号，所选来源必须对应这项机制，不用字数标准或另一正常行动代替。';
}
export function validateOutlineSourceBoundaryReview(value:any,rows:Array<{id:string;[key:string]:any}>,context:string) {
  const catalog=rows.map(row=>({id:row.id,content:String(row.content??'')})),checks=value?.checks;
  const errors:string[]=[],findings:string[]=[];
  if(!Array.isArray(checks)||checks.length!==catalog.length||new Set(checks.map(row=>row?.id)).size!==catalog.length
    ||checks.some(row=>!catalog.some(item=>item.id===row?.id))) errors.push('章纲来源边界专项必须逐项覆盖实际id，不能遗漏、重复或替换清单');
  for(const item of catalog){const received=bindSourceEvidence(Array.isArray(checks)?checks.find(row=>row?.id===item.id):undefined,context);
    // This protocol owns the target quotation. Model-added fields from a JSON
    // recovery must not replace the id-bound original or change its origin.
    const row=received?{...received,origin:'chapter_plan',evidence:item.content,outlineEvidence:item.content}:undefined;
    if(!row||row.origin!=='chapter_plan'){errors.push(item.id+'缺少章纲来源核对');continue;}
    const checked=validateSourceBoundaryReview(row,item.content,context,item.content);
    const mismatch=row.status==='supported'?exclusiveClaimReviewMismatch(item.content,row.reason):null;
    if(mismatch)checked.sourceConflicts.push(mismatch+' | 评审依据: '+row.reason);
    const prior=priorInferenceSource(item,context);
    if(row.status==='supported'&&prior){
      const sources=sourceEvidenceCatalog(context);
      const refs=sourceReferenceList(row.basisRef);
      if(!refs.some(ref=>sources.some(source=>source.id===ref&&source.path.startsWith(prior.path)))
        ||typeof row.basisEvidence!=='string'||row.basisEvidence.length>400
        ||!prior.segments.some((segment:string)=>resolveQualityEvidence(segment,row.basisEvidence).verified))
        checked.errors.push('前序认知缺少紧邻前章的具体依据：世界背景或人物未来计划不能证明开章时已锁定排他结论；须引用前章实际已知与未排除条件。');
    }
    errors.push(...checked.errors.map(error=>item.id+'：'+error));
    findings.push(...checked.sourceConflicts.map(finding=>item.id+'：'+finding));
  }
  if(errors.some(error=>error.includes('来源角色错误：未来结局计划'))){
    const unavailable=sourceEvidenceCatalog(context).filter(source=>hasFutureGoalEvidence({basisRef:source.id},context)).map(source=>({id:source.id,path:source.path}));
    errors.push('本次未来计划编号不能举证机制或要求恢复旧方法：'+JSON.stringify(unavailable));
    errors.push('【同源未来方案判据】'+CROSS_STAGE_REVIEW_POLICY);
  }
  return {verified:!errors.length,errors,findings};
}
/** For collection only. The aggregate still uses the complete-catalog validator. */
export function validateOutlineSourceBoundaryPartialReview(value:any,rows:Array<{id:string;[key:string]:any}>,context:string) {
  const checks=value?.checks;
  if(!Array.isArray(checks)||!checks.length||checks.some(check=>!rows.some(row=>row.id===check?.id))) {
    return {verified:false,errors:['来源清单为空或含未知编号'],findings:[]};
  }
  return validateOutlineSourceBoundaryReview(value,rows.filter(row=>checks.some(check=>check.id===row.id)),context);
}
export type SourceQualityAxis = typeof SOURCE_QUALITY_AXES[number];
export interface SourceQualityRow {
  status: 'supported' | 'gap' | 'conflict' | 'not_applicable' | 'unknown';
  evidence: string;
  basisSource?: 'body' | 'chapter_plan' | 'context';
  basisEvidence?: string;
  reason: string;
  claimChecks?: {ref:string;status:'consistent'|'conflict'|'new_information'|'not_prior'|'unknown';basisEvidence:string;reason:string}[];
}
export interface SourceQualityAudit {
  version: 1;
  checks: Record<SourceQualityAxis, SourceQualityRow>;
}
function priorChapterEvidence(context: string | undefined): {required:boolean;content:string;historical:string} {
  try {
    const data = JSON.parse(context || '{}');
    const full = (Array.isArray(data.previousChapter) ? data.previousChapter : []).filter((row: any) => row.complete === true && typeof row.content === 'string');
    return { required: Number(data.meta?.chapterIndex) > 1 || full.length > 0 || !!data.recentChapters?.length || data.meta?.truncation?.includes('previousChapter'),
      content: full.map((row: any) => row.content).join('\n'), historical: (Array.isArray(data.historicalChapters)?data.historicalChapters:[]).filter((row:any)=>row.complete===true&&typeof row.content==='string').map((row:any)=>row.content).join('\n') };
  } catch { return { required: false, content: '', historical: '' }; }
}
export function continuityPriorEvidenceAnchors(context:string) {
  let data:any;try{data=JSON.parse(context||'{}');}catch{return [];}
  let index=0;
  return [...(Array.isArray(data.previousChapter)?data.previousChapter:[]),...(Array.isArray(data.historicalChapters)?data.historicalChapters:[])].filter(row=>row.complete===true&&typeof row.content==='string').flatMap((row,chapter)=>row.content.split(/\n\s*\n/).filter((text:string)=>text.trim()).map((text:string)=>({id:'prior:p'+(++index),text:text.trim(),chapter,chapterIndex:row.chapter_index})));
}
function continuityClaimPriorSource(evidence:string,prior:{content:string;historical:string}) {
  const historical = /上回|上次|以前|曾经|当初|先前|此前|之前|第一次|首次|上面写着|原话|当时|昨天|昨日|昨夜|昨晚|前天|前日|前一天|那天|那晚/.test(evidence);
  const currentState = /现在|此刻|当前|眼下|如今|此时/.test(evidence);
  return historical && !currentState ? prior.content+'\n\n'+prior.historical : prior.content;
}
export function materializeContinuityNewInformationEvidence(checks:any,content:string) {
  if(!Array.isArray(checks))return checks;
  const claims=continuityClaimCatalog(content);
  return checks.map(check=>{
    const claim=claims.find(row=>row.ref===check?.ref);
    return claim&&check.status==='new_information'&&!resolveQualityEvidence(claim.evidence,check.basisEvidence).verified
      ?{...check,basisEvidence:claim.evidence}:check;
  });
}
export function continuityCitationRepairPrompt(checks:any[],refs:string[],content:string,context:string) {
  return '仅定位已返回连续性判断的前章引文，不重新评审、不改正文、状态、理由或其它条目。不能手抄、改标点或补引号。'
    +'\n【待定位声称与原判断】'+JSON.stringify(continuityClaimCatalog(content).filter(row=>refs.includes(row.ref)).map(row=>({...row,check:checks.find(check=>check.ref===row.ref)})))
    +'历史章仅核对明确回溯的旧事件或原话；当前状态仍以紧邻前章为准，旧状态不能覆盖新状态。\n【已保存前序实际段落编号】'+JSON.stringify(continuityPriorEvidenceAnchors(context))
    +'\n只返回JSON:{"repairs":[{"ref":"指定C编号","basisAnchorIds":["实际prior:p编号"]}]}。每个指定编号一条，选1至4个连续段落共同覆盖原判断的事实，不能跨段拼接；确无依据返回空数组，服务器保持未完成，不补造证据。';
}
export function applyContinuityCitationRepairs(checks:any[],refs:string[],value:any,context:string) {
  const anchors=continuityPriorEvidenceAnchors(context),rows=value?.repairs;
  if(!Array.isArray(rows)||rows.length!==refs.length||new Set(rows.map(row=>row.ref)).size!==refs.length||rows.some(row=>!refs.includes(row.ref)))throw Error('前章引文补丁必须且仅覆盖点名条目');
  return checks.map(check=>{
    if(!refs.includes(check.ref))return check;
    const ids=rows.find(row=>row.ref===check.ref)?.basisAnchorIds;
    if(!Array.isArray(ids)||!ids.length||ids.length>4||new Set(ids).size!==ids.length)throw Error(check.ref+'前章引文未定位');
    const indices=ids.map(id=>anchors.findIndex(anchor=>anchor.id===id));
    if(indices.some((index,i)=>index<0||i>0&&(index!==indices[i-1]+1||anchors[index].chapter!==anchors[indices[i-1]].chapter)))throw Error(check.ref+'前章依据编号无效或跨段拼接');
    return {...check,basisEvidence:indices.map(index=>anchors[index].text).join('\n\n')};
  });
}
/** Aggregate only actual independently returned claim judgments, not the main
 * review's unsupported PASS. Validation still checks every quote and member. */
export function continuityAuditFromClaims(checks: SourceQualityRow['claimChecks'], content: string, context: string): SourceQualityRow {
  const catalog=continuityClaimCatalog(content),prior=priorChapterEvidence(context);
  const conflict=Array.isArray(checks)?checks.find(check=>check.status==='conflict'&&catalog.some(claim=>claim.ref===check.ref)):undefined;
  const unresolved=!Array.isArray(checks)||checks.length!==catalog.length||new Set(checks.map(check=>check.ref)).size!==catalog.length
    ||checks.some(check=>check.status==='unknown'||!catalog.some(claim=>claim.ref===check.ref));
  const reference=conflict||(Array.isArray(checks)?checks.find(check=>check.status==='consistent'):undefined);
  const claim=catalog.find(claim=>claim.ref===reference?.ref)||catalog[0];
  return {status:conflict?'conflict':unresolved?'unknown':'supported',evidence:claim?.evidence||'',basisSource:'context',
    basisEvidence:reference?.basisEvidence||prior.content,
    reason:conflict?.reason||(unresolved?'独立前序核对清单尚有缺项或未知结论':'独立前序核对逐项返回相符或新增信息，仍须验证全部来源与覆盖'),claimChecks:checks};
}
export function validateSourceQualityReview(audit: unknown, readerGoals: unknown, content: string, sources: Record<string, string>) {
  const errors = readerGoalReviewIssues(readerGoals, content, '当前正文');
  const findings: string[] = [];
  const value = audit as SourceQualityAudit | undefined;
  if (value?.version !== 1 || !value.checks || typeof value.checks !== 'object') {
    errors.push('六项源头审查缺少version=1及checks，不能以综合高分代替');
    return { verified: false, errors, findings, readerGoals: null };
  }
  for (const axis of SOURCE_QUALITY_AXES) {
    const row = value.checks[axis];
    if (!row || !['supported', 'gap', 'conflict', 'not_applicable', 'unknown'].includes(row.status)
      || typeof row.reason !== 'string' || row.reason.trim().length < 8 || typeof row.evidence !== 'string') {
      errors.push(`${axis}缺少明确状态、正文证据和至少8字理由`);
      continue;
    }
    const prior = axis === 'continuity' ? priorChapterEvidence(sources.context) : null;
    if (prior?.required) {
      const catalog=continuityClaimCatalog(content),checks=row.claimChecks;
      if(catalog.length && (!Array.isArray(checks)||checks.length!==catalog.length||new Set(checks.map(check=>check.ref)).size!==catalog.length)) {
        errors.push('continuity未逐项核对固定前序声称清单，不能以单条正确引文证明全章连贯');
      }
      for(const claim of catalog) {
        const check=Array.isArray(checks)?checks.find(check=>check.ref===claim.ref):undefined;
        if(!check||!['consistent','conflict','new_information','not_prior','unknown'].includes(check.status)||typeof check.reason!=='string'||check.reason.trim().length<8
          ||check.status==='unknown'||check.status==='not_prior'&&claim.requiresPrior
          ||check.status==='new_information'&&!resolveQualityEvidence(claim.evidence,check.basisEvidence).verified
          ||!['not_prior','new_information'].includes(check.status)&&!resolveQualityEvidence(continuityClaimPriorSource(claim.evidence,prior),check.basisEvidence).verified) {
          errors.push(claim.ref+'前序声称缺少实际前章对照依据');continue;
        }
        if(check.status==='conflict') findings.push('【前序声称·'+claim.ref+'】'+check.reason+' | 正文: '+claim.evidence+' | 前章: '+check.basisEvidence);
        if(check.status==='consistent'&&claimLocationTokens(claim.evidence).some(token=>!check.basisEvidence.includes(token)))
          errors.push(claim.ref+'前序声称的通过证据未覆盖明确房间或楼层，不能只证明同一行为的另一半');
      }
    }
    if (row.status === 'unknown') {
      errors.push(`${axis}必要核对尚未完成：${row.reason}`);
      continue;
    }
    const evidence = resolveQualityEvidence(content, row.evidence);
    if (row.status !== 'not_applicable' && !evidence.verified
      || row.status === 'not_applicable' && row.evidence && !evidence.verified) {
      errors.push(`${axis}证据无法定位本次正文`);
      continue;
    }

    if (prior?.required && row.status === 'supported'
      && (row.basisSource !== 'context' || !resolveQualityEvidence(prior.content+'\n\n'+prior.historical, row.basisEvidence).verified)) {
      errors.push('continuity通过缺少已保存前序完整正文的逐字依据，不能用当前章或章纲自证跨章连贯');
      continue;
    }
    if (prior?.required && row.status === 'not_applicable') {
      errors.push('continuity已有前章，不能以不适用跳过跨章核对');
      continue;
    }
    if (row.status === 'gap' || row.status === 'conflict') {
      const source = row.basisSource === 'body' ? content
        : row.basisSource === 'chapter_plan' || row.basisSource === 'context' ? sources[row.basisSource] : '';
      const basis = row.basisSource==='context'?resolveSourceContextEvidence(source||'',row.basisEvidence):resolveQualityEvidence(source || '', row.basisEvidence);
      if (!basis.verified) {
        errors.push(`${axis}缺口或冲突缺少明确来源的前提证据`);
        continue;
      }
      findings.push(`【源头核对·${axis}】${row.reason} | 正文: ${evidence.quote} | 前提(${row.basisSource}): ${basis.quote}`);
    }
  }
  return { verified: errors.length === 0, errors, findings,
    readerGoals: errors.length ? null : readerGoals as ReaderGoalReview };
}

/** Output schema only; public quality semantics are injected through Registry. */
export function sourceQualityReviewContract(): string {
  return '另返回sourceQualityAudit:{version:1,checks:{' + SOURCE_QUALITY_AXES.map(axis =>
    `${axis}:{status:"supported|gap|conflict|not_applicable|unknown",evidence:"当前正文连续逐字原文",basisSource:"body|chapter_plan|context",basisEvidence:"gap/conflict对应的必要前提连续原文",reason:"至少8字具体核对与影响"}`,
  ).join(',') + '}}。六项必须逐项返回；not_applicable说明实际不适用原因，unknown表示必要依据尚未核实，不能伪造supported；gap/conflict只报影响当前行动理解或已声称结果的缺口，不要求补无关细节。chapter_plan只引用本次显示章纲，context只引用本次显示上下文。'
    + CONTINUITY_EVIDENCE_CONTRACT
    + '另返回readerGoals:{click,completion,sharing,immersion}，各项为{status:"supported|weak|unknown",quote:"本章连续逐字原文，unknown可为空",reason:"至少8字说明本阶段成立机制、薄弱处或未验证部分"}。正文阶段只评本章实际体验，不把未来计划、总分和未写结局当已兑现；weak/unknown保留真实阅读倾向，不伪造高倾向；不预测实际读者转化率。';
}
import { causalEvidenceAnchors } from './causal-review';

export interface SourceCitationTarget { key: string; axis: SourceQualityAxis; field: 'evidence' | 'basisEvidence'; source: string }
export function invalidSourceQualityCitations(audit: SourceQualityAudit, content: string, sources: Record<string,string>): SourceCitationTarget[] {
  if(audit?.version!==1 || !audit.checks) return [];
  return SOURCE_QUALITY_AXES.flatMap(axis=>{
    const row=audit.checks[axis];const targets:SourceCitationTarget[]=[];
    if(!row || !['supported','gap','conflict','not_applicable'].includes(row.status) || typeof row.reason!=='string' || row.reason.trim().length<8 || typeof row.evidence!=='string')return targets;
    if((row.status!=='not_applicable'||row.evidence) && !resolveQualityEvidence(content,row.evidence).verified) targets.push({key:`source:${axis}:evidence`,axis,field:'evidence',source:'body'});
    const prior=axis==='continuity'?priorChapterEvidence(sources.context):null;
    if(prior?.required && row.status==='supported' && prior.content
      && (row.basisSource!=='context'||!resolveQualityEvidence(prior.content+'\n\n'+prior.historical,row.basisEvidence).verified)) {
      // A missing/wrong source is not a citation typo. Re-evaluate the verdict;
      // a quote-only repair must not fabricate a premise for an existing PASS.
      return targets;
    }
    if((row.status==='gap'||row.status==='conflict') && ['body','chapter_plan','context'].includes(row.basisSource||'') && !(row.basisSource==='context'?resolveSourceContextEvidence(sources.context||'',row.basisEvidence):resolveQualityEvidence(row.basisSource==='body'?content:sources[row.basisSource!]||'',row.basisEvidence)).verified) targets.push({key:`source:${axis}:basisEvidence`,axis,field:'basisEvidence',source:row.basisSource!});
    return targets;
  });
}
export function applySourceQualityCitationRepairs(audit:SourceQualityAudit, targets:SourceCitationTarget[], rows:unknown, content:string,sources:Record<string,string>):SourceQualityAudit {
  if (!Array.isArray(rows)) return audit;
  let checks = audit.checks;
  for (const target of targets) {
    const matches = rows.filter(row => row?.key === target.key);
    if (matches.length !== 1) continue;
    const quote = resolveCitationAnchor(matches[0].anchorId, target.source, content, sources);
    if (!quote) continue;
    if (checks === audit.checks) checks = {...audit.checks};
    checks[target.axis] = {...checks[target.axis], [target.field]: quote};
  }
  return checks === audit.checks ? audit : {...audit, checks};
}
