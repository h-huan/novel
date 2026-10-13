import {causalEvidenceAnchors} from '../modules/writing-quality/causal-review';
import { parseWholeReviewJson } from './review-json';
import { temporalNumbers } from './temporal-review-coverage';
import { SOURCE_QUALITY_AXES, CONTINUITY_EVIDENCE_CONTRACT } from '../modules/writing-quality/source-quality-review';

const flags = ['pass','outlineAligned','continuityPassed','characterPassed','worldPassed','timelinePassed','prosePassed'];
const arrays = ['requiredEvents','missingRequiredItems','contradictions','advisories','sourceConflicts','evidence'];
const object = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v);

export function parseChapterAlignmentReview(raw: string): {value: any; errors: string[]; invalidPaths: string[]} {
  let value: any;
  try { value = parseWholeReviewJson(raw); } catch {
    return {value:null,errors:['章节评审完整JSON语法无效或不是单个对象，不能从内部片段提取局部对象代替完整报告'],invalidPaths:[]};
  }
  // Known report fields may be misplaced inside sourceQualityAudit. Relocate only
  // actual supplied values; their semantic evidence still goes through all gates.
  const ownershipErrors:string[]=[];
  if(object(value.sourceQualityAudit)) for(const key of ['readerGoals','evidence']) {
    if(!Object.prototype.hasOwnProperty.call(value.sourceQualityAudit,key)) continue;
    const nested=value.sourceQualityAudit[key];
    if(Object.prototype.hasOwnProperty.call(value,key)&&JSON.stringify(value[key])!==JSON.stringify(nested)) {
      ownershipErrors.push(key+'在顶层与源头审查中出现相互不同的重复值，不能猜测采用哪份');continue;
    }
    if(!Object.prototype.hasOwnProperty.call(value,key))value[key]=nested;
    delete value.sourceQualityAudit[key];
  }
  const paths: string[] = [];
  for(const key of flags) if(typeof value[key] !== 'boolean') paths.push(key);
  for(const key of arrays) if(!Array.isArray(value[key])) paths.push(key);
  if(!object(value.sourceQualityAudit) || value.sourceQualityAudit.version !== 1 || !object(value.sourceQualityAudit.checks)) paths.push('sourceQualityAudit');
  else for(const axis of SOURCE_QUALITY_AXES) if(!object(value.sourceQualityAudit.checks[axis])) paths.push('sourceQualityAudit.checks.'+axis);
  if(!object(value.readerGoals)) paths.push('readerGoals');
  else for(const key of ['click','completion','sharing','immersion']) if(!object(value.readerGoals[key])) paths.push('readerGoals.'+key);
  if(!object(value.causalAudit)) paths.push('causalAudit');
  return {value,invalidPaths:paths,errors:[...ownershipErrors,...paths.map(key=>key==='prosePassed'?'正文语言验收缺少prosePassed明确结论':key+'缺少必要结构，章节评审合同未完成')]};
}

/** Patch only invalid paths on a parsed report; keep every previously valid finding. */
export function mergeChapterReviewContractCorrection(original: ReturnType<typeof parseChapterAlignmentReview>, corrected: any) {
  if(!original.value) return corrected;
  if(Array.isArray(corrected?.corrections)) {
    const rows=corrected.corrections;
    if(rows.length!==original.invalidPaths.length||new Set(rows.map((row:any)=>row?.path)).size!==rows.length
      ||rows.some((row:any)=>!original.invalidPaths.includes(row?.path)||!Object.prototype.hasOwnProperty.call(row,'value')))
      throw new Error('评审协议补丁必须且仅覆盖点名缺失字段，不能修改合法质量结论');
    const patch:any={};
    for(const row of rows){let node=patch;const keys=row.path.split('.');for(const key of keys.slice(0,-1))node=node[key]??=( {} );node[keys[keys.length-1]]=row.value;}
    corrected=patch;
  }
  const result = structuredClone(original.value);
  for(const path of original.invalidPaths) {
    const keys=path.split('.'); let target=result, source=corrected;
    for(const key of keys.slice(0,-1)) { target=target[key]; source=source?.[key]; }
    const last=keys[keys.length-1]; target[last]=structuredClone(source?.[last]);
  }
  return result;
}

