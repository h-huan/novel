export type SupportedStoryType = 'short_story' | 'long_novel';

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
