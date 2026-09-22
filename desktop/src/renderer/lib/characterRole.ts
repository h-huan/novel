export type CharacterRoleGroup = 'protagonist' | 'major' | 'supporting' | 'minor';

/**
 * Generation data contains both the UI role vocabulary and older/model-facing
 * values such as `main`, `重要配角` and `导师同盟`.  Keep every character
 * visible by mapping those values into the four display groups.
 */
export function normalizeCharacterRole(value: unknown): CharacterRoleGroup {
  const role = String(value || '').trim().toLowerCase();
  if (/^(protagonist|主角|男主角|女主角)$/.test(role)) return 'protagonist';
  if (/^(major|main|lead|co-protagonist|重要角色|核心角色|重要配角|主要反派|反派)$/.test(role)) return 'major';
  if (/^(minor|extra|cameo|龙套|路人|短线功能)$/.test(role)) return 'minor';
  if (/导师|同盟|support|配角|辅助/.test(role)) return 'supporting';
  return 'supporting';
}
