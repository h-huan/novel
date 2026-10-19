import { resolveQualityEvidence } from '../modules/writing-quality/quality-issue';
import { createHash } from 'node:crypto';
import { temporalNumbers } from './temporal-review-coverage';

/** Source observations for generation and review, not a ban on valid time advancement. */
export function chapterLengthDigitalTimeValues(content: string): string[] {
  const values=temporalNumbers(content);
  return [...new Set([...values.countdowns.map(read=>`timer:${read.seconds}`), ...values.clocks.filter(clock=>/[:：]/.test(clock.original)).map(clock=>`clock:${clock.minutes}`)])];
}


export const CHAPTER_LENGTH_INSERTION_LIMIT = 12;
export const CHAPTER_LENGTH_INSERTION_STATE_CONTRACT = '插入段必须同时满足入口与出口：previous/candidatePrevious是已发生的状态，following/candidateFollowing是原稿即将继续的动作。不能把前邻已完成动作重演，也不能提前执行后邻动作。修订某个重复动作时仍逐项核对后邻，不以另一种状态矛盾替代重复。新增中的沉默、停止、结束、离开等叙述只覆盖实际写出的时段，不能替整个后续场景封口；后邻仍有同一角色的对话、观察或行动时，不宣称这些活动此后终止。可写暂时反应、新选择与必要后果，保持后邻动作仍能自然发生，不为衔接补解释。';

/** Positions belong to the current normalized draft, never to model-reported coordinates. */
export function chapterLengthInsertionAnchors(content: string) {
  const positions = [0, ...Array.from(content.matchAll(/\n\s*\n/g), match => match.index! + match[0].length)];
  const revision = createHash('sha256').update(content).digest('hex').slice(0, 12);
  return positions.filter(position => position < content.length && content.slice(position).trim()).map(position => ({
    id: `p-${revision}-${position}`, position,
    preview: content.slice(position).split(/\n\s*\n/)[0].slice(0, 90),
    previous: content.slice(0,position).trimEnd().split(/\n\s*\n/).slice(-2).join('\n\n'),
    following: content.slice(position).split(/\n\s*\n/).slice(0,2).join('\n\n'),
  }));
}

/** Bound the position catalogue to the same patch budget; retain the complete draft separately. */
export function chapterLengthInsertionChoices(content: string) {
  const anchors = chapterLengthInsertionAnchors(content);
  if (anchors.length <= CHAPTER_LENGTH_INSERTION_LIMIT) return anchors;
  return Array.from({ length: CHAPTER_LENGTH_INSERTION_LIMIT }, (_, index) =>
    anchors[Math.round(index * (anchors.length - 1) / (CHAPTER_LENGTH_INSERTION_LIMIT - 1))]);
}

/** Insert inside the chapter; original prose and its ending stay byte-identical. */
export function applyChapterLengthInsertions(content: string, value: unknown): string {
  if ((value as any)?.blocked === true) {
    const reason = (value as any)?.reason;
    throw new Error(`篇幅与场景承载不足，保留来源原稿：${typeof reason === 'string' && reason.trim() ? reason.trim() : '未提供有效补写依据'}`);
  }
  const insertions = (value as any)?.insertions;
  if (!Array.isArray(insertions) || !insertions.length || insertions.length > CHAPTER_LENGTH_INSERTION_LIMIT) throw new Error(`篇幅补足必须返回1–${CHAPTER_LENGTH_INSERTION_LIMIT}个章内插入补丁`);
  const edits: Array<{position:number;text:string}> = [];
  const anchors = new Set<string>();
  const permitted = new Map(chapterLengthInsertionAnchors(content).map(anchor => [anchor.id, anchor.position]));
  for (const insertion of insertions) {
    const before = insertion?.before, text = insertion?.text;
    if (typeof text !== 'string' || !text.trim())
      throw new Error('章内插入须提供唯一原文锚点与非空新增文本');
    let position: number;
    if (insertion.anchorId !== undefined) {
      const selected = permitted.get(insertion.anchorId);
      if (selected === undefined) throw new Error('章内插入位置编号无效或不属于当前正文');
      position = selected;
      if (before !== undefined && (typeof before !== 'string' || !before.trim() || !content.slice(position).startsWith(before)))
        throw new Error('章内插入编号与原文锚点不一致');
    } else {
      if (typeof before !== 'string' || !before.trim()) throw new Error('章内插入须提供原文锚点或当前位置编号');
      position = content.indexOf(before);
      if (position < 0 || content.indexOf(before,position+before.length)>=0) throw new Error('章内插入锚点缺失或重复');
    }
    // Insert before an existing complete paragraph, never append past the ending.
    if (position !== 0 && !/\n\s*\n$/.test(content.slice(0,position))) throw new Error('篇幅补写只能插在既有段落之前');
    const key = String(position);
    if (anchors.has(key)) throw new Error('章内插入位置重复');
    anchors.add(key);edits.push({position,text:text.trim()+'\n\n'});
  }
  let result=content;
  for(const edit of edits.sort((a,b)=>b.position-a.position)) result=result.slice(0,edit.position)+edit.text+result.slice(edit.position);
  return result;
}

