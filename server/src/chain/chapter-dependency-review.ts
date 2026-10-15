/** A complete, evidenced rejection may enter the existing single chapter patch.
 * Transport errors and incomplete reviews must never become story defects. */
export interface ChapterFactVerdict { consistent: boolean; contradictions: string[]; }
export interface ChapterActionRejection extends Error {
  gateRejection: true;
  report: { status: number; topic: string; sections: string[] };
}
export async function reviewChapterDependencies<C, F extends ChapterFactVerdict>(
  chapter: C,
  reviewFacts: (chapter: C) => Promise<F>,
  reviewActions: (chapter: C) => Promise<void>,
): Promise<{ facts: F; actionFailure: ChapterActionRejection | null; defects: string[] }> {
  const facts = await reviewFacts(chapter);
  let actionFailure: ChapterActionRejection | null = null;
  try { await reviewActions(chapter); }
  catch (error) {
    const rejection = error as ChapterActionRejection;
    if (!(error instanceof Error) || rejection.gateRejection !== true
      || rejection.report?.status !== 422 || rejection.report.topic !== 'outline_alignment'
      || !Array.isArray(rejection.report.sections) || !rejection.report.sections.length) throw error;
    actionFailure = rejection;
  }
  return { facts, actionFailure, defects: [...facts.contradictions, ...(actionFailure?.report.sections || [])] };
}
