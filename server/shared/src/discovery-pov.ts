/** Discovery may offer several POV choices; each accepted story still owns one POV. */
export function discoveryPovChoices(value: unknown): string[] {
  if (Array.isArray(value)) return [...new Set(value.filter((v): v is string => typeof v === 'string').map(v => v.trim()).filter(Boolean))];
  if (typeof value !== 'string' || !value.trim()) return [];
  const text = value.trim();
  if (text.startsWith('[')) { try { const parsed: unknown = JSON.parse(text); if (Array.isArray(parsed)) return discoveryPovChoices(parsed); } catch { /* Keep invalid legacy text visible to validation. */ } }
  return [text];
}
export function toggleDiscoveryPov(value: string, item: string): string {
  const chosen = discoveryPovChoices(value), next = chosen.includes(item) ? chosen.filter(v => v !== item) : [...chosen, item];
  return next.length > 1 ? JSON.stringify(next) : next[0] || '';
}
export function discoveryPovMatches(value: unknown, candidate: unknown): boolean {
  const choices = discoveryPovChoices(value);
  return !choices.length || (typeof candidate === 'string' && choices.includes(candidate.trim()));
}
export function discoveryPovForIdea(value: unknown, candidate: unknown): string {
  const choices = discoveryPovChoices(value), pov = typeof candidate === 'string' ? candidate.trim() : '';
  return choices.length === 1 ? choices[0] : discoveryPovMatches(value, pov) ? pov : '';
}
