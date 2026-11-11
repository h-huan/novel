/**
 * Budget-based batching for outline fact reviews.
 *
 * A fixed "four chapters per batch" ignores both chapter size and the review
 * model's input budget: four very long chapters can overflow one call, while
 * four short chapters can fit together. Batches are accumulated from the work
 * itself, and `prior` keeps the complete accepted prefix so cumulative facts
 * are never dropped.
 */

export interface FactReviewBatch<T> {
  /** Chapters reviewed together in this call. */
  batch: T[];
  /** The complete accepted prefix before this batch. */
  prior: T[];
}

export interface FactReviewBatchOptions<T = unknown> {
  /** Upper bound on chapters per call; 0 means only the character budget decides. */
  maxChaptersPerBatch?: number;
  /** Upper bound on serialized chapter characters per call; 0 means no char limit. */
  maxCharsPerBatch?: number;
  /** Size measure used for the character budget. */
  sizeOf?: (item: T) => number;
}

const DEFAULT_SIZE = (item: unknown) => {
  try {
    return JSON.stringify(item).length;
  } catch {
    return 0;
  }
};

export function planFactReviewBatches<T>(
  items: readonly T[],
  options: FactReviewBatchOptions<T> = {},
): FactReviewBatch<T>[] {
  const maxChapters = Math.max(0, Math.floor(options.maxChaptersPerBatch ?? 0));
  const maxChars = Math.max(0, Math.floor(options.maxCharsPerBatch ?? 0));
  const sizeOf = options.sizeOf ?? DEFAULT_SIZE;
  const batches: FactReviewBatch<T>[] = [];
  let start = 0;
  while (start < items.length) {
    const batch: T[] = [];
    let chars = 0;
    while (start + batch.length < items.length) {
      const next = items[start + batch.length];
      const nextChars = Math.max(0, sizeOf(next));
      // A single oversized chapter still forms its own batch; it is never
      // silently dropped or split (facts belong to whole chapters).
      if (batch.length > 0 && maxChars > 0 && chars + nextChars > maxChars) break;
      if (batch.length > 0 && maxChapters > 0 && batch.length >= maxChapters) break;
      batch.push(next);
      chars += nextChars;
    }
    if (!batch.length) batch.push(items[start]);
    batches.push({ batch, prior: items.slice(0, start) });
    start += batch.length;
  }
  return batches;
}
