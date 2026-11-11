export type SupportedStoryType = 'short_story' | 'long_novel';

/**
 * SupportedStoryType 的值清单 —— DTO 校验唯一来源。
 * 不含 script：script 没有「作品总字数」口径，不属于本文件管辖。
 */
export const SUPPORTED_STORY_TYPE_IDS: readonly SupportedStoryType[] = ['short_story', 'long_novel'];

/** Planning range: the lower bound is advisory for prose; quality takes priority. */
export const CHAPTER_WORD_RANGE = { min: 3_000, max: 5_000 } as const;

/** A short chapter still requires full event, causality and prose review.
 * The planning range max is not a hard prose cap: a rich chapter may exceed
 * target+500, and only the split threshold forces the chapter to be split. */
export function isChapterBodyLengthAcceptable(
  words: number,
  range: { min?: number; max: number } = CHAPTER_WORD_RANGE,
): boolean {
  const floor = range.min ?? CHAPTER_WORD_RANGE.min;
  const splitLimit = chapterSplitThreshold({ min: floor });
  return Number.isInteger(words) && words >= floor && words <= splitLimit;
}

/** 首稿生成验收：正文不得低于 targetWords-500。超出目标不判失败——
 * 剧情完整丰富时允许更长，只有超过单章拆分阈值才应拆章；上限由
 * isChapterBodyLengthAcceptable 与拆分检查负责。 */
export function isChapterWordCountOnTarget(words: number, target: number, tolerance = 500): boolean {
  return Number.isInteger(words) && Number.isInteger(target) && target > 0
    && Number.isFinite(tolerance) && tolerance >= 0
    && words >= target - tolerance;
}

/**
 * 单章事件量超过"两章各自下限之和 + 余量"时，应与章纲一起拆成两章。
 * 默认 10%：3000 × 2 × 1.10 = 6600，拆后每章约 3300，刚过下限且留缓冲。
 * 15%/20% 会得到 6900/7200，拆得更晚、单章更长；需要更长章节时再调高。
 */
export const CHAPTER_SPLIT_MARGIN = 0.10;

export function chapterSplitThreshold(
  range: { min: number } = CHAPTER_WORD_RANGE,
  margin: number = CHAPTER_SPLIT_MARGIN,
): number {
  const safeMargin = Number.isFinite(margin) && margin >= 0 ? margin : CHAPTER_SPLIT_MARGIN;
  return Math.round(2 * range.min * (1 + safeMargin));
}

/** 距离 targetWords 还差多少字；已达标或超出目标时为 0。 */
export function chapterWordCountShortfall(words: number, target: number, tolerance = 500): number {
  if (!Number.isInteger(target) || target <= 0) return 0;
  const floor = Math.max(0, target - Math.max(0, Math.floor(tolerance)));
  return Math.max(0, floor - Math.max(0, Math.trunc(Number(words) || 0)));
}

/** 全端共用的作品总字数口径。章节字数由目标平台基准决定。 */
export const STORY_TARGET_WORD_RANGES = {
  short_story: { min: 8_000, max: 35_000 },
  long_novel: { min: 100_000, max: null },
} as const;

export function isStoryTargetWordsInRange(value: number, storyType: SupportedStoryType): boolean {
  if (!Number.isInteger(value)) return false;
  const range = STORY_TARGET_WORD_RANGES[storyType];
  return value >= range.min && (range.max === null || value <= range.max);
}

export function canFitTargetWordsToChapters(
  targetWords: number,
  storyType: SupportedStoryType,
  chapterRange: { min: number; max: number },
): boolean {
  return isStoryTargetWordsInRange(targetWords, storyType)
    && Number.isInteger(chapterRange.min)
    && Number.isInteger(chapterRange.max)
    && chapterRange.min > 0
    && chapterRange.max >= chapterRange.min
    && Math.ceil(targetWords / chapterRange.max) <= Math.floor(targetWords / chapterRange.min);
}

export function storyTargetWordsRequirement(
  storyType: SupportedStoryType,
  _chapterRange: { min: number; max: number },
): string {
  return storyType === 'short_story'
    ? '短篇目标总字数必须在8,000–35,000字之间，并能按目标平台的章节规则规划。'
    : '长篇目标总字数不得少于100,000字，并能按目标平台的章节规则规划。';
}
