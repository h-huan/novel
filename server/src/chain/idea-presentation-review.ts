export interface IdeaPresentationVerdict {
  position: number;
  title: string;
  titleCompelling: boolean;
  openingCompelling: boolean;
  distinctFromBatch: boolean;
  readerQuestion: string;
  issues: string[];
}

/** Bind an independent semantic judgement to exactly the cards actually reviewed. */
export function presentationReviewIssues(value: any, cards: readonly any[]): string[] {
  if (!Array.isArray(value?.reviews) || value.reviews.length !== cards.length) return ['标题与首屏审查必须逐卡返回完整结论'];
  const seen = new Set<number>();
  for (const row of value.reviews) {
    if (!Number.isInteger(row?.position) || row.position < 1 || row.position > cards.length || seen.has(row.position)
      || row.title !== cards[row.position - 1].title
      || ['titleCompelling', 'openingCompelling', 'distinctFromBatch'].some(key => typeof row[key] !== 'boolean')
      || typeof row.readerQuestion !== 'string' || row.readerQuestion.trim().length < 8
      || !Array.isArray(row.issues) || row.issues.some((issue: any) => typeof issue !== 'string' || !issue.trim())
      || ((!row.titleCompelling || !row.openingCompelling || !row.distinctFromBatch) && row.issues.length === 0)) {
      return ['审查必须匹配实际标题和唯一position，明确读者追问及未通过理由'];
    }
    seen.add(row.position);
  }
  return [];
}

export function presentationGateIssues(review: IdeaPresentationVerdict | undefined): string[] {
  if (!review) return ['标题与首屏吸引力未获得有效独立审查，不能宣称通过'];
  return [
    ...(!review.titleCompelling ? ['标题缺少具体利益冲突、反常关系或未解问题，只有意象或道具名，未形成点击承诺'] : []),
    ...(!review.openingCompelling ? ['首屏缺少立即可理解的危险、欲望或关系反差，只在介绍设定或职业查证流程'] : []),
    ...(!review.distinctFromBatch ? ['与同批题材的主动选择、冲突推进或反转路径雷同，不能只换职业和道具'] : []),
    ...review.issues,
  ];
}
