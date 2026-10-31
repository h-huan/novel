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
  return value.categoryChecks.filter((row: PremiseCategoryCheck) => row.status !== 'fulfilled').map((row: PremiseCategoryCheck) => {
    const entry = premiseCategoryCatalog(selection).find(item => item.ref === row.ref)!;
    const premise = selection.selected.find(item => item.premiseId === entry.premiseId)!;
    const seed = selection.pool.find(item => item.premiseId === entry.premiseId)!;
    return { kind: 'selection_fit' as const, premiseId: entry.premiseId, referencePremiseId: entry.premiseId,
       ...(row.status==='unknown'?{repairMode:'replace_from_pool' as const}:{}),
       ...((row as PremiseCategoryCheck & {protocolIncomplete?:boolean}).protocolIncomplete ? {protocolIncomplete:true} : {}),
      quote: String(premise.coreConflict), referenceQuote: String(seed.storyCore), field: 'storyCategory',
      reason: row.status==='unknown' ? `分类【${entry.category}】未确认，禁止锁定：${row.reason}` : `分类【${entry.category}】未落实到核心冲突与人物选择：${row.reason}` };
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

/** Transmit only the official category definitions actually used by this
 * independent source-review batch. The full verified standards remain in the
 * controller and in the model-independent quality Gate; unrelated categories
 * cannot change whether this batch's specific stories fit their own genre. */
/** The causal/payoff and overlap reviews consume already-reviewed category/genre
 * verdicts. Keep the full platform and author contract but omit the redundant
 * category catalogue and following genre glossary from these two specialist
 * prompts. Source/category/genre review still receives the complete standard. */
export function corePremiseReviewStandard(standard:string):string {
 const marker='\\n【与完整卡一致的分类标准】';
 const index=standard.lastIndexOf(marker);
 return index>=0?standard.slice(0,index):standard;
}

export function scopePremiseReviewCategoryStandards(
  standard: string, selected: readonly Record<string, unknown>[],
): string {
  const marker='\n【与完整卡一致的分类标准】';
  const markerAt=standard.lastIndexOf(marker);
  if(markerAt<0)return standard;
  const from=markerAt+marker.length,until=standard.indexOf('\n',from);
  if(until<0)return standard;
  let definitions: unknown;
  try { definitions=JSON.parse(standard.slice(from,until)); } catch { return standard; }
  if(!Array.isArray(definitions)||!definitions.every(row=>row&&typeof row==='object'
    &&typeof (row as any).category==='string'))return standard;
  const categories=new Set(selected.map(row=>String(row.storyCategory||'')));
  const relevant=definitions.filter(row=>categories.has(String(row.category)));
  // A malformed or missing category cannot silently lose a standard.
  if(!relevant.length||categories.size>new Set(relevant.map(row=>String(row.category))).size
    ||relevant.length===definitions.length)return standard;
  return standard.slice(0,from)+JSON.stringify(relevant)+standard.slice(until);
}
