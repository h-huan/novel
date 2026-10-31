import { validateChapterEndingBoundary, validateForeshadowingBoundary } from './adaptive-narrative';

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
   +JSON.stringify({
     title:typeof confirmedTitle==='string'&&confirmedTitle.trim()?confirmedTitle.trim():'本章标题',targetWords:exampleTarget,
     wordCountReason:'依据本章场景、冲突强度与剩余总字数确定',
     content:'按本章职责顺序概括必要事件链与结果',
     scenes:[{location:'具体地点',goal:'本场目标',conflict:'本场阻碍',outcome:'本场结果'}],
     characterActions:[{character:'人物名',action:'本章实际行动',result:'行动结果'}],
     conflicts:[{name:'冲突名',parties:['A','B'],trigger:'触发条件',escalation:'升级路径',resolution:'本章解决程度'}],
     highlights:[],foreshadowing:[],foreshadowingRecover:[],characterStates:[],
     hook:isFinalChapter?'可留空或填写终章余韵':'只引出下一步动机或障碍',
     emotionalTone:'情绪基调',
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
  const scenes = Array.isArray(candidate.scenes) ? candidate.scenes
    : Array.isArray(candidate.mainScenes) ? candidate.mainScenes : [];
  if (!scenes.length) issues.push('scenes必须是非空数组');
  scenes.forEach((scene: any, index: number) => {
    const missing = ['location', 'goal', 'conflict', 'outcome'].filter(field => !text(scene?.[field]));
    if (missing.length) issues.push(`scenes[${index}]缺少${missing.join('/')}`);
  });
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
