import { validateChapterEndingBoundary, validateForeshadowingBoundary } from './adaptive-narrative';

/** Normalize only a single-object provider envelope; content and schema
 * completeness remain the responsibility of chapterDetailStructureIssues.
 * The root chapter always wins over unrelated nested metadata. */
export function unwrapSingleChapterEnvelope(value:unknown):unknown {
 if(!value||typeof value!=='object'||Array.isArray(value))return value;
 const obj=value as Record<string,unknown>;
 const shape=(row:Record<string,unknown>)=>['title','content','scenes','characterActions','targetWords']
   .some(field=>Object.prototype.hasOwnProperty.call(row,field));
 if(shape(obj))return obj;
 for(const field of ['data','result','outline']){
  const child=obj[field];
  if(child&&typeof child==='object'&&!Array.isArray(child)
    &&shape(child as Record<string,unknown>))return child;
 }
 return obj;
}

/** The chapter prompt requests ONE identified chapter. When the provider
 * returns a list, prefer a unique explicit chapter number, then a unique
 * frozen title; never silently pick an unrelated first item. This is only
 * envelope selection, not a semantic-quality shortcut. */
export function unwrapExpectedChapterEnvelope(value:unknown,chapterNumber:number,expectedTitle:string):unknown {
 const record=(item:unknown):item is Record<string,any>=>!!item&&typeof item==='object'&&!Array.isArray(item);
 const explicitNumber=(item:Record<string,any>):number|null=>{
  const raw=[item.chapterNumber,item.chapterIndex,item.chapter_index,item.chapterNo]
    .find(n=>n!==undefined&&n!==null&&String(n).trim()!=='');
  if(raw===undefined)return null;
  const num=Number(raw);return Number.isSafeInteger(num)?num:NaN;
 };
 const root=record(value)?value:null;
 const titleMatches=(item:Record<string,any>)=>!expectedTitle.trim()
   ||(typeof item.title==='string'&&item.title.trim()===expectedTitle.trim());
 const frozenTitle=expectedTitle.trim();
 // The chapter title is frozen by ChapterPlan. A model paraphrasing it is not
 // a different chapter; keep the content and use the frozen title. Explicitly
 // wrong chapter numbers and ambiguous multi-candidate envelopes still reject.
 const withFrozenTitle=(item:Record<string,any>)=>frozenTitle?{...item,title:frozenTitle}:item;
 const shape=(item:Record<string,any>)=>['content','coreContent','summary','plot','scenes','characterActions']
    .some(key=>Object.prototype.hasOwnProperty.call(item,key));
 if(root&&shape(root)){
  const id=explicitNumber(root);
  if(id!==null&&id!==chapterNumber)return null;
  return withFrozenTitle(root);
 }
 const payload=root?.chapter??root?.chapters??value;
 const raw=Array.isArray(payload)?payload:[payload];
 const candidates=raw.filter(record).map(item=>unwrapSingleChapterEnvelope(item)).filter(record);
 const matchingNumber=candidates.filter(item=>explicitNumber(item)===chapterNumber);
 if(matchingNumber.length===1)return withFrozenTitle(matchingNumber[0]);
 if(matchingNumber.length>1){
  const byTitle=matchingNumber.filter(item=>titleMatches(item));
  if(byTitle.length===1)return withFrozenTitle(byTitle[0]);
  const signatures=new Set(matchingNumber.map(item=>JSON.stringify(item)));
  return signatures.size===1?withFrozenTitle(matchingNumber[0]):null;
 }
 const unnumbered=candidates.filter(item=>explicitNumber(item)===null);
 if(unnumbered.length===1)return withFrozenTitle(unnumbered[0]);
 if(unnumbered.length>1){
  const byTitle=unnumbered.filter(item=>titleMatches(item));
  if(byTitle.length===1)return withFrozenTitle(byTitle[0]);
  // Identical repeated transport envelopes are not separate story proposals.
  const signatures=new Set(unnumbered.map(item=>JSON.stringify(item)));
  return signatures.size===1?withFrozenTitle(unnumbered[0]):null;
 }
 return null;
}

