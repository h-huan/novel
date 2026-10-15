import { IDEA_SOURCE_REVIEW_LIMITS } from '../../shared/src/system-workflow-rules.registry';
import { type PremiseSelectionResult } from './idea-discovery-contract';
import { materializePremiseSourceReview, premiseSourceComparisonCatalog, premiseSourceReviewIssues, type PremiseSelectionReview } from './premise-selection-review';

export function premiseSourceBatches(selection: PremiseSelectionResult): PremiseSelectionResult[] {
  if (selection.selected.length <= IDEA_SOURCE_REVIEW_LIMITS.splitAfterPremises) return [selection];
  const middle = Math.ceil(selection.selected.length / 2);
  return [selection.selected.slice(0, middle), selection.selected.slice(middle)].map(selected => ({
    ...selection, selected, pool: selection.pool.filter(row => selected.some(item => item.premiseId === row.premiseId)),
  }));
}

/** Rebind local batch coordinates to original positions without changing judgments or reasons. */
export function mergePremiseSourceBatches(selection: PremiseSelectionResult, batches: PremiseSelectionResult[], reviews: PremiseSelectionReview[]) {
  if (reviews.length !== batches.length) throw new Error('来源审核批次未完成，不能锁定任何题材');
  const sourceChecks = batches.flatMap((batch, index) => {
    const review = reviews[index];
    const errors = premiseSourceReviewIssues({ sourceChecks: review.sourceChecks }, batch);
    if (errors.length) throw new Error('来源审核批次覆盖未完成：' + errors.join('；'));
    const catalog = premiseSourceComparisonCatalog(batch);
    return review.sourceChecks!.map(check => {
      const entry = catalog.find(row => row.ref === check.ref)!;
      const position = selection.selected.findIndex(row => row.premiseId === entry.premiseId);
      if (position < 0) throw new Error('来源审核批次包含未知原题材身份');
      return { ...check, ref: `S${position + 1}.${entry.field}` };
    });
  });
  return materializePremiseSourceReview({ sourceChecks }, selection);
}

/** Share the live parent allowance; a batch never resets the two-call source cap. */
export function premiseSourceCallBudget(parent?: {remaining:number}) {
  let remaining: number = IDEA_SOURCE_REVIEW_LIMITS.maxPhysicalCalls;
  return {
    get remaining() { return Math.min(remaining, parent?.remaining ?? remaining); },
    set remaining(value: number) {
      const used = this.remaining - value;
      remaining -= used;
      if (parent) parent.remaining -= used;
    },
  };
}