const CHAPTER_LENGTH_REVIEW_DIRECTIVE = '核对章内扩写的插入点，不能改写正文或新增事件。previous/following是原稿相邻段落，candidatePrevious/candidateFollowing是整批合并后的候选邻居（可能含其它新增段落）。同时核对两组，不把其它插入段当既定故事事实。逐项比较新增段落与两组邻居：是否把同一动作再次搬演，是否使时间、地点、人物所知、物件或权限状态倒退，是否只复述已呈现的信息。正常心理、必要解释、新选择后果和有意义的重复不算缺陷。sourceText是完整原稿，只作为本章事实与重复信息的对照，不局限于相邻两段。环境持续、再次感受、观察视角变化、动作准备后再完成、正常回顾不自动等于状态倒退；动作重演须证明同一已完成动作无理由再次执行，状态冲突须证明实际互斥。信息重复单独判断，不要求它同时构成动作或状态矛盾：新增换感官、换词或解释已知事实而没有改变判断、行动条件、人物选择、关系变化或有效情绪体验，按information_repeat给出新增与原稿证据。supported的reason须说明新增的具体叙事作用，不能仅说无矛盾；自然停顿、必要定位和有新作用的呼应可保留，不逐段强求情节转折。去往/继续前往不等于已经到达；同一行程延续、路线确认或回顾不能当成再次出发。只有两处提到同一现象不构成证据。不能凭词频判断。状态改变本身不是矛盾。起步后再等灯或刹停、拿起后放下、离开后再停留、打开后关闭通常是正常先后推进，不要求为读者能自然理解的过渡加解释。state_conflict必须在conflictProof填写stateRelation=simultaneous_incompatible或impossible_transition，并用transitionBasis说明两段为什么确实声称同一时间不可并存，或有哪些已确认条件使前后转换不可能；如果可正常转换就不能报状态冲突，不以缺少一段过程解释判错。真正的仍然未变声明、不可逆事实或明确时间地点约束仍保留核对。同一连续动作里，新增先完成下楼或进门，后邻又写尚未取外套或尚未动身，属于已有动作先后约束；不得凭空补出正文未写的折返、重来或回溯来否认冲突。停下再走、拿起再放下等已呈现的自然过渡仍保留。引用须为新增文本与邻近原文中的连续逐字片段。未知不得判通过。仅返回JSON：{"checks":[{"id":"I1","status":"supported|conflict|unknown","addedEvidence":"新增段落逐字引文","sourceEvidence":"邻近原文逐字引文","reason":"说明衔接或实际冲突"}]}。conflict必须附conflictProof:{"kind":"action_replay|state_conflict|information_repeat","sourcePhase":"completed|ongoing|planned|static|reexecute|unknown","addedPhase":"reexecute|completed|continue|advance|recall|static|unknown","stateRelation":"state_conflict必填simultaneous_incompatible或impossible_transition","transitionBasis":"state_conflict必填：原文中明确成立的同一时间或前后约束","sourceState":"引文实际成立的状态","addedState":"新增引文实际成立的状态","completionEvidence":"action_replay必填先发生动作的完成证据；原稿先发生只能取previous，新增先发生取text，不可拿following当插入之前已完成，其它类型可空","incompatibility":"具体互斥或无新增信息的依据"}。action_replay须证明实际顺序：原稿先完成再被新增重演，用sourcePhase=completed、addedPhase=reexecute及previous完成证据；新增先完成而后邻原稿再次执行，用addedPhase=completed、sourcePhase=reexecute及新增完成证据和following重演证据。不能将行程方向当完成证据；重复表达与状态倒退分开判，不强制删除必要呼应。证据不足标unknown。全部位置各一项，不核对平台比例，不重审整章。\n';
export const CHAPTER_LENGTH_REVIEW_BATCH_SIZE = 4;

