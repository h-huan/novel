import { boundedDiscoveryMap } from './bounded-discovery-map';

/**
 * Distribute a final idea review into small, bounded independent groups while
 * presenting every other candidate as comparison evidence.
 * No group may silently pass or disappear if its reviewer fails.
 */
export async function reviewIdeaCardsInBatches<T, R>(
  cards: readonly T[],
  references: readonly T[],
  review: (batch: T[], comparisons: T[], start: number) => Promise<R[]>,
  groupSize = 3,
  concurrency = 2,
): Promise<R[]> {
  if (!Number.isInteger(groupSize) || groupSize < 1) throw Error('idea review groupSize must be positive');
  if (!Number.isInteger(concurrency) || concurrency < 1) throw Error('idea review concurrency must be positive');
  const groups: Array<{start: number; batch: T[]}> = [];
  for (let start = 0; start < cards.length; start += groupSize) {
    groups.push({start, batch: cards.slice(start, start + groupSize)});
  }
  const settled = await boundedDiscoveryMap(groups, concurrency, async group => {
    const others = cards.filter((_, index) => index < group.start || index >= group.start + group.batch.length);
    const findings = await review(group.batch, [...references, ...others], group.start);
    if (!Array.isArray(findings) || findings.length !== group.batch.length) {
      throw Error('independent idea reviewer returned an incomplete group');
    }
    return findings;
  });
  const rejected = settled.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (rejected) throw rejected.reason;
  return settled.flatMap(result => result.status === 'fulfilled' ? result.value : []);
}

/**
 * Reviewer-local C1/C2 evidence IDs must be rebased before the results are
 * stored together as a five-card audit. Text and quote evidence is unchanged;
 * only server-owned references and the numeric position are rebased.
 */
export function rebaseIdeaReviewReferences<T extends Record<string, any>>(
  verdict: T, offset: number, localCount: number,
): T {
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(localCount) || localCount < 1) {
    throw Error('invalid idea reviewer evidence offset');
  }
  const result = structuredClone(verdict);
  const reference = (raw: unknown) => {
    if (typeof raw !== 'string') return raw;
    return raw.replace(/\\bC(\\d+)(?=\\.)/g, (matched, n) => {
      const position = Number(n);
      return position >= 1 && position <= localCount ? 'C' + (position + offset) : matched;
    });
  };
  const keys = ['storyEvidenceRef','payoffEvidenceRef','platformEvidenceRef'];
  for (const key of keys) if(key in result)result[key]=reference(result[key]);
  if(result.payoffBridge && typeof result.payoffBridge === 'object'){
    for(const key of ['actionEvidenceRef','resultEvidenceRef','conditionEvidenceRef']){
      if(key in result.payoffBridge)result.payoffBridge[key]=reference(result.payoffBridge[key]);
    }
    if(typeof result.payoffBridge.reason==='string')result.payoffBridge.reason=reference(result.payoffBridge.reason);
  }
  if(result.readerGoals && typeof result.readerGoals === 'object'){
    for(const value of Object.values(result.readerGoals)){
      if(value && typeof value === 'object' && 'evidenceRef' in (value as object)){
        (value as Record<string,unknown>).evidenceRef=reference((value as Record<string,unknown>).evidenceRef);
      }
    }
  }
  for(const key of ['qualityReason']){
    if(typeof result[key]==='string')result[key]=reference(result[key]);
  }
  if(Number.isInteger(result.position))result.position+=offset;
  return result;
}
