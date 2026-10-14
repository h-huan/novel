/** Formatting equality preserves punctuation, numbers, order and ASCII word boundaries. */
export function proseLayoutIdentity(content: string): string {
  return content.replace(/[【】]/g, '').replace(/\s+/g, ' ').replace(/(?<![A-Za-z0-9]) | (?![A-Za-z0-9])/g, '').trim();
}
export function isProseLayoutOnlyChange(before: string, after: string): boolean {
  return !!before.trim() && before !== after && proseLayoutIdentity(before) === proseLayoutIdentity(after);
}
