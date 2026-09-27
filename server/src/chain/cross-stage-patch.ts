/** Preserve the complete stored field while repairing one uniquely located fact. */
export function applyCrossStagePatch(original: string, match: string, replacement: string): string | null {
  if (!match.trim() || !replacement.trim() || match.length > 300 || replacement.length > 600) return null;
  const offset = original.indexOf(match);
  if (offset < 0 || original.indexOf(match, offset + match.length) >= 0) return null;
  const result = original.slice(0, offset) + replacement + original.slice(offset + match.length);
  if (/^\s*[\[{]/.test(original)) {
    try { JSON.parse(original); JSON.parse(result); } catch { return null; }
  }
  return result;
}
