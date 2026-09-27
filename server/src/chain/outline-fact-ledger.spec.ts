import { describe, expect, it } from 'vitest';
import { buildOutlineFactReviewPrompt, describeOutlineFactReview, missingPriorLedgerEntries, normalizeOutlineFactReview } from './outline-fact-ledger';

describe('outline fact ledger review contract', () => {
  it('carries previous facts and full chapter evidence into the next review', () => {
    const prompt = buildOutlineFactReviewPrompt({
      canonicalBrief: '{"hook":"每次倒退一小时"}',
      world: { rules: '名单初始十四户' },
      previousLedger: ['名单：前批剩十三户'],
      chapters: [{ content: '第二次推门后只剩十二户', scenes: '[{"foreshadowing":"第十三行后空位"}]' }],
    });
    for (const evidence of ['每次倒退一小时', '前批剩十三户', '第二次推门后只剩十二户', '第十三行后空位', '历史变化', '两处原文及算式']) {
      expect(prompt).toContain(evidence);
    }
  });

  it('rejects incomplete or self-contradictory review responses', () => {
    expect(describeOutlineFactReview({ consistent: false, contradictions: [], ledger: [] })).not.toEqual([]);
    expect(describeOutlineFactReview({ consistent: true, contradictions: [], ledger: ['名单：剩十三户'] })).toEqual([]);
    expect(describeOutlineFactReview({ consistent: false, contradictions: ['十四户与十三行冲突'], ledger: [] })).toEqual([]);
  });

  it('does not silently lose a count baseline between batches', () => {
    expect(missingPriorLedgerEntries(['名单：剩十三户', '门后时间：每次倒退一小时'], ['名单：剩十二户']))
      .toEqual(['门后时间：每次倒退一小时']);
  });

  it('keeps structured quoted contradictions blocking without another review call', () => {
    const review = normalizeOutlineFactReview({ consistent: false, contradictions: [{ rule: '时间方向', location1: '世界观.rules[0]', quote1: '回拨一小时', location2: '章纲.scenes[0]', quote2: '手机快一小时' }], ledger: [] });
    expect(describeOutlineFactReview(review)).toEqual([]);
    expect(review?.contradictions[0]).toContain('手机快一小时');
    expect(review?.consistent).toBe(false);
  });
});