/** The example shown to the model must be valid for the CURRENT chapter.
 * A hardcoded 3500-word example contradicted real 4400-5000-word chapter
 * intervals and caused avoidable schema retries during project creation.
 * This is prompt transport only: content and causal quality still come from
 * the actual chapter and pass the existing strict validator and story Gates. */
export function chapterDetailJsonExample(
 allowedMin:number,allowedMax:number,isFinalChapter:boolean,confirmedTitle?:string,
):string {
 if(!Number.isInteger(allowedMin)||!Number.isInteger(allowedMax)
   ||allowedMin<1||allowedMin>allowedMax)
  throw Error('详细章纲示例的章节字数区间无效');
 const exampleTarget=Math.floor((allowedMin+allowedMax)/2);
 return '\n【JSON结构示例，仅示范字段，不得复制示例内容】'
   +'\n【结构纪律】content 是给正文展开的事件骨架：分条写谁、条件、动作、阻碍/反制、结果，不写环境、心理和对白正文，长度不超过 targetWords 的 30%；scenes 写 location/goal/conflict/outcome 和 3–5 条 beats（谁→条件→动作→遇阻/反制→结果），每场至少一条情绪或关系变化节拍；场景篇幅由正文按冲突强度和信息量自然分配，全章合计落在 targetWords±500。highlights 必须至少有一个真正落地的有效剧情点，写清 type/point/trigger/setup；emotionalTone 写“主导情绪→转折/代价→释放或余味”，不能只写一个情绪词。'
   +JSON.stringify({
     title:typeof confirmedTitle==='string'&&confirmedTitle.trim()?confirmedTitle.trim():'本章标题',targetWords:exampleTarget,
     wordCountReason:'依据本章场景、冲突强度与剩余总字数确定',
     content:'1) 谁→在什么条件→做什么→遇阻或反制→结果\n2) 谁→在什么条件→做什么→遇阻或反制→结果\n3) …（只列事件节拍，不写环境、心理、对白正文）',
     scenes:[
       {location:'场景A地点',goal:'本场目标A',conflict:'本场阻碍A',outcome:'本场结果A',
        beats:['谁→在什么条件→做什么→遇阻/反制→结果','谁→想要什么→被什么挡住→付出或失去什么→判断/关系/处境变化']},
       {location:'场景B地点',goal:'本场目标B',conflict:'本场阻碍B',outcome:'本场结果B',
        beats:['谁→在什么条件→做什么→遇阻/反制→结果','谁→发现什么→如何选择→关系或处境如何变化']},
     ],
     characterActions:[{character:'人物名',action:'本章实际行动',result:'行动结果'}],
     conflicts:[{name:'冲突名',parties:['A','B'],trigger:'触发条件',escalation:'升级路径',resolution:'本章解决程度'}],
     highlights:[{type:'关系变化/代价兑现/悬念揭示等',point:'本章实际落地的有效剧情点',trigger:'本章触发它的具体行动或事件',setup:'前文已有的铺垫'}],
     foreshadowing:[],foreshadowingRecover:[],characterStates:[],
     hook:isFinalChapter?'可留空或填写终章余韵':'只引出下一步动机或障碍',
     emotionalTone:'主导情绪→转折/代价→释放或余味',
   });
}