interface ChapterLengthReviewItem {
 id:string; text:string; sourcePosition:number; previous:string; following:string; candidatePrevious:string; candidateFollowing:string;
}
interface ChapterLengthReviewData {items:ChapterLengthReviewItem[];sourceText:string;prompt:string;}
export function chapterLengthReviewInput(content: string, proposal: unknown):ChapterLengthReviewData {
  // Structural validation owns IDs, paragraph boundaries and the immutable source.
  const candidate = applyChapterLengthInsertions(content, proposal);
  const anchors = new Map(chapterLengthInsertionAnchors(content).map(a => [a.id,a.position]));
  const edits = ((proposal as any).insertions as any[]).map(edit=>({...edit,position:edit.anchorId !== undefined ? anchors.get(edit.anchorId)! : content.indexOf(edit.before)}));
  const items = edits.map((edit,index) => {
    const position = edit.anchorId !== undefined ? anchors.get(edit.anchorId)! : content.indexOf(edit.before);
    const previous = content.slice(0,position).trimEnd().split(/\n\s*\n/).slice(-2).join('\n\n');
    const following = content.slice(position).split(/\n\s*\n/).slice(0,2).join('\n\n');
    const start=position+edits.filter(other=>other.position<position).reduce((sum,other)=>sum+other.text.trim().length+2,0);
    const candidatePrevious=candidate.slice(0,start).trimEnd().split(/\n\s*\n/).slice(-2).join('\n\n');
    const candidateFollowing=candidate.slice(start+edit.text.trim().length+2).split(/\n\s*\n/).slice(0,2).join('\n\n');
    return {id:'I'+(index+1),text:edit.text.trim(),sourcePosition:position,previous,following,candidatePrevious,candidateFollowing};
  });
  return {items,sourceText:content,prompt:chapterLengthReviewPrompt(items,content)};
}

