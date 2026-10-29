import { SELECTED_PREMISE_FIELDS, normalizePremiseSelectionPayload, type PremiseSelectionResult } from './idea-discovery-contract';
import type { PremisePayoffCheck } from './premise-payoff-review';
import { assertPremiseCausalPlans } from './premise-causal-plan';

export interface PremiseSourceCheck {
  ref: string;
  status: 'preserved' | 'drift' | 'unknown';
  reason: string;
}

export interface PremiseSelectionReview {
  passed: boolean;
  sourceReviewReuse?: { reused: number; reviewed: number };
  issues: Array<{ kind: 'overlap' | 'source_drift' | 'selection_fit'; premiseId: string; referencePremiseId: string;
    quote: string; referenceQuote: string; reason: string; field?: string; repairMode?: 'replace_from_pool' }>;
  sourceChecks?: PremiseSourceCheck[];
  payoffChecks?: PremisePayoffCheck[];
  genreChecks?: Array<{ref:string;status:string;field?:string;quote?:string;evidenceRef?:string;reason:string}>;
  categoryChecks?: Array<{ref:string;status:string;evidenceRef?:string;reason:string}>;
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
      : (item?.kind === 'source_drift' || item?.kind === 'selection_fit') ? selection.pool.find(p => p.premiseId === item.referencePremiseId) : undefined;
    if (!candidate || !reference || (item.kind === 'overlap' && item.premiseId === item.referencePremiseId)
      || ((item.kind === 'source_drift' || item.kind === 'selection_fit') && item.premiseId !== item.referencePremiseId)
      || !(item.kind === 'source_drift' && item.field
        ? SELECTED_PREMISE_FIELDS.some(field => field === item.field) && typeof item.quote === 'string'
          && item.quote.trim().length >= 4 && candidate?.[item.field] === item.quote
        : containsQuote(candidate, item.quote)) || !containsQuote(reference, item.referenceQuote)
      || typeof item.reason !== 'string' || item.reason.trim().length < 8) errors.push('筛选问题须绑定实际题材身份、两段原文及具体因果理由，不能错引参考项');
  }
  return errors;
}

/** Every expanded field must be compared with the immutable pool source before lock. */
export function premiseSourceComparisonCatalog(selection: PremiseSelectionResult) {
  return selection.selected.flatMap((candidate, index) => {
    const source = selection.pool.find(item => item.premiseId === candidate.premiseId);
    if (!source) throw new Error('来源审查缺少原池身份');
    return SELECTED_PREMISE_FIELDS.filter(field => field !== 'differentiation' || String(candidate[field] || '').trim().length > 0)
      .map(field => ({ ref: `S${index + 1}.${field}`,
      premiseId: String(candidate.premiseId), field, source: String(source.storyCore), candidate: String(candidate[field] || '') }));
  });
}

export function premiseSourceReviewIssues(value: unknown, selection: PremiseSelectionResult): string[] {
  const checks = (value as { sourceChecks?: PremiseSourceCheck[] })?.sourceChecks;
  if (!Array.isArray(checks)) return ['来源复核缺少逐字段sourceChecks，整体passed或空issues不能证明已核查全部题材'];
  const catalog = premiseSourceComparisonCatalog(selection);
  const errors: string[] = [], seen = new Set<string>();
  if ('passed' in (value as object) || 'issues' in (value as object)) errors.push('来源复核不得并行返回另一份passed/issues结论');
  for (const row of checks) {
    if (!row || !catalog.some(item => item.ref === row.ref) || seen.has(row.ref)) {
      errors.push('来源核查编号未知或重复'); continue;
    }
    seen.add(row.ref);
    if (!['preserved', 'drift', 'unknown'].includes(row.status) || typeof row.reason !== 'string' || row.reason.trim().length < 8) {
      errors.push(row.ref + '缺少明确状态或原池与展开事实的比较理由');
    }
  }
  for (const item of catalog) if (!seen.has(item.ref)) errors.push(item.ref + '尚未核查');
  return errors;
}