export function chapterReviewContractCorrectionDirective(original: ReturnType<typeof parseChapterAlignmentReview>) {
  if(!original.value||!original.invalidPaths.length)return '上一轮完整JSON语法或字段归属无效。按当前正文与原合同重新返回单个完整评审JSON。不得复制损坏JSON里的无名称对象、placeholder或错层结构；不能从内部片段拼成通过报告。';
  return '只返回JSON补丁 {"corrections":[{"path":"点名字段路径","value":"该字段实际完整审查结果，保持合同规定类型"}]}。必须且仅覆盖以下路径：'+JSON.stringify(original.invalidPaths)
    +'。不要重发完整报告，不修改其它已合法字段、质量判断或正文。只纠正结构；缺实际证据须保留unknown或阻断，不用空数组或默认通过填平真实问题。';
}

/** One valid JSON example with every named axis; never used as a runtime fallback. */
export function chapterAlignmentReviewContract(catalog:ReturnType<typeof chapterObligationCatalog>=[]): string {
  const sourceRow={status:'supported|gap|conflict|not_applicable|unknown',evidence:'当前正文连续逐字原文',basisSource:'body|chapter_plan|context',basisEvidence:'gap/conflict及跨章continuity supported对应的必要前提连续原文',reason:'至少8字解释'};
  const goal={status:'supported|weak|unknown',quote:'本章连续逐字原文；unknown可为空',reason:'至少8字说明本阶段阅读机制'};
  return '只输出单个合法JSON对象，以下骨架字段全部必填，示例布尔值须按本次证据判断，状态从竖线选项中选择一个；不能输出未命名对象或多个JSON。六项源头审查逐项返回，gap/conflict须有前提证据，not_applicable须说明原因，unknown保留未验证；chapter_plan/context仅引用本次实际显示资料。readerGoals保留真实weak/unknown，不把未来计划当本章效果。'+CONTINUITY_EVIDENCE_CONTRACT+'结构如下：'+JSON.stringify({
    ...(catalog.length?{obligationChecks:catalog.map(row=>({ref:row.ref,status:'covered|missing|unknown',evidence:[],reason:'按完整行动与结果核对实际正文'}))}:{}),
    pass:true,requiredEvents:[{event:'必需事件点',covered:true,evidence:'正文逐字证据'}],missingRequiredItems:[],
    contradictions:[{kind:'story|language',summary:'有逐字证据的非时间冲突或语言问题；无问题返回空数组'}],advisories:[],sourceConflicts:[],
    outlineAligned:true,continuityPassed:true,characterPassed:true,worldPassed:true,timelinePassed:true,prosePassed:true,
    causalAudit:{status:'evaluated|not_applicable',reason:'至少8字解释',transitions:[{actionEvidence:'正文行动引文',resultEvidence:'正文结果引文',basisSource:'body',bridgeEvidence:'正文已发生的成立条件；gap可空',status:'supported|gap',reason:'至少8字解释'}]},
    sourceQualityAudit:{version:1,checks:Object.fromEntries(SOURCE_QUALITY_AXES.map(axis=>[axis,axis==='continuity'?{...sourceRow,claimChecks:[]}:sourceRow]))},
    readerGoals:Object.fromEntries(['click','completion','sharing','immersion'].map(key=>[key,goal])),evidence:['最多4条总体逐字证据'],
  });
}


