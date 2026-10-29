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
  const isolated = new Set<number>();
  const protocolReasons = new Map<number,string[]>();
  for (let index = 0; index < selection.selected.length; index++) {
    const prefix = `S${index + 1}.`;
    const ownedRows = allRows.flatMap(rows => rows.filter((row: any) => row.ref.startsWith(prefix)));
    const foreign = ownedRows.some((row: any) => [row.evidenceRef, row.actionEvidenceRef,
      row.conditionEvidenceRef, row.reversalCheck?.actionEvidenceRef,
      ...(Array.isArray(row.links) ? row.links.map((link: any) => link?.ref) : [])]
      .some(ref => typeof ref === 'string' && /^S\d+\./.test(ref) && !ref.startsWith(prefix)));
    if (foreign) { isolated.add(index); protocolReasons.set(index,['审核证据跨题材引用，不能证明本卡独立结论']); continue; }
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
    const errors = [
      ...premiseSourceReviewIssues(local, scoped),
      ...premisePayoffReviewIssues(local, scoped),
      ...premiseGenreFitIssues(local, scoped, requiredGenres),
      ...premiseCategoryFitIssues(local, scoped),
    ];
    if (errors.length) { isolated.add(index); protocolReasons.set(index,errors); }
  }
  if (!isolated.size) return value;
  const keep = (items: any[]) => items.filter(row => !isolated.has(Number(/^S(\d+)\./.exec(row.ref)?.[1]) - 1));
  const sourceChecks = keep(value.sourceChecks);
  const payoffChecks = keep(value.payoffChecks);
  const genreChecks = keep(value.genreChecks || []);
  const categoryChecks = keep(value.categoryChecks || []);
  for (const index of isolated) {
    const prefix = `S${index + 1}.`;
    const scoped: PremiseSelectionResult = { ...selection, selected: [selection.selected[index]],
      pool: selection.pool.filter(row => row.premiseId === selection.selected[index].premiseId) };
    // Keep actual failed check names, not eleven indistinguishable unknown rows.
    // Missing or invalid verdicts still fail; this does not weaken the Gate.
    const localReason=reason+'：'+(protocolReasons.get(index)||['未能定位审核协议缺陷']).slice(0,4).join('；');
    sourceChecks.push(...premiseSourceComparisonCatalog(scoped).map(row => ({
      ref: prefix + row.field, status: 'unknown', reason: localReason, protocolIncomplete: true,
    })));
    payoffChecks.push({ ref: prefix + 'payoff', status: 'unknown', reason: localReason, protocolIncomplete: true,
      reversalCheck: { status: 'unknown', reason: localReason },
      links: premiseCausalCatalog(scoped.selected[0], prefix).map(row => ({ ref: row.ref, status: 'unknown', reason: localReason })) });
    genreChecks.push(...premiseGenreFitCatalog(scoped, requiredGenres).map(row => ({
      ref: prefix + row.ref.slice(3), status: 'unknown', reason: localReason, protocolIncomplete: true,
    })));
    categoryChecks.push(...premiseCategoryCatalog(scoped).map(row => ({
      ref: prefix + row.ref.slice(3), status: 'unknown', reason: localReason, protocolIncomplete: true,
    })));
  }
  return { ...value, sourceChecks, payoffChecks, genreChecks, categoryChecks };
}