export function materializePremiseSourceReview(value: unknown, selection: PremiseSelectionResult): PremiseSelectionReview {
  const errors = premiseSourceReviewIssues(value, selection);
  if (errors.length) throw new Error('来源复核覆盖未完成：' + errors.join('；'));
  const sourceChecks = (value as { sourceChecks: PremiseSourceCheck[] }).sourceChecks;
  // A complete "unknown" verdict is a failed Gate for that identity, not a
  // malformed response that discards independent conclusions for every peer.
  const catalog = premiseSourceComparisonCatalog(selection);
  const issues: PremiseSelectionReview['issues'] = sourceChecks.filter(row => row.status === 'drift').map(row => {
    const item = catalog.find(entry => entry.ref === row.ref)!;
    return { kind: 'source_drift', premiseId: item.premiseId, referencePremiseId: item.premiseId,
      field: item.field, quote: item.candidate, referenceQuote: item.source, reason: row.reason };
  });
  for(const row of sourceChecks.filter(row=>row.status==='unknown')){
    const item=catalog.find(entry=>entry.ref===row.ref)!;
    const candidate=selection.selected.find(p=>p.premiseId===item.premiseId)!;
    issues.push({kind:'selection_fit',premiseId:item.premiseId,referencePremiseId:item.premiseId,
      repairMode:'replace_from_pool',quote:String(candidate[item.field]||'').trim().length>=8?String(candidate[item.field]):String(candidate.activeChoice),
      referenceQuote:item.source,reason:'来源未确认，不能假定一致或已举证冲突：'+row.reason});
  }
  const review: PremiseSelectionReview = { passed: issues.length === 0, issues, sourceChecks };
  const evidenceErrors = premiseSelectionReviewIssues(review, selection);
  if (evidenceErrors.length) throw new Error('来源复核证据无效：' + evidenceErrors.join('；'));
  return review;
}

/** Only the original pool may be used before lock; unaffected choices stay server-owned. */
export function normalizePremiseReselection(value: unknown, original: PremiseSelectionResult,
  review: PremiseSelectionReview, requestedCount: number, poolTarget: number, categories?: readonly string[], minimumSelectedCount = requestedCount): PremiseSelectionResult {
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
      storyCore: seed.storyCore, ...(seed.storyCategory ? { storyCategory: seed.storyCategory } : {}),
      ...(seed.storyCategoryId ? { storyCategoryId: seed.storyCategoryId } : {}) };
  });
  const normalized = normalizePremiseSelectionPayload({ pool: original.pool, selectedPremises }, requestedCount, poolTarget, categories, minimumSelectedCount);
  if (original.selected.some(item => item.causalPlan !== undefined)) assertPremiseCausalPlans(normalized);
  return normalized;
}

/** Build repair slots from verified reviews; unaffected selections stay server-owned. */
/** The identical original pool storyCore and workingTitle are supplied in the
 * source-review pool section. Omit only those redundant keys from selected
 * review input; preserve category, expanded facts and all causalPlan links. */
export function sourceReviewSelectionView(selected: PremiseSelectionResult['selected']) {
 return selected.map(({storyCore:_source,workingTitle:_title,...expanded})=>expanded);
}

/** Keep the selected original-pool storyCore for cross-story comparison;
 * only omit causalPlan: its action/condition/result quotes are anchored in the
 * preserved expanded story fields. The independent payoff review still reads
 * and validates the complete causalPlan. */
export function overlapReviewSelectionView(selected: PremiseSelectionResult['selected']) {
 return selected.map(({causalPlan:_plan,...expanded})=>expanded);
}

/** Prompt-only representation for a targeted reselection. The server still keeps
 * the complete original selection and all causal plans for independent gates.
 * Unchanged peers need their real actions/conditions for comparison, not a second
 * copy of causalPlan quotations already anchored in those fields. A failed slot
 * retains its entire plan so a correction can preserve all dependent actions. */
export function premiseReselectionPromptSelection(
  selected: PremiseSelectionResult['selected'], repairIds: ReadonlySet<string>,
) {
  return selected.map(item => repairIds.has(String(item.premiseId))
    ? item
    : (({ causalPlan: _repeatedAnchors, ...facts }) => facts)(item));
}

