import { boundedDiscoveryMap } from './bounded-discovery-map';

// Nested source partitions must return unused reservations without resetting a
// physical-call allowance. Only the scheduler uses this accounting operation.
export type ReviewCallBudget={remaining:number; refundReservedCalls?:(amount:number)=>void};

/** Review independent partitions with the existing allowance and concurrency ceiling.
 * Reserve one first call per partition before any partition can retry. Surplus
 * remains shared, and unused reservations are returned even on protocol failure.
 * Always drain in-flight work before returning or allowing a repair to start.
 */
export async function independentReviewBatches<T, R>(items: readonly T[], parent: ReviewCallBudget,
  concurrency: number, review: (item: T, index: number, budget: ReviewCallBudget) => Promise<R>): Promise<R[]> {
  if (parent.remaining < items.length) throw new Error('审核共享物理调用预算不足以覆盖全部批次，不发起注定无法完成的审查');
  if (!items.length) return [];
  const credits = items.map(() => 1);
  parent.remaining -= items.length;
  let failed = false;
  try {
    const results = await boundedDiscoveryMap(items, concurrency, async (item, index) => {
      if (failed) throw new Error('前一批审核协议失败，未启动后续批次');
      const budget:ReviewCallBudget = {
        refundReservedCalls(amount:number) { credits[index] += amount; },
        get remaining() { return credits[index] + parent.remaining; },
        set remaining(value: number) {
          const used = this.remaining - value;
          if (!Number.isInteger(value) || value < 0 || used < 0) throw new Error('审核批次调用预算不得透支或重置');
          const reserved = Math.min(credits[index], used);
          credits[index] -= reserved;
          parent.remaining -= used - reserved;
        },
      };
      try { return await review(item, index, budget); }
      catch (error) { failed = true; throw error; }
    });
    const failure = results.find(result => result.status === 'rejected') as PromiseRejectedResult | undefined;
    if (failure) throw failure.reason;
    return results.map(result => (result as PromiseFulfilledResult<R>).value);
  } finally {
    const unused=credits.reduce((sum, credit) => sum + credit, 0);
    if(parent.refundReservedCalls)parent.refundReservedCalls(unused);
    else parent.remaining += unused;
  }
}
