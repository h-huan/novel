/** A complete, evidenced rejection may enter the existing single chapter patch.
 * Transport errors and incomplete reviews must never become story defects. */
export interface ChapterFactVerdict { consistent: boolean; contradictions: string[]; }
export interface ChapterActionRejection extends Error {
  gateRejection: true;
  report: { status: number; topic: string; sections: string[] };
  planningActionAudit?: { transitions?: Array<{ status?: string; actionAnchorId?: string; resultAnchorId?: string;
    actionEvidence?: string; resultEvidence?: string; reason?: string }> };
}

/** Give the repairer the original evidenced defects and all result field paths.
 * This is a view over the existing audit, never a second semantic judgment.
 * Keep unknown addresses visible instead of guessing another field's location.
 */
export function chapterActionRepairEvidence(chapter: unknown, failure: ChapterActionRejection | null) {
  const anchors = causalEvidenceAnchorOptions(JSON.stringify([chapter]), {});
  const address = (id?: string) => anchors.find(anchor => anchor.id === id && anchor.source === 'body');
  const path = (id?: string) => address(id)?.path?.replace(/^0\./, '') || null;
  const transitions = failure?.planningActionAudit?.transitions || [];
  return {
    gaps: transitions.filter(row => row.status === 'gap').map(row => ({
      actionPath: path(row.actionAnchorId), resultPath: path(row.resultAnchorId),
      actionEvidence: row.actionEvidence, resultEvidence: row.resultEvidence, reason: row.reason,
    })),
    // Hand the patcher the other reviewed result identities so it knows what
    // NOT to rewrite. They are not approval receipts and are never used to
    // bypass the complete independent post-patch review.
    protectedResults: transitions.filter(row => row.status === 'supported' || row.status === 'planned')
      .map(row => ({ status: row.status, actionPath: path(row.actionAnchorId),
        resultPath: path(row.resultAnchorId), resultEvidence: row.resultEvidence }))
      .filter(row => row.resultPath !== null),
    resultFields: [...new Set(causalChapterResultAnchors(anchors, 0).map(anchor => anchor.path?.replace(/^0\./, '')).filter(Boolean))],
  };
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
import { causalEvidenceAnchorOptions, causalChapterResultAnchors } from '../modules/writing-quality/causal-review';

