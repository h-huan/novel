import { causalEvidenceAnchors } from './causal-review';

/** Multiple paragraph IDs denote a continuous span, never stitched quotations. */
export function resolveCitationAnchor(anchorId: unknown, expectedSource: string, content: string, sources: Record<string, string>): string | undefined {
  if (typeof anchorId !== 'string') return undefined;
  const anchors = new Map(causalEvidenceAnchors(content, sources).map(row => [row.id, row]));
  const ids = anchorId.split(',').map(id => id.trim());
  if (!ids.length || new Set(ids).size !== ids.length) return undefined;
  const rows = ids.map(id => anchors.get(id));
  if (rows.some(row => !row || row.source !== expectedSource)) return undefined;
  if (ids.length === 1) return rows[0]!.text;
  const indexes = ids.map(id => { const match = id.match(/:p([1-9]\d*)$/); return match ? Number(match[1]) : NaN; });
  if (indexes.some(n => !Number.isFinite(n))) return undefined;
  indexes.sort((a, b) => a - b);
  const raw = expectedSource === 'body' ? content : sources[expectedSource];
  if (typeof raw !== 'string' || /^[\s]*[\[{]/.test(raw)) return undefined;
  const paragraphs = raw.split(/\n\s*\n/);
  let offset = 0;
  const locations = paragraphs.map(text => { const start = raw.indexOf(text, offset); offset = start + text.length; return { start, end: offset }; });
  const first = locations[indexes[0] - 1], last = locations[indexes[indexes.length - 1] - 1];
  if (!first || !last) return undefined;
  return raw.slice(first.start, last.end).trim();
}