function chapterLengthReviewPrompt(items:ReturnType<typeof chapterLengthReviewInput>['items'],sourceText:string):string {
  return CHAPTER_LENGTH_REVIEW_DIRECTIVE+JSON.stringify({sourceText,items});
}
function chapterLengthSourceTexts(item:ReturnType<typeof chapterLengthReviewInput>['items'][number],sourceText='') {
  return [item.previous,item.following,item.candidatePrevious,item.candidateFollowing,sourceText];
}
/** A quotation proves presence, not that the action had already completed. */
export function chapterLengthConflictProofErrors(value:any,items:ReturnType<typeof chapterLengthReviewInput>['items'],sourceText='') {
 const errors:Array<{id:string;reason:string}>=[];
 for(const row of value?.checks||[]) {
  if(row?.status!=='conflict')continue;
  const item=items.find(i=>i.id===row.id);if(!item)continue;
  const p=row.conflictProof;let reason='';
  if(!p||!['action_replay','state_conflict','information_repeat'].includes(p.kind)
    ||!['completed','ongoing','planned','static','reexecute','unknown'].includes(p.sourcePhase)
    ||!['reexecute','completed','continue','advance','recall','static','unknown'].includes(p.addedPhase)
    ||['sourceState','addedState','incompatibility'].some(k=>typeof p[k]!=='string'||p[k].trim().length<(k==='incompatibility'?8:2))
    ||p?.sourcePhase==='unknown'||p?.addedPhase==='unknown')reason='冲突缺少阶段、实际状态与成立条件，不能仅凭引文存在判正文错误';
  else if(p.kind==='action_replay'&&!((p.sourcePhase==='completed'&&p.addedPhase==='reexecute'
    &&[item.previous,item.candidatePrevious,sourceText.slice(0,item.sourcePosition)].some(t=>resolveQualityEvidence(t,String(p.completionEvidence||'')).verified))
    ||(p.addedPhase==='completed'&&p.sourcePhase==='reexecute'
    &&resolveQualityEvidence(item.text,String(p.completionEvidence||'')).verified
    &&[item.following,item.candidateFollowing,sourceText.slice(item.sourcePosition)].some(t=>resolveQualityEvidence(t,String(row.sourceEvidence||'')).verified))))reason='动作重演必须证明原动作已完成及新增再次执行；进行、计划、回顾或无完成证据不能冒充重演';
  if(!reason&&p.kind==='state_conflict'&&(!['simultaneous_incompatible','impossible_transition'].includes(p.stateRelation)||typeof p.transitionBasis!=='string'||p.transitionBasis.trim().length<12))reason='状态冲突须证明同一时间状态互斥或前后转换不可能；正常先后变化不是矛盾';
  if(reason)errors.push({id:row.id,reason});
 }
 return errors;
}
export function mergeChapterLengthEvidenceCorrection(original:any,errors:ReturnType<typeof chapterLengthConflictProofErrors>,patch:any) {
 if(!Array.isArray(patch?.checks)||patch.checks.length!==errors.length||new Set(patch.checks.map((r:any)=>r?.id)).size!==errors.length
   ||patch.checks.some((r:any)=>!errors.some(e=>e.id===r?.id)))throw new Error('扩写证据纠正必须且仅覆盖点名位置');
 return {...original,checks:original.checks.map((r:any)=>patch.checks.find((p:any)=>p.id===r.id)||r)};
}
export function chapterLengthReviewFindings(value: any, items: ReturnType<typeof chapterLengthReviewInput>['items'],sourceText='') {
  if(!Array.isArray(value?.checks)||value.checks.length!==items.length) throw new Error('扩写衔接评审未完成：须覆盖全部插入位置');
  const seen=new Set<string>();const failures:Array<{id:string;status:string;reason:string}>=[];
  for(const row of value.checks){
    const item=items.find(item=>item.id===row?.id);
    if(!item||seen.has(row.id)) throw new Error('扩写衔接评审位置重复或无效');seen.add(row.id);
    if(!['supported','conflict','unknown'].includes(row.status)||typeof row.reason!=='string'||!row.reason.trim()) throw new Error('扩写衔接评审结论不完整');
    const added=typeof row.addedEvidence==='string'?row.addedEvidence.trim():'';
    const source=typeof row.sourceEvidence==='string'?row.sourceEvidence.trim():'';
    if(!added||!source||!resolveQualityEvidence(item.text,added).verified||!chapterLengthSourceTexts(item,sourceText).some(text=>resolveQualityEvidence(text,source).verified)) throw new Error('扩写衔接评审引文无法定位插入文本与邻近原文');
    if(row.status!=='supported') failures.push({id:row.id,status:row.status,reason:row.reason+' | 新增: '+added+' | 原文: '+source});
  }
  const proofErrors=chapterLengthConflictProofErrors(value,items,sourceText);if(proofErrors.length)throw new Error('扩写衔接评审证据合同未完成：'+proofErrors.map(e=>e.id+' '+e.reason).join('；'));
  return failures;
}

export function validateChapterLengthReview(value:any,items:ReturnType<typeof chapterLengthReviewInput>['items'],sourceText='') {
 const findings=chapterLengthReviewFindings(value,items,sourceText);
 if(findings.length)throw new Error('扩写衔接未通过，保留来源原稿：'+findings.map(f=>f.id+' '+f.reason).join('；'));
}
export function applyChapterLengthReviewRepairs(proposal:any,findings:ReturnType<typeof chapterLengthReviewFindings>,value:any) {
 if(findings.some(f=>f.status!=='conflict'))throw new Error('扩写未知项不能当成正文缺陷修订');
 if(!Array.isArray(value?.repairs)||value.repairs.length!==findings.length)throw new Error('扩写修订必须仅覆盖已证实冲突位置');
 const targets=new Set(findings.map(f=>f.id));const replacements=new Map<string,string>();
 for(const row of value.repairs){if(!targets.has(row?.id)||replacements.has(row.id)||typeof row.text!=='string'||!row.text.trim())throw new Error('扩写修订位置重复、越界或为空');replacements.set(row.id,row.text.trim());}
 return {...proposal,insertions:proposal.insertions.map((edit:any,index:number)=>replacements.has('I'+(index+1))?{...edit,text:replacements.get('I'+(index+1))}:edit)};
}

