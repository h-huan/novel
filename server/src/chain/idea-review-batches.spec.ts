import { describe, it, expect } from 'vitest';
import { reviewIdeaCardsInBatches, rebaseIdeaReviewReferences } from './idea-review-batches';

describe('global provenance for independent idea review evidence',()=> {
  it('rebases local C1/C2 to full-batch C4/C5 without rewriting story quotes',()=>{
    const verdict={position:1,title:'未改变的标题',storyEvidenceRef:'C1.hook',payoffEvidenceRef:'C1.ending',
      platformEvidenceRef:'C1.hook',qualityReason:'根据C1.setting与C1.ending',
      payoffBridge:{actionEvidenceRef:'C1.scopeBreakdown[3].reason',resultEvidenceRef:'C1.ending',
        conditionEvidenceRef:'C2.coreConflict',reason:'C1.ending 需核实条件'},
      readerGoals:{click:{evidenceRef:'C1.title',reason:'一个实际风险'},completion:{evidenceRef:'C2.description'}},
      storyEvidence:'用户原始文案保持不变'};
    const changed=rebaseIdeaReviewReferences(verdict,3,2);
    expect(changed).toMatchObject({position:4,storyEvidenceRef:'C4.hook',payoffEvidenceRef:'C4.ending',
      platformEvidenceRef:'C4.hook',qualityReason:'根据C4.setting与C4.ending',
      payoffBridge:{actionEvidenceRef:'C4.scopeBreakdown[3].reason',resultEvidenceRef:'C4.ending',
        conditionEvidenceRef:'C5.coreConflict',reason:'C4.ending 需核实条件'},
      readerGoals:{click:{evidenceRef:'C4.title'},completion:{evidenceRef:'C5.description'}},
      storyEvidence:'用户原始文案保持不变'});
    expect(verdict.storyEvidenceRef).toBe('C1.hook');
    expect(verdict.position).toBe(1);
  });
});
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
