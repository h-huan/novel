export type IdeaStoryType = 'short_story' | 'long_novel';

/**
 * 灵感发现的 hook 生成契约必须与 IdeaAppealGateService 使用同一口径。
 * 这里是生成侧唯一文案来源，避免 Prompt 要求和 Gate 判据再次漂移。
 */
export const SHORT_IDEA_HOOK_MIN_SIGNALS = 3;

export function ideaHookRequirement(storyType: IdeaStoryType): string {
  const storyFirst = '先构思一个值得读的完整故事题材，再把最有吸引力的起始事件压缩成 hook；Gate 字段只是验收证据，不是创作清单，禁止为了命中关键词拼装题材或硬造超常规则。所谓异常/信息差也不等于超能力，可以来自现实利益冲突、关系反常、制度困境、隐藏事实或超常现象';
  if (storyType === 'short_story') {
    return `35-80字；${storyFirst}；hook 本字段必须直接写出异常/信息差、明确代价或时限、主角立即采取的具体行动，关系锚点自然存在时一并写入；异常/压力/行动/关系四类有效信号至少命中 ${SHORT_IDEA_HOOK_MIN_SIGNALS} 类，不能把行动或代价只藏在 description 里`;
  }
  return `35-80字；${storyFirst}；直接写出现实压力或代价、主角下一步具体行动，并留下可持续追问；不能只有设定说明`;
}

export function ideaRecoveryDirective(
  storyType: IdeaStoryType,
  reasons: readonly string[],
  count: number,
): string {
  const uniqueReasons = Array.from(new Set(reasons.map(item => String(item || '').trim()).filter(Boolean))).slice(0, 10);
  if (!uniqueReasons.length) return '';
  return `\n上一批未通过项：${uniqueReasons.join('；')}。本轮只补足缺少的 ${count} 项，不复写已通过项。失败原因只用于指出“故事哪里不成立”，不是让你逐项补关键词。每个补生题材必须先重新形成完整的【人物处境→核心冲突→主动选择→后果升级→有效反转/兑现】因果链，再把证据写入对应字段；若问题只是 hook 没把故事中已经存在的异常/压力/行动/关系表达出来，才重写 hook 本字段；若反转、二阶后果、不可替换性或生活期盼本身不成立，必须重想故事因果，不能只补一句说明。这里的“异常”不要求超能力或怪规则，现实利益冲突、关系反常、制度困境和隐藏事实都可以成立，禁止为了过 Gate 把普通故事强行改成超常机制；“开篇承诺脱节”时，hook 或 description 前 260 字必须明确承接 uniquePoint/coreConflict 中已经存在的具体故事事件、关系或生活载体，而不是复制术语。${storyType === 'short_story' ? `短篇 hook 仍必须满足“四类信号至少 ${SHORT_IDEA_HOOK_MIN_SIGNALS} 类”，但这是表达验收，不是四项创作配方。` : ''}`;
}
