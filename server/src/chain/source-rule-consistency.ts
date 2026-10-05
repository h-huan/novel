/**
 * Generic world-source shape validation.
 * Public rule owner: AUTH-002 / CTX-005.
 *
 * Free-form story-mechanic contradictions are intentionally NOT encoded here.
 * They require stable fact/rule identity (source-fact-consistency.ts) or semantic
 * cross-source review. No novel-specific nouns or mechanisms belong in this file.
 */
export function describeWorldSourceCandidate(value: unknown, protagonistName = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['世界观未返回JSON对象'];
  const world = value as Record<string, unknown>;
  const problems: string[] = [];
  for (const field of ['era', 'storyPremise', 'atmosphere', 'endingDirection']) {
    if (typeof world[field] !== 'string' || !String(world[field]).trim()) problems.push(`世界观缺少${field}`);
  }
  if (!Array.isArray(world.rules) || world.rules.length === 0
    || world.rules.some((rule) => typeof rule !== 'string' || !rule.trim())) {
    problems.push('世界观rules必须包含至少一条非空因果规则；具体数量由本作品结构需要决定，不设公共固定配额');
  }
  if (!Array.isArray(world.locations) || !world.locations.some((location) => typeof location === 'string' && location.trim())) {
    problems.push('世界观缺少有效locations');
  }
  if (protagonistName && !String(world.storyPremise || '').includes(protagonistName)) {
    problems.push(`世界观storyPremise未保留主角“${protagonistName}”`);
  }
  return problems;
}
