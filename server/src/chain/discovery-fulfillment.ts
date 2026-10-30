/** Delivery slots are bounded by the user's request, never by the number of
 * independently vetted or fully generated candidate cards. */
/** The generation and final review share one non-increasing budget. Reserve
 * enough for one independent review per presentation batch before offering
 * new candidates to paid screening. Never allocate from a delivery shortfall
 * alone: a missing 3/5 and only 2 affordable reviews cannot complete 5/5. */
export function affordableFullCardRefillCount(
 availableSeeds: number, physicalCredits: number, reviewBatchSize: number,
): number {
 if (![availableSeeds,physicalCredits,reviewBatchSize].every(Number.isInteger)
  || availableSeeds < 0 || physicalCredits < 0 || reviewBatchSize < 1)
  throw Error('完整卡补足容量参数无效');
 let count=Math.min(availableSeeds,physicalCredits);
 while(count>0 && count+Math.ceil(count/reviewBatchSize)>physicalCredits)count--;
 return count;
}

export function missingRequestedIdeaSlots(slotIds:readonly string[],acceptedIds:ReadonlySet<string>,requestedCount:number):string[] {
  return slotIds.filter(id=>!!id&&!acceptedIds.has(id)).slice(0,Math.max(0,requestedCount-acceptedIds.size));
}
