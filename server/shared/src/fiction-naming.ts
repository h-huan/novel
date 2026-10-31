import { FICTION_NAMING_POLICY } from './system-workflow-rules.registry';

export function fictionNarrativeText(value: Record<string, any>): string {
  const text = (part: unknown): string => typeof part === 'string' ? part
    : Array.isArray(part) ? part.map(text).join('\n')
    : part && typeof part === 'object' ? Object.values(part).map(text).join('\n') : '';
  return FICTION_NAMING_POLICY.narrativeFields.map(field => text(value?.[field])).filter(Boolean).join('\n');
}

export function prohibitedFictionNames(value: Record<string, any>): string[] {
  const content = fictionNarrativeText(value).toLowerCase();
  return FICTION_NAMING_POLICY.prohibitedNames.filter(name => content.includes(name.toLowerCase()));
}

/** Normalize known prohibited names in a GENERATED, not-yet-confirmed idea.
 * Never rewrite platform/model metadata or identity; the ordinary naming Gate
 * verifies the result. Unknown names have no guessed automatic substitute. */
export function normalizeGeneratedFictionNames(value: Record<string, any>): Record<string, any> {
  const present=prohibitedFictionNames(value);
  if(!present.length)return value;
  const aliases=FICTION_NAMING_POLICY.fictionalAliases as Record<string,string>;
  const mapping=Object.fromEntries(present.map(name=>{
    const alias=aliases[name];
    if(!alias)throw Error('禁止名称缺少经统一规则授权的虚构替换名：'+name);
    return [name,alias];
  }));
  return applyFictionNamingReplacements(value,mapping);
}

/** Literal name-only edits of narrative values; identifiers and settings stay intact. */
export function applyFictionNamingReplacements(value: Record<string, any>, replacements: unknown): Record<string, any> {
  if (!replacements || typeof replacements !== 'object' || Array.isArray(replacements) || !Object.keys(replacements).length)
    throw new Error('故事命名修复必须给出完整名称映射');
  const next = { ...value };
  for (const [oldName, newName] of Object.entries(replacements)) {
    if (!FICTION_NAMING_POLICY.prohibitedNames.some(name => name.toLowerCase() === oldName.toLowerCase())
      || typeof newName !== 'string' || newName.trim().length < 2 || newName.length > 30
      || prohibitedFictionNames({ title: newName }).length) throw new Error('故事命名修复只能将禁止名称改为原创虚构名称');
    const pattern = new RegExp(oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const replace = (part: unknown): unknown => typeof part === 'string' ? part.replace(pattern, () => newName.trim())
      : Array.isArray(part) ? part.map(replace)
      : part && typeof part === 'object' ? Object.fromEntries(Object.entries(part).map(([key, entry]) => [key, replace(entry)])) : part;
    for (const field of FICTION_NAMING_POLICY.narrativeFields) if (field in next) next[field] = replace(next[field]);
  }
  return next;
}
