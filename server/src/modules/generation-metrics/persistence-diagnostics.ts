/** Separate an intentionally uncommitted framework from a storage failure.
 * Candidates generated before the framework Gate are not authoritative outlines.
 * A blocked outline Gate must never be bypassed to make persistence metrics green. */
export function classifyFrameworkPersistence(input: {
  projectStatus: string; creationStalled: boolean;
  observedMismatches: string[];
  runs: Array<{stage?:string;status?:string;gate_status?:string}>;
}) {
  const isCreating = input.projectStatus === 'creating';
  const blockedBeforeFrameworkCommit = input.projectStatus === 'generation_failed' && input.runs.some(run =>
    run.stage === 'outline' && run.status === 'failed' && run.gate_status === 'blocked');
  const uncommittedCandidates = blockedBeforeFrameworkCommit
    ? input.observedMismatches.filter(code => code === 'outline_success_without_chapter_outline') : [];
  const remaining = input.observedMismatches.filter(code => !uncommittedCandidates.includes(code));
  return {
    persistenceMismatch: isCreating && !input.creationStalled ? [] : remaining,
    pendingPersistenceMismatch: isCreating && !input.creationStalled ? remaining : [],
    uncommittedCandidates,
    blockedBeforeFrameworkCommit,
  };
}