export function premiseReselectionPlan(original: PremiseSelectionResult, review: PremiseSelectionReview) {
  const affected = new Set(review.issues.map(issue => issue.premiseId));
  const replacementIds = new Set(review.issues.filter(issue => issue.kind === 'overlap' || issue.repairMode === 'replace_from_pool').map(issue => issue.premiseId));
  const protectedItems = original.selected.filter(item => !affected.has(String(item.premiseId)));
  return {
    protectedItems,
    repairSlots: original.selected.filter(item => affected.has(String(item.premiseId))).map(item => ({
      replacesPremiseId: item.premiseId,
      mode: replacementIds.has(String(item.premiseId)) ? 'replace_from_pool' : 'correct_or_replace_from_pool',
      original: item,
      issues: review.issues.filter(issue => issue.premiseId === item.premiseId),
    })),
    availableCandidates: original.pool.filter(item => !protectedItems.some(protectedItem => protectedItem.premiseId === item.premiseId)
      && !replacementIds.has(String(item.premiseId))),
  };
}

/** Targeted protocol: repair only named slots, merge in original order, then run all existing gates. */
export function normalizeTargetedPremiseReselection(value: unknown, original: PremiseSelectionResult,
  review: PremiseSelectionReview, requestedCount: number, poolTarget: number, categories?: readonly string[], minimumSelectedCount = requestedCount): PremiseSelectionResult {
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
    if (slot.mode === 'replace_from_pool' && row.premiseId === slotId) throw new Error('已证实同构或原池缺少兑现条件的题材必须从原池换选，不能保留原身份补造条件或只换表述');
    if (!plan.availableCandidates.some(item => item.premiseId === row.premiseId)) throw new Error('定向重选须选择可用原池身份，不能复制正常项、已淘汰同构项或补生题材');
    // An independently evidenced citation-only defect must not regenerate ten
    // already-expanded story fields. Only selection-fit (not source-drift or
    // overlap) may preserve the original identity with a plan-only payload.
    // The plan is still anchored and independently reviewed after normalization.
    const planOnly = row.premiseId === slotId && slot.mode === 'correct_or_replace_from_pool'
      && slot.issues.length > 0 && slot.issues.every(issue => issue.kind === 'selection_fit')
      && Object.keys(row).every(key => key === 'premiseId' || key === 'causalPlan')
      && Array.isArray(row.causalPlan);
    if (planOnly) {
      bySlot.set(slotId, { ...slot.original, causalPlan: row.causalPlan });
      continue;
    }
    bySlot.set(slotId, row);
  }
  const selectedPremises = original.selected.map(item => bySlot.get(String(item.premiseId)) || item);
  return normalizePremiseReselection({selectedPremises}, original, review, requestedCount, poolTarget, categories, minimumSelectedCount);
}

/** Isolate evidenced failures after completed reviews, without rewriting retained premises.
 * Protocol errors and incomplete reviews must never be treated as a partial pass.
 */
export function retainReviewedPremises(selection: PremiseSelectionResult, review: PremiseSelectionReview,
  protectedIds: readonly string[] = []) {
  const errors = premiseSelectionReviewIssues(review, selection);
  if (errors.length) throw new Error('不能保留未完成有效复核的题材：' + errors.join('；'));
  const excluded = new Set(review.issues.filter(issue => issue.kind === 'source_drift' || issue.kind === 'selection_fit').map(issue => issue.premiseId));
  const protectedSet = new Set(protectedIds);
  for (const issue of review.issues.filter(item => item.kind === 'overlap')) {
    if (excluded.has(issue.premiseId) || excluded.has(issue.referencePremiseId)) continue;
    // Prefer keeping the original unaffected choice over a newly repaired duplicate.
    excluded.add(protectedSet.has(issue.premiseId) && !protectedSet.has(issue.referencePremiseId)
      ? issue.referencePremiseId : issue.premiseId);
  }
  return {
    selection: { ...selection, selected: selection.selected.filter(item => !excluded.has(String(item.premiseId))) },
    excludedPremiseIds: [...excluded],
    reasons: review.issues,
  };
}



/** Reuse the completed review for a retained subset. Every remaining premise and
 * every remaining pair was already covered by the original review; dropping a
 * failed premise cannot require another paid review. Re-index S<n> evidence for
 * the subset while preserving the initial full review separately in the audit. */
