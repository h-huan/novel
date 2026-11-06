/**
 * Generic world-source shape validation.
 * Public rule owner: AUTH-002 / CTX-005.
 *
 * Free-form story-mechanic contradictions are intentionally NOT encoded here.
 * They require stable fact/rule identity (source-fact-consistency.ts) or semantic
 * cross-source review. No novel-specific nouns or mechanisms belong in this file.
 */
/** Bind only a genuinely confirmed name; an anonymous narrator or role
 * description must never become a mandatory personal name in the world plan. */
export function confirmedWorldProtagonistName(protagonist: unknown): string {
  const raw = typeof protagonist === 'string' ? protagonist.trim() : '';
  if (!raw) return '';
  const explicitlyNamed = /^我(?:叫|名叫)([\p{Script=Han}]{1,4})(?=[，,。：:；;\s（(]|$)/u.exec(raw);
  if (explicitlyNamed) return explicitlyNamed[1];
  const token = raw.split(/[，,。：:；;\s（(]/)[0].trim();
  if (/^(?:我|本人|主角|叙述者|匿名主角|无名主角|未命名主角|第一人称主角)$/.test(token)
    || /^我(?:是|在|曾|被|要|想|有|没|从|正|只|以|靠|做|原|后来)/.test(token)
    || /^(?:一名|一个|这位|这名|某位)/.test(token)) return '';
  return token;
}

/** Restore only an unambiguous complete world OBJECT from a provider's
 * alternate JSON root. Do not extract a nested fragment, infer missing fields,
 * add world facts or mark a failed semantic/source Gate as passed. */
export function normalizeWorldSourceCandidate(value: unknown): unknown {
 let candidate=value;
 // A structured-mode provider may serialize the complete JSON object twice.
 // Only whole-document JSON.parse is allowed; never salvage prose fragments.
 for(let depth=0;depth<2&&typeof candidate==='string';depth++){
  const text=candidate.trim();
  if(!text.startsWith('{')&&!text.startsWith('[')&&!text.startsWith('"'))break;
  try{candidate=JSON.parse(text);}catch{break;}
 }
 if(Array.isArray(candidate)){
  if(candidate.length!==1||!candidate[0]||typeof candidate[0]!=='object'||Array.isArray(candidate[0]))return candidate;
  candidate=candidate[0];
 }
 if(candidate&&typeof candidate==='object'&&!Array.isArray(candidate)){
  const entries=Object.entries(candidate);
  if(entries.length===1&&['world','worldview','worldSetting'].includes(entries[0][0])){
   const inner=entries[0][1];
   if(inner&&typeof inner==='object'&&!Array.isArray(inner))return inner;
  }
 }
 return candidate;
}

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
