import { describe, it, expect } from 'vitest';
import { reviewIdeaCardsInBatches } from './idea-review-batches';

describe('independent idea Gate batching', () => {
  it('keeps 5 exact reviews in original order with complete out-of-group references', async () => {
    const cards = Array.from({length: 5}, (_, i) => ({id: 'P'+(i+1)}));
    const refs = [{id: 'old'}];
    const seen: Array<{batch: string[];comparisons: string[]}> = [];
    let running = 0;
    let peak = 0;
    const responses = await reviewIdeaCardsInBatches(cards, refs, async (batch, comparisons) => {
      running++;
      peak = Math.max(peak, running);
      try {
        seen.push({batch: batch.map(x=>x.id),comparisons:comparisons.map(x=>x.id)});
        await new Promise(resolve=>setTimeout(resolve, 3));
        return batch.map(x=>'passed:'+x.id);
      } finally {running--;}
    },3,2);
    expect(responses).toEqual(cards.map(x=>'passed:'+x.id));
    expect(peak).toBeLessThanOrEqual(2);
    expect(seen).toHaveLength(2);
    for (const item of seen) {
      expect(item.comparisons).toContain('old');
      const covered = [...item.batch, ...item.comparisons.filter(id=>id!=='old')].sort();
      expect(covered).toEqual(cards.map(x=>x.id).sort());
    }
  });
  it('never treats missing group output as accepted', async()=>{
    await expect(reviewIdeaCardsInBatches([1,2,3,4,5],[],async batch=>batch.length===2?[]:batch))
      .rejects.toThrow('incomplete');
  });
  it('never suppresses a rejected group while another succeeds', async()=>{
    await expect(reviewIdeaCardsInBatches([1,2,3,4,5],[],async batch=>{
      if(batch.length===2) throw Error('independent reviewer unavailable');
      return batch;
    })).rejects.toThrow('independent reviewer unavailable');
  });
});