/** The reviewer cannot shrink the author's fixed action/result inventory. */
export function chapterObligationCatalog(outline:string) {
 const sources:string[]=[];
 for(const match of outline.matchAll(/(?:^|\n)人物行动[:：][ \t]*([^\n]+)/g)) {
  const text=match[1].trim();let depth=0,start=-1,quoted=false,escaped=false;const rows:string[]=[];
  for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}if(c==='"'){quoted=true;continue;}if(c==='{'){if(!depth)start=i;depth++;}if(c==='}'&&depth){depth--;if(!depth){const raw=text.slice(start,i+1);try{const value=JSON.parse(raw);if(typeof value.action==='string'&&typeof value.result==='string')rows.push(raw);}catch{}}}}
  sources.push(...(rows.length?rows:[text]));
 }
 return [...new Set(sources)].map((source,index)=>({ref:'M'+(index+1),source}));
}
export function chapterObligationReviewDirective(catalog:ReturnType<typeof chapterObligationCatalog>) {
 return '服务端固定的必需行动与结果清单：'+JSON.stringify(catalog)+'。这份清单不能由requiredEvents摘要替代、合并或删项。每条仅按该条实际指定的行动主体、地点、先后与结果核对，不把其它条目的限定条件移过来。仅在该条章纲明确指定到达某楼层时，到门口、准备上楼、他人上楼不能证明指定角色已到达；未指定楼层的条目不得凭空加本人到达楼层的条件。计划和意愿不当作实际完成。正文可以自然口语化，不要求照抄章纲或解释流程。额外返回obligationChecks，每个M编号恰一条：{"ref":"固定M编号","status":"covered|missing|unknown","evidence":["正文连续逐字证据，可用多条真实原文共同证明完整行动与结果"],"reason":"至少12字说明全条已发生或缺了什么"}。missing允许无引文但必须指出具体缺失，unknown保留审查未完成；covered证据须覆盖关键地点和结果限定，不能只证明同一条中的另一半。';
}
function floorValues(text:string) {
 const number=(value:string)=>temporalNumbers(value+'分钟').durations[0]?.minutes;
 const values=[...text.matchAll(/(?<!这|那|另)(地下|负)?([零〇一二两三四五六七八九十百千\d]+)(?:楼|层)/g)].map(match=>(match[1]?'-':'')+number(match[2]));
 // A stopped elevator's displayed floor is a location, even without repeating 楼/层.
 for(const paragraph of text.split(/\n\s*\n|\n/)) {
  if(!/电梯/.test(paragraph)||!/(?:停稳|停下|门开)/.test(paragraph)||/(?:如果|要是|假如|等到|准备|计划|想象|将会|会停|还没|未停|没有停|不停)/.test(paragraph))continue;
  for(const match of paragraph.matchAll(/(?:数字|楼层(?:显示)?)(?:跳到|停在|定在|显示为?)[:： ]*([零〇一二两三四五六七八九十百千\d]+)(?![\d分钟秒])/g))values.push(String(number(match[1])));
 }
 return values;
}

export function validateChapterObligationReview(rows:any,catalog:ReturnType<typeof chapterObligationCatalog>,body:string) {
 const errors:string[]=[],findings:string[]=[];
 if(!catalog.length)return {errors,findings};
 if(!Array.isArray(rows))return {errors:['章纲固定行动审查未返回逐项结果'],findings};
 const seen=new Set<string>();
 for(const row of rows){const source=catalog.find(entry=>entry.ref===row?.ref);if(!source||seen.has(row.ref)){errors.push((source?row.ref:'未知编号')+'章纲固定行动审查含未知或重复编号');continue;}seen.add(row.ref);
  if(!['covered','missing','unknown'].includes(row.status)||typeof row.reason!=='string'||row.reason.trim().length<12||!Array.isArray(row.evidence)){errors.push(row.ref+'缺少行动覆盖状态与实际依据');continue;}
  if(row.evidence.some((quote:any)=>typeof quote!=='string'||!quote.trim()||!body.includes(quote))){errors.push(row.ref+'行动证据不能定位实际正文');continue;}
  if(row.evidence.length&&!row.evidence.some((quote:string)=>quote.trim().length>=4)){errors.push(row.ref+'行动证据缺少可核对上下文；简短应答或结果须与实际行动共同举证');continue;}
  if(row.status==='unknown'){errors.push(row.ref+'行动覆盖尚未验证：'+row.reason);continue;}
  if(row.status==='missing'){findings.push('【章纲固定行动】'+row.reason+' | 章纲来源: '+source.source);continue;}
  if(!row.evidence.length){errors.push(row.ref+'缺少已发生的行动证据');continue;}
  const proofFloors=floorValues(row.evidence.join('\n'));if(floorValues(source.source).some(floor=>!proofFloors.includes(floor)))errors.push(row.ref+'行动证据未覆盖章纲明确楼层；到楼下或他人到达不能代替本人到达');
 }
 for(const entry of catalog)if(!seen.has(entry.ref))errors.push('章纲固定行动漏项：'+entry.ref);
 return {errors,findings};
}

