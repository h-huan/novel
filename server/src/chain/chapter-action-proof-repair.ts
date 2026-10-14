/** Exactly one local action-proof repair of an uncommitted chapter outline.
 * Reuse existing chapter structure / fact / causal Gates after applying this patch.
 * Never authorize new story identity, world mechanics, chapter count or word budget. */
const ALLOWED_ACTION_FIELDS = new Set([
  'content', 'scenes', 'characterActions', 'conflicts', 'highlights', 'characterStates', 'hook',
]);
export function applyChapterActionProofPatch<T extends Record<string, any>>(chapter: T, proposal: unknown): T {
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) throw new Error('行动因果修复必须返回对象');
  const patch = (proposal as any).patch;
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('行动因果修复必须返回patch对象');
  const keys = Object.keys(patch);
  if (!keys.length || keys.some(key => !ALLOWED_ACTION_FIELDS.has(key))) {
    throw new Error('行动因果修复不得改变已确认故事、世界资料、篇幅和章节身份，只允许本章动作/结果字段');
  }
  for (const key of keys) {
    const value = patch[key];
    if (typeof chapter[key] === 'string') {
      if (typeof value !== 'string' || !value.trim()) throw new Error('行动因果修复文字字段不能为空');
    } else if (Array.isArray(chapter[key])) {
      if (!Array.isArray(value)) throw new Error('行动因果修复不得改变数组字段的结构类型');
    } else if (value === undefined || value === null) {
      throw new Error('行动因果修复不得清空章纲字段');
    }
  }
  return { ...chapter, ...patch };
}
