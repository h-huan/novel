/**
 * Cross-stage automatic mutation is intentionally disabled at the persistence boundary.
 *
 * The creation pipeline currently reviews a proposed patch only after the caller has
 * written it to live Canon. If that second review fails, the project is blocked but
 * the mutated character/outline facts remain persisted. Until the caller is refactored
 * to review an in-memory candidate and commit only after PASS, returning any replacement
 * here would permit unreviewed AI output to enter Canon.
 *
 * World Canon is deliberately absent from the mutable target map. World settings and
 * world profiles are reference-only after they are established; no cross-stage repair
 * may ever select them as a repair target.
 */
export const CROSS_STAGE_PATCH_TABLE_MAP: Readonly<Record<string, string>> = Object.freeze({
  character: 'characters',
  organization: 'organizations',
  mapPoint: 'map_points',
  chapter: 'outlines',
  foreshadowing: 'foreshadowings',
});

export const CROSS_STAGE_MUTABLE_ENTITY_TYPES = Object.freeze(Object.keys(CROSS_STAGE_PATCH_TABLE_MAP));

export function isImmutableWorldPatchTarget(entityType: unknown): boolean {
  return entityType === 'world' || entityType === 'worldProfile';
}

/**
 * Keep the function as the single compatibility boundary for the existing caller,
 * but never authorize a live mutation. The surrounding creation Gate will observe
 * that Canon did not change and stop activation instead of polluting accepted facts.
 */
export function applyCrossStagePatch(_original: string, _match: string, _replacement: string): null {
  return null;
}