export function retainPremiseReviewEvidence(
  original: PremiseSelectionResult,
  review: PremiseSelectionReview,
  retained: PremiseSelectionResult,
): PremiseSelectionReview {
  const retainedIds = new Set(retained.selected.map(item => String(item.premiseId)));
  const issues = review.issues.filter(item => item.kind === 'overlap'
    ? retainedIds.has(String(item.premiseId)) && retainedIds.has(String(item.referencePremiseId))
    : retainedIds.has(String(item.premiseId)));
  const remapReference = (value: unknown, oldIndex: number, newIndex: number): unknown => {
    if (typeof value !== 'string') return value;
    const oldPrefix = 'S' + oldIndex + '.';
    return value.startsWith(oldPrefix) ? 'S' + newIndex + '.' + value.slice(oldPrefix.length) : value;
  };
  const remap = <T extends { ref: string }>(rows: T[] | undefined): T[] | undefined => {
    if (!Array.isArray(rows)) return undefined;
    return rows.flatMap(row => {
      const match = String(row.ref || '').match(/^S(\d+)\.(.+)$/);
      if (!match) return [row];
      const oldIndex = Number(match[1]);
      const originalPremise = original.selected[oldIndex - 1];
      if (!originalPremise || !retainedIds.has(String(originalPremise.premiseId))) return [];
      const newIndex = retained.selected.findIndex(item => String(item.premiseId) === String(originalPremise.premiseId)) + 1;
      if (newIndex <= 0) return [];
      const mapped: Record<string, any> = { ...row, ref: 'S' + newIndex + '.' + match[2] };
      if (mapped.reversalCheck && typeof mapped.reversalCheck === 'object'
          && typeof mapped.reversalCheck.actionEvidenceRef === 'string')
          mapped.reversalCheck = {...mapped.reversalCheck,
            actionEvidenceRef: remapReference(mapped.reversalCheck.actionEvidenceRef, oldIndex, newIndex)};
        for (const key of ['evidenceRef', 'actionEvidenceRef', 'conditionEvidenceRef']) {
        if (key in mapped) mapped[key] = remapReference(mapped[key], oldIndex, newIndex);
      }
      if (Array.isArray(mapped.links)) mapped.links = mapped.links.map((link: any) => link && typeof link === 'object'
        ? { ...link, ref: remapReference(link.ref, oldIndex, newIndex) } : link);
      return [mapped as T];
    });
  };
  const sourceChecks = remap(review.sourceChecks);
  const payoffChecks = remap(review.payoffChecks);
  const categoryChecks = remap(review.categoryChecks);
  const genreChecks = remap(review.genreChecks);
  return {
    passed: issues.length === 0,
    issues,
    ...(sourceChecks ? { sourceChecks } : {}),
    ...(payoffChecks ? { payoffChecks } : {}),
    ...(categoryChecks ? { categoryChecks } : {}),
    ...(genreChecks ? { genreChecks } : {}),
  };
}

/** Carry only the final failed preselection evidence into the partial-batch report. */
export function premiseSelectionFailureReasons(audit: unknown): string[] {
  const value = audit as { reasons?: Array<{reason?:unknown}>; finalReview?: PremiseSelectionReview } | undefined;
  const items = Array.isArray(value?.reasons) ? value.reasons
    : value?.finalReview?.passed === false ? value.finalReview.issues : [];
  return [...new Set(items.map(item => typeof item?.reason === 'string' ? item.reason.trim() : '').filter(Boolean))];
}

/** Reused old pairs cannot veto an unrelated replacement. Out-of-scope findings
 * are protocol errors; they must never be silently discarded to obtain a pass. */
export function premiseOverlapScopeIssues(value:unknown,selection:PremiseSelectionResult,focusIds?:string|readonly string[]):string[]{
 const ids=focusIds===undefined?[]:typeof focusIds==='string'?[focusIds]:[...focusIds];
 if(!ids.length)return [];
 const selectedIds=new Set(selection.selected.map(item=>String(item.premiseId)));
 if(ids.some(id=>!selectedIds.has(String(id))))return ['同构审核变化项不在当前选择中'];
 const focused=new Set(ids.map(String));
 const issues=(value as PremiseSelectionReview)?.issues;
 if(!Array.isArray(issues))return [];
 return issues.filter(item=>!focused.has(String(item.premiseId))&&!focused.has(String(item.referencePremiseId)))
  .map(()=> '本次同构审核只允许返回变化项与保留项之间的问题，旧配对不得重复否决换选');
}
