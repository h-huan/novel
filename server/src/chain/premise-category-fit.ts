import type { PremiseSelectionResult } from './idea-discovery-contract';
import type { PremiseSelectionReview } from './premise-selection-review';
import { premiseGenreEvidenceCatalog } from './premise-genre-fit';

export interface PremiseCategoryCheck {
  ref: string;
  status: 'fulfilled' | 'missing' | 'unknown';
  reason: string;
  evidenceRef?: string;
}

export function premiseCategoryCatalog(selection: PremiseSelectionResult) {
  return selection.selected.flatMap((item, index) => String(item.storyCategory || '').trim()
    ? [{ ref: `S${index + 1}.category`, premiseId: String(item.premiseId), category: String(item.storyCategory) }] : []);
}

export function premiseCategoryFitIssues(value: any, selection: PremiseSelectionResult): string[] {
  const catalog = premiseCategoryCatalog(selection);
  if (!catalog.length) return [];
  const checks = value?.categoryChecks;
  if (!Array.isArray(checks) || checks.length !== catalog.length) return ['categoryChecks须逐卡覆盖已锁定分类与主线机制'];
  const errors: string[] = [], seen = new Set<string>();
  const evidence = premiseGenreEvidenceCatalog(selection);
  for (const check of checks) {
    const expected = catalog.find(row => row.ref === check?.ref);
    if (!expected || seen.has(check.ref)) { errors.push('分类核查编号未知或重复'); continue; }
    seen.add(check.ref);
    if (!['fulfilled', 'missing', 'unknown'].includes(check.status) || typeof check.reason !== 'string' || check.reason.trim().length < 8)
      errors.push(check.ref + '缺少分类落实状态及具体主线依据');
    if (check.status === 'fulfilled' && !evidence.some(row => row.id === check.evidenceRef && row.premiseId === expected.premiseId))
      errors.push(check.ref + '须引用本题材已选展开证据，不能用分类标签或原池代替主线');
  }
  return errors;
}

export function materializePremiseCategoryFit(value: any, selection: PremiseSelectionResult): PremiseSelectionReview['issues'] {
  const errors = premiseCategoryFitIssues(value, selection);
  if (errors.length) throw new Error(errors.join('；'));
  if (!premiseCategoryCatalog(selection).length) return [];
  if (value.categoryChecks.some((row: PremiseCategoryCheck) => row.status === 'unknown'))
    throw new Error('分类与主线适配尚未确认，不能锁定题材');
  return value.categoryChecks.filter((row: PremiseCategoryCheck) => row.status === 'missing').map((row: PremiseCategoryCheck) => {
    const entry = premiseCategoryCatalog(selection).find(item => item.ref === row.ref)!;
    const premise = selection.selected.find(item => item.premiseId === entry.premiseId)!;
    const seed = selection.pool.find(item => item.premiseId === entry.premiseId)!;
    return { kind: 'selection_fit' as const, premiseId: entry.premiseId, referencePremiseId: entry.premiseId,
      quote: String(premise.coreConflict), referenceQuote: String(seed.storyCore), field: 'storyCategory',
      reason: `分类【${entry.category}】未落实到核心冲突与人物选择：${row.reason}` };
  });
}

export function premiseCategoryReviewDirective(selection: PremiseSelectionResult, includeEvidenceCatalog = true): string {
  const catalog = premiseCategoryCatalog(selection);
  if (!catalog.length) return '';
  return '\n【与完整卡同口径的前置分类审核】' + JSON.stringify(catalog)
    + '；categoryChecks每个ref恰好一项，返回status=fulfilled|missing|unknown、reason至少8字。'
    + '按上方同一份分类标准检查核心冲突、主动选择及兑现，不能因标签相同、职业背景或附带感情就视为分类成立。'
    + 'fulfilled须提供本题材已选展开的evidenceRef；missing须指出具体分类机制缺失，不改题材或分类。'
    + (includeEvidenceCatalog ? '\n【已选展开证据目录】' + JSON.stringify(premiseGenreEvidenceCatalog(selection).map(({ id, field, premiseId }) => ({ id, field, premiseId }))) : '\n分类evidenceRef使用本次同一请求中已列出的完整流派字段编号目录，原文、编号与审核规则全部保留，不重复展开。');
}