/** Task-local JSON schema under GEN-005; story completeness is reviewed against ChapterPlan. */
export function chapterDetailStructureIssues(candidate: Record<string, any> | null, context: {
  allowedMin: number;
  allowedMax: number;
  chapterNumber: number;
  totalChapters: number;
}): string[] {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return ['结果不是合法的单章JSON对象'];
  }
  const text = (value: unknown) => typeof value === 'string' && !!value.trim();
  const issues: string[] = [];
  if (!text(candidate.title)) issues.push('缺少title');
  const targetWords = Number(candidate.targetWords);
  if (!Number.isInteger(targetWords) || targetWords < context.allowedMin || targetWords > context.allowedMax) {
    issues.push(`targetWords必须是${context.allowedMin}-${context.allowedMax}之间的整数`);
  }
  if (!text(candidate.wordCountReason)) issues.push('缺少wordCountReason');
  const content = candidate.content || candidate.coreContent || candidate.summary || candidate.plot || candidate['核心内容'];
  if (!text(content)) issues.push('缺少content事件链');
  if (text(content)) {
    // A chapter outline must remain an EVENT SKELETON for later prose expansion.
    // Real production returned 2000-3000-character narrative summaries here; the
    // prose then only paraphrased the outline at the same length instead of
    // expanding planned scenes. Cap the skeleton and send scene detail to scenes.
    const outlineText=String(content);
    const effectiveTarget=Number.isFinite(targetWords)&&targetWords>0?targetWords:context.allowedMax;
    const skeletonMax=Math.max(600,Math.floor(effectiveTarget*0.35));
    const quotedDialogues=(outlineText.match(/[“「『][^”」』\n]{2,}[”」』]/g)||[]).length;
    const expandedProse=outlineText.length>Math.max(1800,Math.floor(context.allowedMax*0.38))
      && quotedDialogues>=10;
    if(expandedProse)issues.push('content疑似已展开成章节对白正文：详细章纲必须概括当前行动、成立条件、各自结果及推进代价；targetWords是以后正文目标，不是本次content篇幅。请收敛为事件链，不删减真实因果与章节职责');
    else if(outlineText.length>skeletonMax)issues.push(`content过长（${outlineText.length}/${skeletonMax}字符）：它是给正文展开的事件骨架，不是正文；请压成“谁→条件→动作→阻碍/反制→结果”的分条节拍，把场景细节放进scenes的goal/conflict/outcome`);
  }
  const scenes = Array.isArray(candidate.scenes) ? candidate.scenes
    : Array.isArray(candidate.mainScenes) ? candidate.mainScenes : [];
  if (!scenes.length) issues.push('scenes必须是非空数组');
  scenes.forEach((scene: any, index: number) => {
    const missing = ['location', 'goal', 'conflict', 'outcome'].filter(field => !text(scene?.[field]));
    if (missing.length) issues.push(`scenes[${index}]缺少${missing.join('/')}`);
    const beats = Array.isArray(scene?.beats) ? scene.beats.filter((beat: unknown) => text(beat)) : [];
    if (beats.length < 2) issues.push(`scenes[${index}]缺少beats（每场至少2条可执行节拍）`);
  });
  const highlights = Array.isArray(candidate.highlights) ? candidate.highlights : [];
  if (!highlights.length) issues.push('highlights必须是非空数组：每章至少一个实际落地的有效剧情点');
  else highlights.forEach((highlight: any, index: number) => {
    const missing = ['type', 'point', 'trigger', 'setup'].filter(field => !text(highlight?.[field]));
    if (missing.length) issues.push(`highlights[${index}]缺少${missing.join('/')}`);
  });
  const emotionalTone = typeof candidate.emotionalTone === 'string' ? candidate.emotionalTone.trim() : '';
  if (!emotionalTone) issues.push('缺少emotionalTone情绪曲线');
  else if (emotionalTone.length < 8 || !/[→>，,；;]/.test(emotionalTone)) {
    issues.push('emotionalTone必须写成情绪曲线（主导情绪→转折/代价→释放或余味），不能只写一个情绪词');
  }
  const actions = candidate.characterActions || candidate['人物行动'];
  if (!Array.isArray(actions) || !actions.length) issues.push('characterActions必须是非空数组');
  else actions.forEach((action: any, index: number) => {
    const missing = ['character', 'action', 'result'].filter(field => !text(action?.[field]));
    if (missing.length) issues.push(`characterActions[${index}]缺少${missing.join('/')}`);
  });
  issues.push(...validateForeshadowingBoundary(
    Array.isArray(candidate.foreshadowing) ? candidate.foreshadowing : [], context.chapterNumber, context.totalChapters,
  ));
  issues.push(...validateChapterEndingBoundary(
    candidate.hook || candidate.nextChapterHook || candidate.nextHook || candidate['下章钩子'],
    context.chapterNumber, context.totalChapters,
  ));
  return issues;
}
