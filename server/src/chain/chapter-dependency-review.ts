/** A complete, evidenced rejection may enter the existing single chapter patch.
 * Transport errors and incomplete reviews must never become story defects. */
export interface ChapterFactVerdict { consistent: boolean; contradictions: string[]; }
type ChapterActionAuditRow = { status?: string; actionAnchorId?: string; resultAnchorId?: string;
  actionEvidence?: string; resultEvidence?: string; reason?: string };
export interface ChapterActionRejection extends Error {
  gateRejection: true;
  report: { status: number; topic: string; sections: string[] };
  /** A large chapter audit is split into several server-owned result shards;
   *  the rejection carries the completed shard audits as an array. Never look
   *  only at `.transitions`, or a sharded 422 loses every real gap path. */
  planningActionAudit?: { transitions?: ChapterActionAuditRow[] } | Array<{ transitions?: ChapterActionAuditRow[] }>;
}

/** Give the repairer the original evidenced defects and all result field paths.
 * This is a view over the existing audit, never a second semantic judgment.
 * Keep unknown addresses visible instead of guessing another field's location.
 */
/** The independent model's JSON body includes server-owned chapter identity and
 * function. The repairer must build addresses from this exact same serialized
 * candidate, not from the unnormalized model output. */
export function planningChapterForCausalReview(chapter: Record<string,any>,chapterNumber:number,chapterFunction:string) {
 return {...chapter,chapterNumber,chapterFunction};
}
export function chapterActionRepairEvidence(chapter: unknown, failure: ChapterActionRejection | null) {
  const anchors = causalEvidenceAnchorOptions(JSON.stringify([chapter]), {});
  const address = (id?: string) => anchors.find(anchor => anchor.id === id && anchor.source === 'body');
  const path = (id?: string) => address(id)?.path?.replace(/^0\./, '') || null;
  const audits = failure?.planningActionAudit === undefined
    ? []
    : Array.isArray(failure.planningActionAudit) ? failure.planningActionAudit : [failure.planningActionAudit];
  const transitions = audits.flatMap(audit => Array.isArray(audit?.transitions) ? audit.transitions : []);
  return {
    gaps: transitions.filter(row => row.status === 'gap').map(row => ({
      actionPath: path(row.actionAnchorId),
      resultPath: path(row.resultAnchorId),
      actionEvidence: row.actionEvidence, resultEvidence: row.resultEvidence, reason: row.reason,
    })),
    resultFields: [...new Set(causalChapterResultAnchors(anchors, 0)
      .map(anchor => anchor.path?.replace(/^0\./, ''))
      .filter((path): path is string => Boolean(path)))],
  };
}

/** Stable path-based scope for a post-repair action re-audit. The old audit's
 * resultAnchorId is text-derived and changes when the patch edits text; use
 * the old paths, then resolve them against the CURRENT chapter. A content
 * rewrite or an unmappable path falls back to the complete audit. */
export function changedOutlineActionResultPaths(
  patch: Record<string, unknown> | null | undefined,
  evidence: { gaps?: readonly { resultPath?: string | null }[]; resultFields?: readonly string[] } | null | undefined,
): string[] {
  const normalize = (value: string) => value.replace(/\[(0|[1-9]\d*)\]/g, '.$1').replace(/^0\./, '');
  const keys = Object.keys(patch || {}).map(normalize);
  if (!keys.length) return [];
  if (keys.some(key => ['content', 'coreContent', 'plot'].includes(key.split('.')[0]))) return [];
  const overlaps = (left: string, right: string) => left === right || left.startsWith(right + '.') || right.startsWith(left + '.');
  const paths = new Set<string>();
  for (const gap of evidence?.gaps || []) {
    if (typeof gap.resultPath === 'string' && gap.resultPath.trim()) paths.add(normalize(gap.resultPath));
  }
  for (const path of evidence?.resultFields || []) {
    if (keys.some(key => overlaps(key, normalize(path)))) paths.add(normalize(path));
  }
  return [...paths];
}
export function currentResultAnchorIdsForPaths(chapter: unknown, paths: readonly string[]): string[] {
  if (!paths.length) return [];
  const normalize = (value: string) => value.replace(/\[(0|[1-9]\d*)\]/g, '.$1').replace(/^0\./, '');
  const overlaps = (left: string, right: string) => left === right || left.startsWith(right + '.') || right.startsWith(left + '.');
  const anchors = causalEvidenceAnchorOptions(JSON.stringify([chapter]), {});
  // The audit's coverage catalog reviews identical result text once and then
  // projects that verdict to aliases. Returning an alias ID here (the other
  // field with the same words) is rejected as a non-chapter result number.
  // Resolve every matched address to the group's representative first.
  const groups = causalChapterResultReviewGroups(anchors, 0);
  const representativeByAlias = new Map<string, string>();
  for (const [reviewId, aliases] of Object.entries(groups.aliasesByReview)) {
    for (const alias of aliases) representativeByAlias.set(alias, reviewId);
  }
  const reviewIds = new Set(groups.review.map(row => row.id));
  const wanted = paths.map(normalize);
  return [...new Set(anchors.flatMap(anchor => {
    const path = typeof anchor.path === 'string' ? normalize(anchor.path) : '';
    if (!path || !wanted.some(target => overlaps(path, target))) return [];
    const representative = representativeByAlias.get(anchor.id) || anchor.id;
    return reviewIds.has(representative) ? [representative] : [];
  }))];
}
export async function reviewChapterDependencies<C, F extends ChapterFactVerdict>(
  chapter: C,
  reviewFacts: (chapter: C) => Promise<F>,
  reviewActions: (chapter: C) => Promise<void>,
): Promise<{ facts: F; actionFailure: ChapterActionRejection | null; defects: string[] }> {
  // Both checks inspect the same immutable candidate. Drain both on failure so
  // an in-flight model request cannot overlap an unreviewed patch or next run.
  const [factResult, actionResult] = await Promise.allSettled([
    Promise.resolve().then(() => reviewFacts(chapter)),
    Promise.resolve().then(() => reviewActions(chapter)),
  ]);
  if (factResult.status === 'rejected') throw factResult.reason;
  const facts = factResult.value;
  let actionFailure: ChapterActionRejection | null = null;
  if (actionResult.status === 'rejected') {
    const error = actionResult.reason;
    const rejection = error as ChapterActionRejection;
    if (!(error instanceof Error) || rejection.gateRejection !== true
      || rejection.report?.status !== 422 || rejection.report.topic !== 'outline_alignment'
      || !Array.isArray(rejection.report.sections) || !rejection.report.sections.length) throw error;
    actionFailure = rejection;
  }
  return { facts, actionFailure, defects: [...facts.contradictions, ...(actionFailure?.report.sections || [])] };
}
import { causalEvidenceAnchorOptions, causalChapterResultAnchors, causalChapterResultReviewGroups } from '../modules/writing-quality/causal-review';

