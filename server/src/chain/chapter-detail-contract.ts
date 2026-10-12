import { validateChapterEndingBoundary, validateForeshadowingBoundary } from './adaptive-narrative';

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
