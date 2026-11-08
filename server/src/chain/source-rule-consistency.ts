/**
 * Generic world-source shape validation.
 * Public rule owner: AUTH-002 / CTX-005.
 *
 * Free-form story-mechanic contradictions are intentionally NOT encoded here.
 * They require stable fact/rule identity (source-fact-consistency.ts) or semantic
 * cross-source review. No novel-specific nouns or mechanisms belong in this file.
 */
/** A free-text protagonist description is not a name. Only an explicitly
 * authored name marker or a structured name property may become a mandatory
 * exact-name requirement; role/kinship wording stays prompt context and never
 * enters a closed role dictionary or a first-token name guess. */
const EXPLICIT_PERSON_NAME = /^(?:我(?:叫|名叫)|姓名[:：]|主角姓名[:：]|人物姓名[:：])\s*([\p{Script=Han}]{1,4})(?=[，,。：:；;\s（(]|$)/u;

function nameText(value: unknown): string {
  return typeof value === 'string' ? value.trim()
    : value && typeof value === 'object' ? String((value as {name?: unknown}).name || '').trim()
      : '';
}

/** Only explicit name markers or structured name properties qualify. */
export function confirmedStoryCharacterNames(characters: unknown): string[] {
  const rows = Array.isArray(characters) ? characters : [];
  const names = rows.flatMap(row => {
    if (row && typeof row === 'object') {
      const structured = String((row as {name?: unknown}).name || '').trim();
      return structured ? [structured] : [];
    }
    const raw = nameText(row);
    const explicit = raw ? EXPLICIT_PERSON_NAME.exec(raw) : null;
    return explicit ? [explicit[1]] : [];
  });
  return [...new Set(names)];
}

/** Bind only a genuinely confirmed name; a free-text role description must
 * never become a mandatory personal name. A structured name property is
 * already explicit; a string must carry an explicit name marker. */
export function confirmedWorldProtagonistName(protagonist: unknown, _confirmedCharacters?: unknown): string {
  if (protagonist && typeof protagonist === 'object') {
    const structured = String((protagonist as {name?: unknown}).name || '').trim();
    return structured;
  }
  const raw = typeof protagonist === 'string' ? protagonist.trim() : '';
  if (!raw) return '';
  const explicit = EXPLICIT_PERSON_NAME.exec(raw);
  return explicit ? explicit[1] : '';
}

/** Preserve the exact authored world rules on initial persistence and frozen
 * readback. Historical long records nested the whole rules array in another
 * array; this projection only flattens transport wrappers, never invents a
 * world rule, changes a restriction, or supplies a semantic verdict. */
export function normalizeWorldRuleStrings(value:unknown):string[]{
 let source=value;
 if(typeof source==='string'&&source.trim().startsWith('[')){
  try{const parsed=JSON.parse(source);if(Array.isArray(parsed))source=parsed;}
  catch{throw new Error('冻结世界规则数组JSON无效，不能将原始传输文本误认成一条规则');}
 }
 const rules:string[]=[];
 const append=(item:unknown):void=>{
  if(Array.isArray(item)){for(const child of item)append(child);}
  else if(typeof item==='string'&&item.trim())rules.push(item.trim());
 };
 append(source);
 return rules;
}

/** Keep the protagonist selected by the confirmed story or long skeleton as the
 * first persisted POV character. Model array order is not story authority;
 * ambiguous or missing matches fail before chapter planning or Canon writes. */
export function orderConfirmedProtagonistCharacters<T extends {name?:unknown}>(
 characters:readonly T[],confirmedProtagonist:unknown):T[]{
 const names=characters.map(item=>typeof item.name==='string'?item.name.trim():'');
 if(names.some(name=>!name)||new Set(names).size!==names.length)
  throw new Error('生成人物存在无姓名或同名重复档案，不能误建主视角身份');
 const source=typeof confirmedProtagonist==='string'?confirmedProtagonist.trim():'';
 if(!source)throw new Error('确认题材或主线地基缺少主角姓名，不能凭角色顺序猜定主视角');
 const leading=source.replace(/^(?:主角|男主角|女主角|男主|女主|第一人称主角)[：:\s]*/u,'')
  .split(/[，,、；;\s（(]/u)[0].trim();
 const exact=characters.filter(item=>typeof item.name==='string'&&item.name.trim()===leading);
 const matches=exact.length===1?exact:characters.filter(item=>{
  const name=typeof item.name==='string'?item.name.trim():'';
  return !!name&&source.includes(name);
 });
 if(matches.length!==1)throw new Error('已确认主角与生成人物未形成唯一同名身份，禁止把第一位配角标为主角');
 const lead=matches[0];return [lead,...characters.filter(item=>item!==lead)];
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
