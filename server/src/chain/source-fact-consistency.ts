/**
 * Generic deterministic consistency for already-identified story facts.
 * Public rule owner: CTX-005.
 *
 * This layer never guesses story-mechanic identity from nouns. Callers must supply
 * a stable identity (fact id / entity+field / deadline id). Free-form, ambiguous
 * claims belong to the semantic Gate.
 */
export type StructuredFactKind = 'number' | 'duration_hours' | 'deadline' | 'location' | 'state';

export interface StructuredFactClaim {
  identity: string;
  kind: StructuredFactKind;
  value: string | number;
  source: string;
  unit?: string;
  certainty?: 'explicit' | 'derived';
}

export interface StructuredFactConflict {
  ruleId: 'CTX-005';
  identity: string;
  kind: StructuredFactKind;
  claims: StructuredFactClaim[];
  message: string;
}

const text = (value: string | number) => String(value).trim().replace(/\s+/g, ' ');
const identity = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
const unit = (value?: string) => String(value || '').trim().toLowerCase();

function comparableValue(claim: StructuredFactClaim): string | number | null {
  if (claim.kind === 'number' || claim.kind === 'duration_hours') {
    const parsed = typeof claim.value === 'number' ? claim.value : Number(text(claim.value));
    return Number.isFinite(parsed) ? parsed : null;
  }
  const normalized = text(claim.value);
  return normalized ? normalized : null;
}

function conflictInGroup(claims: StructuredFactClaim[]): boolean {
  const values = claims.map(comparableValue);
  if (values.some((value) => value === null)) return false;
  if (claims[0].kind === 'number') {
    const units = new Set(claims.map((claim) => unit(claim.unit)));
    if (units.size > 1) return false;
  }
  return new Set(values.map((value) => String(value))).size > 1;
}

export function detectStructuredFactConflicts(claims: readonly StructuredFactClaim[]): StructuredFactConflict[] {
  const groups = new Map<string, StructuredFactClaim[]>();
  for (const claim of claims) {
    const factIdentity = identity(claim.identity);
    if (!factIdentity || !claim.source.trim()) continue;
    const key = `${factIdentity}\u0000${claim.kind}`;
    const group = groups.get(key) ?? [];
    group.push({ ...claim, identity: factIdentity, source: claim.source.trim() });
    groups.set(key, group);
  }

  const conflicts: StructuredFactConflict[] = [];
  for (const group of groups.values()) {
    if (group.length < 2 || !conflictInGroup(group)) continue;
    conflicts.push({
      ruleId: 'CTX-005',
      identity: group[0].identity,
      kind: group[0].kind,
      claims: group,
      message: `同一事实“${group[0].identity}”存在可确定验证的互斥值：${group.map((claim) => `${claim.source}=${text(claim.value)}${claim.unit ? ` ${claim.unit}` : ''}`).join('；')}。`,
    });
  }
  return conflicts;
}
