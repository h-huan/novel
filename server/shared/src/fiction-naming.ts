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
