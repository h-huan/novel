/** Separate an intentionally uncommitted framework from a storage failure.
 * Candidates generated before the framework Gate are not authoritative outlines.
 * A blocked outline Gate must never be bypassed to make persistence metrics green. */
export function classifyFrameworkPersistence(input: {
  projectStatus: string; creationStalled: boolean;
  observedMismatches: string[];
  runs: Array<{stage?:string;status?:string;gate_status?:string}>;
}) {
  const isCreating = input.projectStatus === 'creating';
  // Only the latest run can explain the *current* project failure. A stale
  // outline rejection from an earlier retry must not hide a new DB write fault.
  const lastRun = input.runs[0];
  const blockedBeforeFrameworkCommit = input.projectStatus === 'generation_failed'
    && lastRun?.stage === 'outline' && lastRun.status === 'failed'
    && lastRun.gate_status === 'blocked';
  const uncommittedCandidates: string[] = blockedBeforeFrameworkCommit
    ? input.observedMismatches.filter(code => code === 'outline_success_without_chapter_outline') : [];
  const remaining = input.observedMismatches.filter(code => !uncommittedCandidates.includes(code));
  return {
    persistenceMismatch: isCreating && !input.creationStalled ? [] : remaining,
    pendingPersistenceMismatch: isCreating && !input.creationStalled ? remaining : [],
    uncommittedCandidates,
    blockedBeforeFrameworkCommit,
  };
}
