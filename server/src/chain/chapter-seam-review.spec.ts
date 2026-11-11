import { expect, it } from 'vitest';
import { buildChapterSeamReviewPrompt, chapterSeamBoundary, chapterSeamContradictions, describeChapterSeamReview, type ChapterSeamBoundary } from './chapter-seam-review';

const boundary: ChapterSeamBoundary = {
  previousTitle: '第2章',
  previousTail: '他下夜班回到住处，把东西放进抽屉。天亮以后，他准备去值班室。',
  previousExitState: '人在住处，物件在抽屉里',
  currentTitle: '第3章',
  currentHead: '天亮了他没有回住处，直接走到值班室门口。',
  currentEntryState: '应从住处出发',
};

it('接受只引用边界原文的直接矛盾，并把它转成可修复的逐字缺陷', () => {
  const value = { consistent: false, contradictions: [{
    previousQuote: '他下夜班回到住处', currentQuote: '他没有回住处',
    conflict: '前章已经回到住处，本章开头写成没有回住处，已完成动作被写成未发生',
  }], warnings: [] };
  expect(describeChapterSeamReview(value, boundary)).toEqual([]);
  expect(chapterSeamContradictions(value)).toEqual([
    '【章节衔接】前章已经回到住处，本章开头写成没有回住处，已完成动作被写成未发生｜前章：“他下夜班回到住处”｜本章：“他没有回住处”',
  ]);
});

it('拒绝不在边界原文中的引文、缺少说明或结论与矛盾数组不一致', () => {
  const notQuoted = { consistent: false, contradictions: [{
    previousQuote: '他回家了', currentQuote: '他没有回家', conflict: '前后不一致的说明',
  }], warnings: [] };
  expect(describeChapterSeamReview(notQuoted, boundary)).toEqual(expect.arrayContaining([
    '第1项前章引文不在提供的结尾原文中',
    '第1项本章引文不在提供的开头原文中',
  ]));
  expect(describeChapterSeamReview({ consistent: false, contradictions: [], warnings: [] }, boundary))
    .toContain('consistent=false时必须给出至少一项逐字矛盾');
  expect(describeChapterSeamReview({ consistent: true, contradictions: [{
    previousQuote: '他下夜班回到住处', currentQuote: '他没有回住处', conflict: '已完成动作被写成未发生',
  }], warnings: [] }, boundary)).toContain('有矛盾时consistent必须为false');
});

it('放行明确的时间跳跃、倒叙和正常离开，不把边界审查变成谜底审查', () => {
  const value = { consistent: true, contradictions: [], warnings: ['本章以倒叙补充前一夜的经过，不是否定前章已完成事实'] };
  expect(describeChapterSeamReview(value, boundary)).toEqual([]);
  const prompt = buildChapterSeamReviewPrompt(boundary);
  expect(prompt).toContain('允许且不算矛盾：明确写出的时间跳跃、倒叙、场景省略、未到期的留白');
  expect(prompt).toContain('前章写已经到达某地，本章从该地离开或仍在该地是连续');
  expect(prompt).toContain('只报告两段原文能逐字引用的直接矛盾');
});

it('边界只取前章结尾和本章开头的固定窗口，不整章传输', () => {
  const chapter = { content: '开'.repeat(2000) + '尾'.repeat(2000) };
  expect(chapterSeamBoundary(chapter, 'head', 100)).toBe('开'.repeat(100));
  expect(chapterSeamBoundary(chapter, 'tail', 100)).toBe('尾'.repeat(100));
  expect(chapterSeamBoundary({ coreContent: '核心内容' }, 'head')).toBe('核心内容');
});
