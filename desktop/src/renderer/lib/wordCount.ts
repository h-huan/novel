/**
 * 全平台唯一「正文字数」口径（必须与后端三处保持逐字一致）：
 *   - server chain.controller generatedNarrativeWordCount
 *   - server chapter.service countWords
 *   - server generation-metrics GenerationMetricsService.countWords
 *
 * 口径 = 汉字字符数（含扩展A区）+ 英文单词数。
 * 明确【不计入】：标点符号、阿拉伯数字、空白/换行、Markdown 符号。
 *
 * 历史教训：同一章曾在不同位置出现 3 个不同字数——
 *   编辑器顶部(汉字+英文词) / chapterStore(只数汉字) / 保存载荷(去空白字符数,含标点)。
 * 所有前端位置一律改用本函数，禁止再用 content.length 或 replace(/\s/g,'').length 当字数。
 */

const CJK = /[一-鿿㐀-䶿]/g;
const CJK_GLOBAL = /[一-鿿㐀-䶿]/;

export function countNarrativeWords(text: string | null | undefined): number {
  if (!text) return 0;
  const chinese = (text.match(CJK) || []).length;
  const english = text
    .replace(CJK_GLOBAL, ' ')
    .split(/\s+/)
    .filter((token) => /[a-zA-Z]/.test(token))
    .length;
  return chinese + english;
}

/** 字符数（含标点，仅用于"篇幅字符"类技术提示，不得作为正文字数展示） */
export function countRawChars(text: string | null | undefined): number {
  return text ? text.length : 0;
}

/** 字数状态：空 / 偏短 / 达标 / 偏长（区间来自项目 settings / 大纲 target） */
export function wordRangeStatus(
  words: number,
  range: { min: number; max: number },
): 'empty' | 'short' | 'ok' | 'long' {
  if (words <= 0) return 'empty';
  if (words < range.min) return 'short';
  if (words > range.max) return 'long';
  return 'ok';
}