/** All verdicts need located evidence; supported rows can also contain transcription errors. */
export function chapterLengthReviewEvidenceErrors(value:any,items:ReturnType<typeof chapterLengthReviewInput>['items'],sourceText='') {
 const errors=chapterLengthConflictProofErrors(value,items,sourceText);
 for(const row of value?.checks||[]) {
  const item=items.find(item=>item.id===row?.id);if(!item)continue;
  if(!resolveQualityEvidence(item.text,row.addedEvidence).verified||!chapterLengthSourceTexts(item,sourceText).some(text=>resolveQualityEvidence(text,row.sourceEvidence).verified)) {
   const old=errors.find(error=>error.id===row.id);if(old)old.reason+='；引文无法定位插入文本与邻近原文';else errors.push({id:row.id,reason:'引文无法定位插入文本与邻近原文'});
  }
 }
 return errors;
}
export function chapterLengthEvidenceAnchors(items:ReturnType<typeof chapterLengthReviewInput>['items'],sourceText='') {
 return [...items.flatMap(item=>['text','previous','following','candidatePrevious','candidateFollowing'].flatMap(field=>String(item[field as keyof typeof item]||'').split(/\n\s*\n/).map((text,index)=>({id:item.id+':'+field+':p'+(index+1),itemId:item.id,field,text:text.trim()})).filter(row=>row.text))),
  ...sourceText.split(/\n\s*\n/).map((text,index)=>({id:'source:p'+(index+1),itemId:'source',field:'source',text:text.trim()})).filter(row=>row.text)];
}
export function materializeChapterLengthEvidenceCorrection(original:any,errors:ReturnType<typeof chapterLengthReviewEvidenceErrors>,patch:any,items:ReturnType<typeof chapterLengthReviewInput>['items'],sourceText='') {
 if(!Array.isArray(patch?.checks))throw new Error('扩写证据纠正未返回点名检查');
 const anchors=new Map(chapterLengthEvidenceAnchors(items,sourceText).map(row=>[row.id,row]));
 return {...patch,checks:patch.checks.map((row:any)=>{
  const old=original.checks.find((entry:any)=>entry.id===row.id);const quoteOnly=errors.find(error=>error.id===row.id)?.reason==='引文无法定位插入文本与邻近原文';
  let added=row.addedEvidence,source=row.sourceEvidence,proof=row.conflictProof;
  if(Object.prototype.hasOwnProperty.call(row,'addedAnchorId')||Object.prototype.hasOwnProperty.call(row,'sourceAnchorId')) {
   const a=anchors.get(row.addedAnchorId),s=anchors.get(row.sourceAnchorId);
   if(!a||!s||a.itemId!==row.id||(s.itemId!==row.id&&s.field!=='source')||a.field!=='text'||s.field==='text')throw new Error('扩写纠错证据编号越界或来源不符');
   added=a.text;source=s.text;
   const completionId=proof?.completionAnchorId??row.completionAnchorId;
   if(proof?.completionAnchorId!==undefined&&row.completionAnchorId!==undefined&&proof.completionAnchorId!==row.completionAnchorId)throw new Error('扩写完成证据编号重复且互斥');
   if(proof&&completionId!==undefined) {
    const completion=anchors.get(completionId);if(!completion||(completion.itemId!==row.id&&completion.field!=='source'))throw new Error('扩写完成证据编号越界');
    proof={...proof,completionEvidence:completion.text};
   }
  }
  return quoteOnly?{...old,addedEvidence:added,sourceEvidence:source}:{...row,addedEvidence:added,sourceEvidence:source,conflictProof:proof};
 })};
}

/** Partition already-computed global candidate neighbors; never rebuild a partial candidate. */
export function chapterLengthReviewBatches(input: ReturnType<typeof chapterLengthReviewInput>) {
  const batches: ReturnType<typeof chapterLengthReviewInput>[] = [];
  for (let offset=0; offset<input.items.length; offset+=CHAPTER_LENGTH_REVIEW_BATCH_SIZE) {
    const items=input.items.slice(offset,offset+CHAPTER_LENGTH_REVIEW_BATCH_SIZE);
    batches.push({items,sourceText:input.sourceText,prompt:chapterLengthReviewPrompt(items,input.sourceText)});
  }
  return batches;
}
