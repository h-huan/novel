import { chooseMinimumImpactRepair, type CanonRepairCandidate, type CanonSourceType } from '../modules/canon/canon-policy';

/**
 * Cross-stage repair is a candidate transformation boundary, not a persistence API.
 * The caller must apply patches to an in-memory candidate, re-review that candidate,
 * and only then persist the exact reviewed values with optimistic old-value checks.
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

export interface CrossStagePatchProposal {
  entityType: string;
  entityId: string;
  field: string;
  match: string;
  replacement: string;
  reason?: string;
  dependentCount?: number;
}

function repairSourceType(entityType: string): CanonSourceType | null {
  switch (entityType) {
    case 'character': return 'character';
    case 'chapter': return 'chapter_plan';
    case 'foreshadowing': return 'foreshadowing';
    // 组织和地点属于当前世界中的派生状态，不具备修改世界观本身的权限。
    case 'organization':
    case 'mapPoint': return 'state';
    default: return null;
  }
}

/**
 * 同一条矛盾若模型给出多个可修改位置，只保留机器成本最低的位置。
 * 同一实体上的多个字段补丁会一起保留，以免把一个局部一致性修复拆残。
 */
export function selectMinimumImpactCrossStagePatches(
  proposals: readonly CrossStagePatchProposal[],
): CrossStagePatchProposal[] {
  const grouped = new Map<string, CrossStagePatchProposal[]>();
  for (const proposal of proposals) {
    if (isImmutableWorldPatchTarget(proposal.entityType)) continue;
    const sourceType = repairSourceType(proposal.entityType);
    if (!sourceType) continue;
    const reason = String(proposal.reason || '').trim() || `${proposal.entityType}:${proposal.entityId}:${proposal.field}`;
    const group = grouped.get(reason) || [];
    group.push(proposal);
    grouped.set(reason, group);
  }

  const selected: CrossStagePatchProposal[] = [];
  for (const group of grouped.values()) {
    const byTarget = new Map<string, { patches: CrossStagePatchProposal[]; candidate: CanonRepairCandidate }>();
    for (const proposal of group) {
      const sourceType = repairSourceType(proposal.entityType);
      if (!sourceType) continue;
      const key = `${proposal.entityType}:${proposal.entityId}`;
      const existing = byTarget.get(key);
      if (existing) {
        existing.patches.push(proposal);
        existing.candidate.changeUnits = existing.patches.length;
        existing.candidate.dependentCount = Math.max(
          Number(existing.candidate.dependentCount || 0),
          Math.max(0, Number(proposal.dependentCount || 0)),
        );
      } else {
        byTarget.set(key, {
          patches: [proposal],
          candidate: {
            sourceType,
            sourceId: proposal.entityId,
            temporalState: 'future_plan',
            dependentCount: Math.max(0, Number(proposal.dependentCount || 0)),
            changeUnits: 1,
          },
        });
      }
    }
    const targets = [...byTarget.values()];
    const decision = chooseMinimumImpactRepair(targets.map(item => item.candidate));
    if (!decision.target) continue;
    const winner = targets.find(item => item.candidate === decision.target);
    if (winner) selected.push(...winner.patches);
  }
  return selected;
}

/**
 * Pure candidate patcher. It never writes Canon.
 * - match must occur exactly once;
 * - JSON text that was valid before must remain valid after replacement;
 * - malformed/ambiguous patches are rejected with null.
 */
export function applyCrossStagePatch(original: string, match: string, replacement: string): string | null {
  if (typeof original !== 'string' || typeof match !== 'string' || typeof replacement !== 'string') return null;
  if (!match.length || original === replacement) return null;
  const first = original.indexOf(match);
  if (first < 0 || original.indexOf(match, first + match.length) >= 0) return null;
  const candidate = `${original.slice(0, first)}${replacement}${original.slice(first + match.length)}`;
  if (candidate === original) return null;

  const trimmed = original.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(original);
    } catch {
      // 原字段本来就不是有效 JSON 时，不额外宣称 JSON 约束。
      return candidate;
    }
    try {
      JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  return candidate;
}
