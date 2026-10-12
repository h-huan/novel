import { normalizePremiseSelectionPayload, type PremiseSelectionResult } from './idea-discovery-contract';

export interface PremiseSelectionReview {
  passed: boolean;
  issues: Array<{ kind: 'overlap' | 'source_drift'; premiseId: string; referencePremiseId: string;
    quote: string; referenceQuote: string; reason: string }>;
}
const containsQuote = (value: Record<string, unknown> | undefined, quote: unknown) =>
  typeof quote === 'string' && quote.trim().length >= 8 && !!value
  && Object.values(value).some(text => typeof text === 'string' && text.includes(quote));

/** Evidence belongs to the declared premise, not merely somewhere in the batch. */
export function premiseSelectionReviewIssues(value: unknown, selection: PremiseSelectionResult): string[] {
  const review = value as PremiseSelectionReview;
  if (!review || typeof review.passed !== 'boolean' || !Array.isArray(review.issues)) return ['筛选复核须返回passed与issues数组'];
  if (review.passed !== (review.issues.length === 0)) return ['筛选复核结论与问题数组互斥'];
  const errors: string[] = [];
  for (const item of review.issues) {
    const candidate = selection.selected.find(p => p.premiseId === item?.premiseId);
    const reference = item?.kind === 'overlap' ? selection.selected.find(p => p.premiseId === item.referencePremiseId)
      : item?.kind === 'source_drift' ? selection.pool.find(p => p.premiseId === item.referencePremiseId) : undefined;
    if (!candidate || !reference || (item.kind === 'overlap' && item.premiseId === item.referencePremiseId)
      || (item.kind === 'source_drift' && item.premiseId !== item.referencePremiseId)
      || !containsQuote(candidate, item.quote) || !containsQuote(reference, item.referenceQuote)
      || typeof item.reason !== 'string' || item.reason.trim().length < 8) errors.push('筛选问题须绑定实际题材身份、两段原文及具体因果理由，不能错引参考项');
  }
  return errors;
}

/** Only the original pool may be used before lock; unaffected choices stay server-owned. */
export function normalizePremiseReselection(value: unknown, original: PremiseSelectionResult,
  review: PremiseSelectionReview, requestedCount: number, poolTarget: number, categories?: readonly string[]): PremiseSelectionResult {
  const rows = (value as any)?.selectedPremises;
  if (!Array.isArray(rows)) throw new Error('原池重选须提供selectedPremises');
  const affected = new Set(review.issues.map(issue => issue.premiseId));
  const protectedItems = original.selected.filter(item => !affected.has(String(item.premiseId)));
  if (protectedItems.some(item => !rows.some(row => row?.premiseId === item.premiseId))) throw new Error('重选不能丢弃未被指出问题的已选题材');
  const selectedPremises = rows.map(row => {
    const retained = protectedItems.find(item => item.premiseId === row?.premiseId);
    if (retained) return { ...retained, ...(!retained.storyCategory && categories?.length === 1 ? { storyCategory: categories[0] } : {}) };
    const seed = original.pool.find(item => item.premiseId === row?.premiseId);
    if (!seed) throw new Error('重选只能使用原轻量池的题材，不能补生或伪造身份');
    return { ...row, premiseId: seed.premiseId, workingTitle: seed.workingTitle,
      storyCore: seed.storyCore, ...(seed.storyCategory ? { storyCategory: seed.storyCategory } : {}) };
  });
  return normalizePremiseSelectionPayload({ pool: original.pool, selectedPremises }, requestedCount, poolTarget, categories);
}

/** Build repair slots from verified reviews; unaffected selections stay server-owned. */
export function premiseReselectionPlan(original: PremiseSelectionResult, review: PremiseSelectionReview) {
  const affected = new Set(review.issues.map(issue => issue.premiseId));
  const overlapIds = new Set(review.issues.filter(issue => issue.kind === 'overlap').map(issue => issue.premiseId));
  const protectedItems = original.selected.filter(item => !affected.has(String(item.premiseId)));
  return {
    protectedItems,
    repairSlots: original.selected.filter(item => affected.has(String(item.premiseId))).map(item => ({
      replacesPremiseId: item.premiseId,
      mode: overlapIds.has(String(item.premiseId)) ? 'replace_from_pool' : 'correct_or_replace_from_pool',
      original: item,
      issues: review.issues.filter(issue => issue.premiseId === item.premiseId),
    })),
    availableCandidates: original.pool.filter(item => !protectedItems.some(protectedItem => protectedItem.premiseId === item.premiseId)
      && !overlapIds.has(String(item.premiseId))),
  };
}

/** Targeted protocol: repair only named slots, merge in original order, then run all existing gates. */
export function normalizeTargetedPremiseReselection(value: unknown, original: PremiseSelectionResult,
  review: PremiseSelectionReview, requestedCount: number, poolTarget: number, categories?: readonly string[]): PremiseSelectionResult {
  const plan = premiseReselectionPlan(original, review);
  const replacements = (value as any)?.replacements;
  if (!Array.isArray(replacements) || replacements.length !== plan.repairSlots.length) throw new Error('定向重选必须逐项覆盖所有问题位置，只返回replacements，不返回整批题材');
  const bySlot = new Map<string, Record<string, unknown>>();
  for (const change of replacements) {
    const slotId = String(change?.replacesPremiseId || '');
    const slot = plan.repairSlots.find(item => item.replacesPremiseId === slotId);
    if (!slot || bySlot.has(slotId)) throw new Error('定向重选位置未知或重复，不能修改正常项');
    const row = change?.premise;
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('定向重选必须提供完整premise筛选证据');
    if (slot.mode === 'replace_from_pool' && row.premiseId === slotId) throw new Error('已证实同构的题材必须从原池换选，不能保留原身份只换表述');
    if (!plan.availableCandidates.some(item => item.premiseId === row.premiseId)) throw new Error('定向重选须选择可用原池身份，不能复制正常项、已淘汰同构项或补生题材');
    bySlot.set(slotId, row);
  }
  const selectedPremises = original.selected.map(item => bySlot.get(String(item.premiseId)) || item);
  return normalizePremiseReselection({selectedPremises}, original, review, requestedCount, poolTarget, categories);
}
