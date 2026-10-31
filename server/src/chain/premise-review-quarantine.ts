import { type PremiseSelectionResult } from './idea-discovery-contract';
import { premiseSourceComparisonCatalog, premiseSourceReviewIssues, PREMISE_REVIEW_PROTOCOL_REASON } from './premise-selection-review';
import { premiseGenreFitCatalog, premiseGenreFitIssues } from './premise-genre-fit';
import { premiseCategoryCatalog, premiseCategoryFitIssues } from './premise-category-fit';
import { premiseCausalCatalog } from './premise-causal-plan';
import { premisePayoffReviewIssues, quarantineUnprovenReversalEvidence } from './premise-payoff-review';

const reason = PREMISE_REVIEW_PROTOCOL_REASON + '，不能确认通过，已隔离本卡';

/** A malformed premise-local receipt must not erase valid peer receipts. Unknown
 * is a failed Gate, never a fabricated pass. Unattributable rows still fail the
 * whole batch because their owner cannot be established safely. */
export function quarantineIncompletePremiseReviews(value: any, selection: PremiseSelectionResult,
  requiredGenres: readonly string[]): any {
  if (!value || typeof value !== 'object' || !Array.isArray(value.sourceChecks)
    || !Array.isArray(value.payoffChecks)
    || (requiredGenres.length > 0 && !Array.isArray(value.genreChecks))
    || (premiseCategoryCatalog(selection).length > 0 && !Array.isArray(value.categoryChecks))) return value;
  const allRows = [value.sourceChecks, value.payoffChecks, value.genreChecks || [], value.categoryChecks || []];
  if (allRows.some(rows => rows.some((row: any) => !row || typeof row.ref !== 'string'
    || !/^S\d+\./.test(row.ref) || Number(/^S(\d+)\./.exec(row.ref)?.[1]) < 1
    || Number(/^S(\d+)\./.exec(row.ref)?.[1]) > selection.selected.length))) return value;
  // Protocol markers are server-owned. A model cannot opt out of a semantic
  // rejection by adding this flag to its own review JSON.
  const stripMarker = (rows: any[]) => rows.map(({ protocolIncomplete: _untrusted, ...row }) => row);
  value = { ...value, sourceChecks: stripMarker(value.sourceChecks), payoffChecks: stripMarker(value.payoffChecks),
    ...(Array.isArray(value.genreChecks) ? {genreChecks:stripMarker(value.genreChecks)} : {}),
    ...(Array.isArray(value.categoryChecks) ? {categoryChecks:stripMarker(value.categoryChecks)} : {}) };
  value = quarantineUnprovenReversalEvidence(value, selection);
  // A malformed payoff receipt is NOT evidence that the already verified
  // source/category/genre receipts for the same identity are unknown.
  // Quarantine by (premise, review family), not by the whole premise. Every
  // failed family remains fail-closed; no independently unverified Gate passes.
  type Family = 'sourceChecks'|'payoffChecks'|'genreChecks'|'categoryChecks';
  const families: Family[] = ['sourceChecks','payoffChecks','genreChecks','categoryChecks'];
  const invalid = new Map<number,Map<Family,string[]>>();
  for (let index = 0; index < selection.selected.length; index++) {
    const prefix = `S${index + 1}.`;
    const scoped: PremiseSelectionResult = { ...selection, selected: [selection.selected[index]],
      pool: selection.pool.filter(row => row.premiseId === selection.selected[index].premiseId) };
    const rebind = (ref: string) => ref.startsWith(prefix) ? 'S1.' + ref.slice(prefix.length) : ref;
    const rows = (items: any[]) => items.filter(row => row.ref.startsWith(prefix)).map(row => ({
      ...row, ref: rebind(row.ref),
      ...(row.evidenceRef ? { evidenceRef: rebind(row.evidenceRef) } : {}),
      ...(row.actionEvidenceRef ? { actionEvidenceRef: rebind(row.actionEvidenceRef) } : {}),
      ...(row.conditionEvidenceRef ? { conditionEvidenceRef: rebind(row.conditionEvidenceRef) } : {}),
      ...(row.reversalCheck ? { reversalCheck: { ...row.reversalCheck,
        ...(row.reversalCheck.actionEvidenceRef ? { actionEvidenceRef: rebind(row.reversalCheck.actionEvidenceRef) } : {}) } } : {}),
      ...(Array.isArray(row.links) ? { links: row.links.map((link: any) => ({ ...link,
        ref: typeof link?.ref === 'string' ? rebind(link.ref) : link?.ref })) } : {}),
    }));
    const local = quarantineUnprovenReversalEvidence({
      sourceChecks: rows(value.sourceChecks), payoffChecks: rows(value.payoffChecks),
      genreChecks: rows(value.genreChecks || []), categoryChecks: rows(value.categoryChecks || []),
    }, scoped);
    const checks: Record<Family,string[]> = {
      sourceChecks: premiseSourceReviewIssues(local,scoped),
      payoffChecks: premisePayoffReviewIssues(local,scoped),
      genreChecks: premiseGenreFitIssues(local,scoped,requiredGenres),
      categoryChecks: premiseCategoryFitIssues(local,scoped),
    };
    const originalRows:Record<Family,any[]> = {
      sourceChecks: value.sourceChecks, payoffChecks:value.payoffChecks,
      genreChecks:value.genreChecks||[], categoryChecks:value.categoryChecks||[],
    };
    for (const family of families) {
      const foreign = originalRows[family].filter(row => row.ref.startsWith(prefix))
        .some((row: any) => [row.evidenceRef,row.actionEvidenceRef,row.conditionEvidenceRef,
          row.reversalCheck?.actionEvidenceRef,
          ...(Array.isArray(row.links) ? row.links.map((link: any) => link?.ref) : [])]
          .some(ref => typeof ref === 'string' && /^S\d+\./.test(ref) && !ref.startsWith(prefix)));
      if (foreign) checks[family].push('审核证据跨题材引用，不能证明本卡独立结论');
      if (checks[family].length) {
        const issues=invalid.get(index)||new Map<Family,string[]>();
        issues.set(family,checks[family]);invalid.set(index,issues);
      }
    }
  }
  if (!invalid.size) return value;
  const result:Record<Family,any[]> = {
    sourceChecks:[...value.sourceChecks],payoffChecks:[...value.payoffChecks],
    genreChecks:[...(value.genreChecks||[])],categoryChecks:[...(value.categoryChecks||[])],
  };
  for (const [index,faults] of invalid) {
    const prefix = `S${index + 1}.`;
    const scoped: PremiseSelectionResult = { ...selection, selected: [selection.selected[index]],
      pool: selection.pool.filter(row => row.premiseId === selection.selected[index].premiseId) };
    for (const [family,errors] of faults) {
      result[family] = result[family].filter(row => !row.ref.startsWith(prefix));
      const localReason=reason+'：'+errors.slice(0,4).join('；');
      if (family === 'sourceChecks') result.sourceChecks.push(...premiseSourceComparisonCatalog(scoped).map(row => ({
        ref: prefix + row.field, status: 'unknown', reason: localReason, protocolIncomplete: true,
      })));
      if (family === 'payoffChecks') result.payoffChecks.push({
        ref: prefix + 'payoff', status: 'unknown', reason: localReason, protocolIncomplete: true,
        reversalCheck: { status: 'unknown', reason: localReason },
        links: premiseCausalCatalog(scoped.selected[0], prefix).map(row => ({
          ref: row.ref, status: 'unknown', reason: localReason,
        })),
      });
      if (family === 'genreChecks') result.genreChecks.push(...premiseGenreFitCatalog(scoped, requiredGenres).map(row => ({
        ref: prefix + row.ref.slice(3), status: 'unknown', reason: localReason, protocolIncomplete: true,
      })));
      if (family === 'categoryChecks') result.categoryChecks.push(...premiseCategoryCatalog(scoped).map(row => ({
        ref: prefix + row.ref.slice(3), status: 'unknown', reason: localReason, protocolIncomplete: true,
      })));
    }
  }
  return { ...value,...result };
}
