import { describe, expect, it } from 'vitest';
import { planFactReviewBatches } from './fact-review-batching';

const chapters = (sizes: number[]) => sizes.map((size, index) => ({ order: index, content: 'x'.repeat(size) }));
const sizeOf = (item: { content: string }) => item.content.length;

describe('fact review batching', () => {
  it('keeps the old four-chapter shape when chapters are small', () => {
    const items = chapters([100, 100, 100, 100, 100]);
    const batches = planFactReviewBatches(items, { maxChaptersPerBatch: 4, sizeOf });
    expect(batches.map(b => b.batch.map(c => c.order))).toEqual([[0, 1, 2, 3], [4]]);
    expect(batches[1].prior.map(c => c.order)).toEqual([0, 1, 2, 3]);
  });

  it('splits earlier when the serialized chapters exceed the character budget', () => {
    const items = chapters([900, 900, 900, 900]);
    const batches = planFactReviewBatches(items, { maxCharsPerBatch: 2000, sizeOf });
    expect(batches.map(b => b.batch.map(c => c.order))).toEqual([[0, 1], [2, 3]]);
    expect(batches[1].prior.map(c => c.order)).toEqual([0, 1]);
  });

  it('merges more chapters when they are small and no chapter cap is set', () => {
    const items = chapters([100, 100, 100, 100, 100, 100]);
    const batches = planFactReviewBatches(items, { maxCharsPerBatch: 450, sizeOf });
    expect(batches.map(b => b.batch.map(c => c.order))).toEqual([[0, 1, 2, 3], [4, 5]]);
  });

  it('never drops or reorders an oversized single chapter', () => {
    const items = chapters([5000, 100, 100]);
    const batches = planFactReviewBatches(items, { maxCharsPerBatch: 2000, sizeOf });
    expect(batches.map(b => b.batch.map(c => c.order))).toEqual([[0], [1, 2]]);
    expect(batches.flatMap(b => b.batch.map(c => c.order))).toEqual([0, 1, 2]);
  });

  it('keeps the complete accepted prefix for every batch', () => {
    const items = chapters([100, 100, 100, 100, 100, 100, 100, 100, 100]);
    const batches = planFactReviewBatches(items, { maxChaptersPerBatch: 4, sizeOf });
    for (const [index, batch] of batches.entries()) {
      const firstOrder = batch.batch[0].order;
      expect(batch.prior.map(c => c.order)).toEqual(items.slice(0, firstOrder).map(c => c.order));
      expect(batch.prior.length).toBe(firstOrder);
      if (index > 0) expect(batch.prior.length).toBeGreaterThan(0);
    }
  });
});
