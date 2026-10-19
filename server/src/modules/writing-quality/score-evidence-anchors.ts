import { createHash } from 'node:crypto';

/** IDs are tied to the exact current artifact; selection never rewrites a quote. */
export function scoreEvidenceAnchors(content: string) {
  const prefix = 'E' + createHash('sha256').update(content).digest('hex').slice(0, 16);
  return Array.from(content.matchAll(/[^\r\n]+/g)).filter(match => match[0].trim())
    .map((match, index) => ({ id: prefix + '.' + (index + 1), quote: match[0], start: match.index!, end: match.index! + match[0].length }));
}

export function renderScoreEvidenceAnchors(content: string) {
  return scoreEvidenceAnchors(content).map(anchor => '[' + anchor.id + '] ' + anchor.quote).join('\n');
}

/** Unknown/stale IDs stay invalid, even if the report also supplies legacy quotes. */
export function selectedScoreEvidence(content: string, dimension: any): unknown[] {
  if (!dimension || !Object.prototype.hasOwnProperty.call(dimension, 'evidenceIds'))
    return Array.isArray(dimension?.evidence) ? dimension.evidence : [];
  const ids: unknown = dimension.evidenceIds;
  if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string')) return [];
  const anchors = new Map(scoreEvidenceAnchors(content).map(anchor => [anchor.id, anchor.quote]));
  if (ids.some(id => !anchors.has(id))) return [];
  return [...new Set(ids)].map(id => anchors.get(id)!);
}
