/** Independent boundary review: only the previous chapter's completed facts at
 * its ending and the current chapter's first claims at its opening. The whole
 * chapter is deliberately not sent; a large fact review already owns internal
 * consistency. This Gate exists because a direct "already returned" vs
 * "never returned" contradiction can survive the per-chapter fact review and
 * only be found by the final cross-stage review, where repair is expensive. */
export interface ChapterSeamBoundary {
  previousTitle: string;
  previousTail: string;
  previousExitState?: string;
  currentTitle: string;
  currentHead: string;
  currentEntryState?: string;
}

export function chapterSeamBoundary(chapter: Record<string, any>, edge: 'head' | 'tail', chars = 1600): string {
  const content = String(chapter?.content || chapter?.coreContent || chapter?.summary || chapter?.plot || '');
  if (!content) return '';
  return edge === 'head' ? content.slice(0, chars) : content.slice(-chars);
}

export function buildChapterSeamReviewPrompt(boundary: ChapterSeamBoundary): string {
  return `你是章节衔接事实审查员。只核对前一章结尾已经完成的事实与本章开头之间是否连续。
【前一章标题】${boundary.previousTitle}
【前一章结尾原文】${boundary.previousTail}
【前一章出口状态】${boundary.previousExitState || '未提供'}
【本章标题】${boundary.currentTitle}
【本章开头原文】${boundary.currentHead}
【本章入口状态】${boundary.currentEntryState || '未提供'}
只判断：边界处已经完成的动作、所在地点、物件归属、人物状态和时间阶段，是否被本章开头写成未发生、相反、换了地点或换了持有人。
允许且不算矛盾：明确写出的时间跳跃、倒叙、场景省略、未到期的留白、人物没有再做某件尚未到期的事。
必须区分“前章已经发生”与“本章尚未发生”：前章写已经到达某地，本章从该地离开或仍在该地是连续；本章写从未到达该地才是矛盾。
只报告两段原文能逐字引用的直接矛盾，不评价文风、不猜测幕后、不要求解释未到期谜底。引文必须逐字来自上方两段边界原文。
只返回 JSON：{"consistent":true|false,"contradictions":[{"previousQuote":"前章逐字片段","currentQuote":"本章逐字片段","conflict":"具体说明哪项已完成事实被写成未发生或相反"}],"warnings":[]}。
没有矛盾时 consistent=true 且 contradictions=[]；有矛盾时 consistent=false 且每项都必须有两段逐字引文和至少8字说明。`;
}

export function describeChapterSeamReview(value: any, boundary: Pick<ChapterSeamBoundary, 'previousTail' | 'currentHead'>): string[] {
  const issues: string[] = [];
  if (!value || typeof value.consistent !== 'boolean') issues.push('consistent必须为布尔值');
  if (!Array.isArray(value?.contradictions)) issues.push('contradictions必须为数组');
  const rows = Array.isArray(value?.contradictions) ? value.contradictions : [];
  rows.forEach((row: any, index: number) => {
    if (!row || typeof row !== 'object') { issues.push(`第${index + 1}项矛盾必须为对象`); return; }
    const previousQuote = typeof row.previousQuote === 'string' ? row.previousQuote.trim() : '';
    const currentQuote = typeof row.currentQuote === 'string' ? row.currentQuote.trim() : '';
    if (!previousQuote || !boundary.previousTail.includes(previousQuote)) issues.push(`第${index + 1}项前章引文不在提供的结尾原文中`);
    if (!currentQuote || !boundary.currentHead.includes(currentQuote)) issues.push(`第${index + 1}项本章引文不在提供的开头原文中`);
    if (typeof row.conflict !== 'string' || row.conflict.trim().length < 8) issues.push(`第${index + 1}项冲突说明至少8字`);
  });
  if (value?.consistent === true && rows.length > 0) issues.push('有矛盾时consistent必须为false');
  if (value?.consistent === false && rows.length === 0) issues.push('consistent=false时必须给出至少一项逐字矛盾');
  if (value?.warnings !== undefined && (!Array.isArray(value.warnings)
    || value.warnings.some((item: unknown) => typeof item !== 'string' || !item.trim()))) {
    issues.push('warnings必须为非空字符串数组；没有建议时返回空数组');
  }
  return issues;
}

/** Reuse the exact boundary quotes in the repair defect list. The local repair
 * still decides the minimal edit; this function never rewrites the chapter. */
export function chapterSeamContradictions(value: any): string[] {
  return (Array.isArray(value?.contradictions) ? value.contradictions : []).flatMap((row: any) => {
    if (!row || typeof row !== 'object') return [];
    const previousQuote = String(row.previousQuote || '').trim();
    const currentQuote = String(row.currentQuote || '').trim();
    const conflict = String(row.conflict || '').trim();
    if (!previousQuote || !currentQuote || !conflict) return [];
    return [`【章节衔接】${conflict}｜前章：“${previousQuote}”｜本章：“${currentQuote}”`];
  });
}
