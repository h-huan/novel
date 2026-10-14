import { boundedDiscoveryMap } from './bounded-discovery-map';

/**
 * Distribute a final idea review into small, bounded independent groups while
 * presenting every other candidate as comparison evidence.
 * No group may silently pass or disappear if its reviewer fails.
 */
export async function reviewIdeaCardsInBatches<T, R>(
  cards: readonly T[],
  references: readonly T[],
  review: (batch: T[], comparisons: T[]) => Promise<R[]>,
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
    const findings = await review(group.batch, [...references, ...others]);
    if (!Array.isArray(findings) || findings.length !== group.batch.length) {
      throw Error('independent idea reviewer returned an incomplete group');
    }
    return findings;
  });
  const rejected = settled.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (rejected) throw rejected.reason;
  return settled.flatMap(result => result.status === 'fulfilled' ? result.value : []);
}
