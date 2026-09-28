/**
 * Cross-stage automatic mutation is intentionally disabled at the persistence boundary.
 *
 * The creation pipeline currently reviews a proposed patch only after the caller has
 * written it to live Canon. If that second review fails, the project is blocked but
 * the mutated world/character/outline facts remain persisted. Until the caller is
 * refactored to review an in-memory candidate and commit only after PASS, returning
 * any replacement here would permit unreviewed AI output to enter Canon.
 *
 * Keep the function as the single compatibility boundary for the existing caller,
 * but never authorize a live mutation. The surrounding creation Gate will observe
 * that Canon did not change and stop activation instead of polluting accepted facts.
 */
export function applyCrossStagePatch(_original: string, _match: string, _replacement: string): null {
  return null;
}
