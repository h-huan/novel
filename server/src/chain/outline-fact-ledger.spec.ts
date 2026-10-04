import { describe, expect, it } from 'vitest';
import { buildOutlineFactReviewPrompt, describeOutlineFactReview, missingPriorLedgerEntries, normalizeOutlineFactReview, normalizeOutlineChaptersForFactReview } from './outline-fact-ledger';

describe('outline fact ledger review contract', () => {
  it('carries previous facts and full chapter evidence into the next review', () => {
    const prompt = buildOutlineFactReviewPrompt({
      canonicalBrief: '{"hook":"每次倒退一小时"}',
      world: { rules: '名单初始十四户' },
      previousLedger: ['名单：前批剩十三户'],
      chapters: [{ content: '第二次推门后只剩十二户', scenes: '[{"foreshadowing":"第十三行后空位"}]', characterActions: ['她划去一户'] }],
    });
    for (const evidence of [
      '每次倒退一小时', '前批剩十三户', '第二次推门后只剩十二户', '第十三行后空位',
      'characterActions', 'location1', 'quote1', 'location2', 'quote2', '状态摘要属于 ledger',
    ]) {
      expect(prompt).toContain(evidence);
    }
  });

  it('converts zero-based internal order into one-based chapterNumber before semantic review', () => {
    const normalized = normalizeOutlineChaptersForFactReview([{ order: 3, title: '广播响到一半', content: '本章（第4章）广播响到一半' }]);
    expect(normalized).toEqual([{ chapterNumber: 4, title: '广播响到一半', content: '本章（第4章）广播响到一半' }]);

    const prompt = buildOutlineFactReviewPrompt({
      canonicalBrief: '{}', world: {}, previousLedger: [],
      chapters: [{ order: 3, title: '广播响到一半', foreshadowingRecover: [{ reference: '第3章傍晚新增的债主未署名纸条' }], content: '本章（第4章）广播响到一半' }],
    });
    expect(prompt).toContain('"chapterNumber":4');
    expect(prompt).not.toContain('"order":3');
    expect(prompt).toContain('chapterNumber 是对外唯一章号');
  });

  it('rejects incomplete or self-contradictory review responses', () => {
    expect(describeOutlineFactReview({ consistent: false, contradictions: [], ledger: [] })).not.toEqual([]);
    expect(describeOutlineFactReview({ consistent: true, contradictions: [], ledger: ['名单：剩十三户'] })).toEqual([]);

    const unstructuredConflict = normalizeOutlineFactReview({
      consistent: false,
      contradictions: ['十四户与十三行冲突'],
      ledger: [],
    });
    expect(unstructuredConflict).toBeNull();
    expect(describeOutlineFactReview(unstructuredConflict)).not.toEqual([]);

    const contradictoryPass = normalizeOutlineFactReview({
      consistent: true,
      contradictions: [{
        location1: '世界观.rules[0]', quote1: '名单十四户',
        location2: '章纲.scenes[0]', quote2: '名单十二户',
        conflict: '同一时点总数不能同时为十四户和十二户', calculation: '14 != 12',
      }],
      ledger: [],
    });
    expect(describeOutlineFactReview(contradictoryPass)).toContain('consistent=true时contradictions必须为空数组');
  });

  it('does not silently lose a count baseline between batches', () => {
    expect(missingPriorLedgerEntries(['名单：剩十三户', '门后时间：每次倒退一小时'], ['名单：剩十二户']))
      .toEqual(['门后时间：每次倒退一小时']);
  });

  it('keeps only structured two-sided quoted contradictions blocking', () => {
    const review = normalizeOutlineFactReview({
      consistent: false,
      contradictions: [{
        location1: '世界观.rules[0]', quote1: '回拨一小时',
        location2: '章纲.scenes[0]', quote2: '手机快一小时',
        conflict: '同一次触发的时间方向相反', calculation: '-1h 与 +1h 互斥',
      }],
      ledger: [],
    });
    expect(describeOutlineFactReview(review)).toEqual([]);
    expect(review?.contradictions[0]).toContain('手机快一小时');
    expect(review?.consistent).toBe(false);
  });

  it('does not promote ledger summaries into blocking contradictions', () => {
    const review = normalizeOutlineFactReview({
      consistent: false,
      contradictions: [
        '阿托品/吗啡配比：三年前失踪案既定手法为阿托品一分、吗啡三分；本批无名男尸胃内残渣检出同一配比，content、scenes、characterActions三处一致，无增减。',
        '结案纸：本批第2场由陆秉坤拍在解剖台上1张；苏晚照当面签字画押；当前已签署，未归档交工部局。',
        '赵阿英报案回执：1张（三年前报案所留）；本批由赵阿英从门缝递进验尸房；当前仍为1张，是否由苏晚照收下未明写。',
        '伏笔台账：私章字口嵌河底细沙、尸袋编号被划掉炭笔重写两项，均于本批埋设，plannedRecoveryChapter为5；本批无回收项。',
      ],
      ledger: [],
    });

    expect(review).toBeNull();
    expect(describeOutlineFactReview(review)).not.toEqual([]);
  });
});