export function chapterObligationWritingContext(outline:string) {
 const catalog=chapterObligationCatalog(outline);
 return catalog.length?'\n\n【本章已确认行动数据·生成与验收共用】\n'+JSON.stringify(catalog):'';
}
export function chapterObligationRepairTargets(rows:any,errors:string[],catalog:ReturnType<typeof chapterObligationCatalog>) {
 if(!Array.isArray(rows))return catalog.map(row=>row.ref);
 return [...new Set(errors.flatMap(error=>error.match(/M\d+/g)||[]))].filter(ref=>catalog.some(row=>row.ref===ref));
}
export function mergeChapterObligationRepairs(original:any,targets:string[],repaired:any) {
 if(!Array.isArray(repaired)||repaired.length!==targets.length||new Set(repaired.map(row=>row?.ref)).size!==targets.length||repaired.some(row=>!targets.includes(row?.ref)))throw new Error('固定行动协议纠错必须完整覆盖点名行，不能修改其它行');
 return [...(Array.isArray(original)?original.filter(row=>!targets.includes(row.ref)):[]),...repaired];
}

/** Preserve actual reviewer text across the accepted string and named-object shapes. */
export function chapterMissingItemTexts(rows:any[]) {
 return rows.map(row=>{
  if(typeof row==='string')return row.trim();
  if(row&&typeof row==='object')for(const key of ['summary','reason','item','event'])if(typeof row[key]==='string'&&row[key].trim())return row[key].trim();
  throw new Error('章节缺失项没有可定位的问题文字，不能把对象转成无意义字符串');
 }).filter(Boolean);
}

export function chapterObligationEvidencePrompt(rows:any,targets:string[],errors:string[],body:string) {
 return '\n原正文证据目录：'+JSON.stringify(causalEvidenceAnchors(body,{}))+'\n禁止重写或转录引文，只选择目录body段落编号，用evidenceAnchorIds数组返回，可多段共同支持。简短应答和结果段可与实际行动上下文共同选择，不能只用孤立短句证明完整行动。仅引文定位错误时保留该行原status与reason，不重新评判其它行。错误：'+JSON.stringify(errors)+'\n原检查：'+JSON.stringify(rows)+'\n只返回JSON:{"obligationChecks":[{"ref":"点名M编号","status":"covered|missing|unknown","reason":"实际语义依据","evidenceAnchorIds":["body:p原文编号"]}]}';
}
export function materializeChapterObligationEvidence(rows:any,original:any,errors:string[],body:string) {
 if(!Array.isArray(rows))throw new Error('固定行动纠错没有返回检查行');
 const anchors=new Map(causalEvidenceAnchors(body,{}).map(row=>[row.id,row.text]));
 return rows.map(row=>{
  if(!Array.isArray(row?.evidenceAnchorIds)||row.evidenceAnchorIds.some((id:any)=>!anchors.has(id)))throw new Error('固定行动纠错包含不存在的正文证据编号');
  const old=Array.isArray(original)?original.find(old=>old.ref===row.ref):undefined;
  const ownErrors=errors.filter(error=>error.includes(row.ref));
  const quoteOnly=old&&ownErrors.length&&ownErrors.every(error=>error===row.ref+'行动证据不能定位实际正文');
  return {...(quoteOnly?old:row),evidence:row.evidenceAnchorIds.map((id:string)=>anchors.get(id))};
 });
}
