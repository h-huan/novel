import { describe, expect, it } from 'vitest';
import { chapterFactsForReview, buildOutlineFactReviewPrompt, describeOutlineFactReview, normalizeOutlineFactReview, normalizeOutlineChaptersForFactReview } from './outline-fact-ledger';

describe('outline fact ledger review contract', () => {
  it.each([
    { mainScenes: [{ location: '星舰医务舱C区', item: '封存两支血清' }] },
    { scenes: [{ location: '南城七号楼906室', outcome: '钥匙交给邻居' }] },
    { coreContent: '主角住在西宫，尚未获知密诏', conflicts: ['不得进入东宫'] },
  ])('retains original facts even when the summary ledger omitted them: %j', source => {
    const prompt = buildOutlineFactReviewPrompt({ canonicalBrief: '{}', world: {}, previousLedger: [],
      sourceChapters: [chapterFactsForReview(0, source)], chapters: [{ order: 1, content: '新事件' }] });
    expect(prompt).toContain(JSON.stringify({ ...source, chapterNumber: 1 }));
    expect(prompt).toContain('【前批事实台账】[]');
    expect(prompt).not.toContain('"order":');
  });
  it.each(['mainScenes','scenes'])('carries accepted scene fields and all other facts through chapter review: %s',field=>{
    const draft={ [field]:[{location:'新城二号楼808室'}],coreContent:'人物在家等待',endingSetup:'收在门外来信',conflicts:[{trigger:'钥匙丢失'}],chapterNumber:99 };
    const input=chapterFactsForReview(2,draft);
    const normalized=normalizeOutlineChaptersForFactReview([input])[0] as any;
    expect(normalized[field]).toEqual(draft[field]);
    expect(normalized.coreContent).toBe(draft.coreContent);
    expect(normalized.conflicts).toEqual(draft.conflicts);
    expect(normalized.endingSetup).toBe(draft.endingSetup);
    expect(normalized.chapterNumber).toBe(3);
    const prompt=buildOutlineFactReviewPrompt({canonicalBrief:'{}',world:{},previousLedger:[],chapters:[input]});
    expect(prompt).toContain('新城二号楼808室');expect(prompt).toContain('钥匙丢失');expect(prompt).toContain('收在门外来信');
  });
  it('carries previous facts and full chapter evidence into the next review', () => {
    const prompt = buildOutlineFactReviewPrompt({
      canonicalBrief: '{"hook":"每次倒退一小时"}',
      world: { rules: '名单初始十四户' },
      previousLedger: [{ id: 'fact_1', baseline: '名单：初始十四户', history: [], current: '名单：前批剩十三户' }],
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
    expect(prompt).toContain('生效执行标准中的事实台账覆盖范围');
    expect(prompt).not.toContain('chapterNumber 是对外唯一章号');
  });

  it('rejects incomplete or self-contradictory review responses', () => {
    expect(describeOutlineFactReview({ consistent: false, contradictions: [], ledger: [] })).not.toEqual([]);
    expect(describeOutlineFactReview(normalizeOutlineFactReview({ consistent: true, contradictions: [], ledger: [{ current: '名单：剩十三户' }] }))).toEqual([]);

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

  it('preserves count baselines and unchanged facts when applying state deltas', () => {
    const previous = normalizeOutlineFactReview({ consistent: true, contradictions: [], ledger: [{ current: '名单：剩十三户' }, { current: '门后时间：每次倒退一小时' }] })!.ledger;
    const next = normalizeOutlineFactReview({ consistent: true, contradictions: [], ledger: [{ id: previous[0].id, current: '名单：剩十二户' }] }, previous)!;
    expect(next.ledger[0]).toEqual({ id: previous[0].id, baseline: '名单：剩十三户', history: ['名单：剩十三户'], current: '名单：剩十二户' });
    expect(next.ledger[1]).toEqual(previous[1]);
    expect(previous[0].current).toBe('名单：剩十三户');
    expect(previous[0].history).toEqual([]);
  });

  it('does not confuse renamed titles and chapter progression with missing facts', () => {
    const first = normalizeOutlineFactReview({ consistent: true, contradictions: [], ledger: [
      { current: '人物关系起始值：她与前夫已离婚' }, { current: '人物知识边界（第1章结束时）：未知过户复印件' },
    ] })!.ledger;
    const next = normalizeOutlineFactReview({ consistent: true, contradictions: [], ledger: [
      { id: first[0].id, current: '人物关系起始值与现状：仍已离婚，业主与钟点工' },
      { id: first[1].id, current: '人物知识边界（第2章结束时）：看见发票，仍未知过户复印件' },
    ] }, first)!;
    expect(describeOutlineFactReview(next)).toEqual([]);
    expect(next.ledger.map(entry => entry.id)).toEqual(first.map(entry => entry.id));
    expect(next.ledger.map(entry => entry.baseline)).toEqual(first.map(entry => entry.baseline));
    expect(next.ledger.map(entry => entry.history)).toEqual(first.map(entry => [entry.current]));
  });

  it('rejects legacy prose deltas so live reviews cannot silently lose object identity', () => {
    expect(normalizeOutlineFactReview({ consistent: true, contradictions: [], ledger: ['人物知识边界（第2章结束时）：仍未知过户复印件'] })).toBeNull();
  });

  it('rejects invented ids, duplicate updates and attempts to rewrite history', () => {
    const previous = normalizeOutlineFactReview({ consistent: true, contradictions: [], ledger: [{ current: '名单：十三户' }] })!.ledger;
    for (const ledger of [
      [{ id: 'invented', current: '名单：十二户' }],
      [{ current: '新物件：一张票' }, { id: 'fact_2', current: '伪造同批新编号更新' }],
      [{ id: previous[0].id, current: '名单：十二户' }, { id: previous[0].id, current: '名单：十一户' }],
      [{ id: previous[0].id, current: '名单：十二户', history: [] }],
      [{ id: previous[0].id, current: '名单：十二户', baseline: '名单：十二户' }],
      [{ current: '' }], [{ id: null, current: '名单：十二户' }],
    ]) expect(normalizeOutlineFactReview({ consistent: true, contradictions: [], ledger }, previous)).toBeNull();
    expect(previous[0].history).toEqual([]);
  });

  it('retains all facts when a later batch reports no state changes', () => {
    const previous = normalizeOutlineFactReview({ consistent: true, contradictions: [], ledger: [{ current: '名单：十三户' }] })!.ledger;
    const next = normalizeOutlineFactReview({ consistent: true, contradictions: [], ledger: [] }, previous)!;
    expect(next.ledger).toEqual(previous);
    expect(next.ledger).not.toBe(previous);
  });

  it('keeps quoted contradictions blocking even with complete inherited history', () => {
    const previous = normalizeOutlineFactReview({ consistent: true, contradictions: [], ledger: [{ current: '门后时间：倒退一小时' }] })!.ledger;
    const next = normalizeOutlineFactReview({ consistent: false, contradictions: [{
      location1: '前章台账', quote1: '倒退一小时', location2: '本章scenes', quote2: '快一小时', conflict: '同一次触发方向相反',
    }], ledger: [] }, previous)!;
    expect(next.consistent).toBe(false);
    expect(next.contradictions).toHaveLength(1);
    expect(next.ledger).toEqual(previous);
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
