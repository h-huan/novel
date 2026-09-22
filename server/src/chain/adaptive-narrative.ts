export type NarrativeBeatRole =
  | 'setup'
  | 'discovery'
  | 'pressure'
  | 'development'
  | 'recovery'
  | 'payoff'
  | 'resolution'
  | 'aftermath';

export interface ChapterResponsibilityInput {
  title?: string;
  function?: string;
  responsibility?: string;
}

export interface NarrativeBeatPlanItem {
  chapter: number;
  title: string;
  function: string;
  responsibility: string;
  beatRole: NarrativeBeatRole;
  beatLabel: string;
  isFinalChapter: boolean;
}

const ROLE_LABELS: Record<NarrativeBeatRole, string> = {
  setup: '建立人物、目标或异常',
  discovery: '发现信息并改变理解',
  pressure: '施加压力并迫使选择',
  development: '推进事件或关系',
  recovery: '承接后果并调整状态',
  payoff: '兑现已铺设的冲突或承诺',
  resolution: '完成当前故事目标并收束',
  aftermath: '呈现结果、余波与人物落点',
};

/**
 * Derives a chapter beat from its actual responsibility. Position is used only
 * for the opening and ending boundary; there is deliberately no modulo based
 * "every N chapters" payoff rule.
 */
export function inferNarrativeBeat(
  chapter: ChapterResponsibilityInput,
  index: number,
  total: number,
): NarrativeBeatRole {
  const text = `${chapter.function || ''} ${chapter.title || ''} ${chapter.responsibility || ''}`.toLowerCase();
  const isFinal = total > 0 && index === total - 1;
  if (isFinal) {
    return /余波|尾声|后日谈|善后|aftermath|epilogue/.test(text) ? 'aftermath' : 'resolution';
  }
  if (/高潮|爆发|兑现|决战|反转|揭露|胜利|climax|payoff|burst/.test(text)) return 'payoff';
  if (/回落|喘息|休整|恢复|余波|善后|recovery|aftermath/.test(text)) return 'recovery';
  if (/发现|调查|线索|揭示|认知|discovery|reveal/.test(text)) return 'discovery';
  if (/危机|逼迫|升级|受阻|困境|压力|pressure|escalation/.test(text)) return 'pressure';
  if (/开篇|建立|引入|铺垫|setup|opening/.test(text) || index === 0) return 'setup';
  return 'development';
}

export function buildNarrativeBeatPlan(chapters: ChapterResponsibilityInput[]): NarrativeBeatPlanItem[] {
  return chapters.map((chapter, index) => {
    const beatRole = inferNarrativeBeat(chapter, index, chapters.length);
    return {
      chapter: index + 1,
      title: String(chapter.title || ''),
      function: String(chapter.function || ''),
      responsibility: String(chapter.responsibility || ''),
      beatRole,
      beatLabel: `叙事节拍·${ROLE_LABELS[beatRole]}`,
      isFinalChapter: index === chapters.length - 1,
    };
  });
}

export function validateForeshadowingBoundary(
  raw: unknown,
  chapterNo: number,
  totalChapters: number,
): string[] {
  const items = Array.isArray(raw) ? raw.filter(Boolean) : [];
  if (chapterNo === totalChapters && items.length > 0) {
    return ['终章不得新增需要后续章节回收的伏笔；应回收既有伏笔或留下不依赖续章的余韵'];
  }
  const issues: string[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      issues.push('foreshadowing条目必须是对象');
      continue;
    }
    const recovery = Number((item as any).plannedRecoveryChapter);
    if (!Number.isInteger(recovery) || recovery <= chapterNo || recovery > totalChapters) {
      issues.push(`新增伏笔的plannedRecoveryChapter必须晚于第${chapterNo}章且不超过全书第${totalChapters}章`);
    }
  }
  return [...new Set(issues)];
}

export function validateChapterEndingBoundary(
  hook: unknown,
  chapterNo: number,
  totalChapters: number,
): string[] {
  const value = String(hook || '').trim();
  if (chapterNo < totalChapters) return value ? [] : ['非终章缺少hook'];
  return /下一章|下章|后续章|待续/.test(value)
    ? ['终章hook不得承诺不存在的下一章；可留空或填写不依赖续章的余韵']
    : [];
}
