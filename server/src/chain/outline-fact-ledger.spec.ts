import { describe, expect, it } from 'vitest';
import { chapterFactsForReview, buildOutlineFactReviewPrompt, outlineFactReviewNeedsContinuityPolicy, describeOutlineFactReview, normalizeOutlineFactReview, normalizeOutlineChaptersForFactReview } from './outline-fact-ledger';
import { buildOutlineContinuityContext, describeOutlineFactEvidence } from './outline-fact-ledger';
import { CHAPTER_RESPONSIBILITY_CRITERIA, chapterResponsibilityPlanningDirective } from '../../shared/src';
import { getSystemWorkflowRule, OUTLINE_STATE_CONTINUITY_POLICY, TEMPORAL_FACT_CONTINUITY_POLICY } from '../../shared/src/system-workflow-rules.registry';

describe('outline fact ledger review contract', () => {
  it.each(['第3章 characterStates.stateAfter', '第三章.scenes', 'chapterNumber=3.scenes'])('rejects a real quotation assigned to the wrong chapter: %s', location1 => {
    const chapters = [{ order: 2, content: '人物本章未出场' }, { order: 3, content: '当日请求被拒', scenes: JSON.stringify({ characterStates: [{ stateAfter: '上门请求被拒' }] }) }];
    const review = normalizeOutlineFactReview({ consistent: false, contradictions: [{ location1, quote1: '上门请求被拒',
      location2: '第4章.content', quote2: '当日请求被拒', conflict: '错置时间' }], ledger: [] });
    expect(describeOutlineFactEvidence(review, [chapters], chapters)[0]).toContain('不在声明的第3章');
    const corrected = normalizeOutlineFactReview({ consistent: false, contradictions: [{ location1: '第4章.scenes', quote1: '上门请求被拒',
      location2: '第4章.content', quote2: '当日请求被拒', conflict: '待核对' }], ledger: [] });
    expect(describeOutlineFactEvidence(corrected, [chapters], chapters)).toEqual([]);
  });
  it('keeps the full continuity policy exactly once when execution standard already injects it',()=>{
    expect(outlineFactReviewNeedsContinuityPolicy('无此规则')).toBe(true);
    expect(outlineFactReviewNeedsContinuityPolicy('审核标准：'+OUTLINE_STATE_CONTINUITY_POLICY+'后续')).toBe(false);
    const compact=buildOutlineFactReviewPrompt({canonicalBrief:'{}',world:{},previousLedger:[],
      chapters:[{order:4,content:'主角仍持有登记册'}],includePolicy:false});
    expect(compact).toContain('按已注入CTX-005、CTX-008核对累计状态与时间');
    expect(compact).toContain('主角仍持有登记册');
    expect(compact).not.toContain(OUTLINE_STATE_CONTINUITY_POLICY);
    const complete=buildOutlineFactReviewPrompt({canonicalBrief:'{}',world:{},previousLedger:[],
      chapters:[{order:4,content:'主角仍持有登记册'}],includePolicy:true});
    expect(complete).toContain(OUTLINE_STATE_CONTINUITY_POLICY);
  });
  it('uses the same temporal source policy in generation, review and the public rule', () => {
    expect(buildOutlineContinuityContext([], [])).toContain(TEMPORAL_FACT_CONTINUITY_POLICY);
    expect(buildOutlineFactReviewPrompt({ canonicalBrief: '{}', world: {}, previousLedger: [], chapters: [{ order: 0, content: '事件' }] })).toContain(TEMPORAL_FACT_CONTINUITY_POLICY);
    expect(getSystemWorkflowRule('CTX-008')!.details).toContain(TEMPORAL_FACT_CONTINUITY_POLICY);
    expect(chapterResponsibilityPlanningDirective()).toContain(TEMPORAL_FACT_CONTINUITY_POLICY);
  });
  it('shares CTX-008 for chapter-relative dates without duplicating it in a source-only prompt',()=>{
    const accepted=[{order:0,content:'传令当天我说木牌三天前就丢了，三日后要审。'},
      {order:1,content:'第二日立了抵当字据。'}];
    const original=JSON.stringify(accepted);
    expect(TEMPORAL_FACT_CONTINUITY_POLICY).toContain('跨章复述同一事件');
    expect(TEMPORAL_FACT_CONTINUITY_POLICY).toContain('事件发生时刻不变');
    const embedded=buildOutlineContinuityContext(accepted,[],true);
    const compact=buildOutlineContinuityContext(accepted,[],false);
    expect(embedded).toContain(TEMPORAL_FACT_CONTINUITY_POLICY);
    expect(compact).not.toContain(TEMPORAL_FACT_CONTINUITY_POLICY);
    expect(compact).toContain('按已注入CTX-005、CTX-008');
    expect(compact).toContain('传令当天我说木牌三天前就丢了');
    expect(embedded.split(TEMPORAL_FACT_CONTINUITY_POLICY)).toHaveLength(2);
    expect(JSON.stringify(accepted)).toBe(original);
    const review=buildOutlineFactReviewPrompt({canonicalBrief:'{}',world:{},previousLedger:[],
      sourceChapters:accepted,chapters:[{order:2,content:'三日后审判再次提到原事件'}],includePolicy:false});
    expect(review).toContain('传令当天我说木牌三天前就丢了');
    expect(review).not.toContain(TEMPORAL_FACT_CONTINUITY_POLICY);
  });
  it('separates group replies from private messages and checks direct positive evidence before blocking creation', () => {
    const prompt = buildOutlineFactReviewPrompt({
      canonicalBrief: '{}',
      world: {},
      previousLedger: [],
      chapters: [{ order: 2, content: '工作群报修消息底下没人回；助理私聊回复安全员。导演先签了安全条款。' }],
    });
    expect(prompt).toContain('必须通读同一批完整content、scenes、characterActions及相邻字段');
    expect(prompt).toContain('若content已明确写出某人签字、交付或当事人承认其指示，不得把该动作或承认判为缺失');
    expect(prompt).toContain('同一群消息“底下没人回”与“回复挂在该消息下”是真冲突');
    expect(prompt).toContain('私聊回复不能当作群消息回复');
    expect(prompt).toContain('本章新增三笔，累计应为四笔');
    expect(prompt).toContain('不得仅因看见“三笔”和“四笔”就误报');
    expect(prompt).toContain('人物直接听到的问话不代表另一角色向其复述过');
  });

  it('derives creation criteria from the actual Registry, including cumulative consequences', () => {
    expect(CHAPTER_RESPONSIBILITY_CRITERIA).toEqual(getSystemWorkflowRule('ARCH-005')!.clauses!.map(c => ({ id: c.id, label: c.label, check: c.text })));
    expect(chapterResponsibilityPlanningDirective()).toContain(OUTLINE_STATE_CONTINUITY_POLICY);
  });
  it('feeds the first trigger and inherited history into generation even when current summaries omit it', () => {
    const ledger = [{ id: 'fact_1', baseline: '第一次触发已损失记忆', history: ['第二次触发也有损失'], current: '当前尚未核定总数' }];
    const prompt = buildOutlineContinuityContext([{ order: 0, content: '每次截留都失去记忆' }], ledger);
    expect(prompt).toContain('"chapterNumber":1');
    expect(prompt).toContain('第一次触发已损失记忆');
    expect(prompt).toContain('第二次触发也有损失');
    expect(prompt).toContain('当前尚未核定总数');
    expect(prompt).toContain('不得猜出精确总数');
  });
  it('verifies both actual quotations and rejects fabricated paraphrases before Canon repair', () => {
    const review = normalizeOutlineFactReview({ consistent: false, contradictions: [{
      location1: '第一章.content', quote1: '每一记都产生缺口',
      location2: '第四章.characterStates', quote2: '只缺三段', conflict: '第一章缺口未计入',
    }], ledger: [] });
    const sources = [{ content: '第一场每一记都产生缺口。' }, { scenes: JSON.stringify({ characterStates: [{ stateBefore: '只缺三段' }] }) }];
    expect(describeOutlineFactEvidence(review, sources)).toEqual([]);
    expect(describeOutlineFactEvidence(review, sources.slice(0, 1))[0]).toContain('quote2');
  });
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


describe('lossless state prompt encoding and source-owned evidence',()=>{
 it('retains every baseline, history position and current state exactly without changing the input',async()=>{
  const {serializeOutlineFactLedger}=await import('./outline-fact-ledger');
  const text='首次使用已损失一段记忆，日期未明确。'.repeat(20);
  const ledger=[{id:'fact_1',baseline:text,history:[text,'第二次也有损失。',text],current:text}];
  const before=JSON.stringify(ledger),encoded=serializeOutlineFactLedger(ledger),parsed=JSON.parse(encoded);
  expect(encoded.length).toBeLessThan(before.length);
  expect(parsed.encoding).toBe('exact_state_refs');
  expect(parsed.entries.map((r:any)=>({id:r.id,baseline:parsed.states[r.baseline],history:r.history.map((id:string)=>parsed.states[id]),current:parsed.states[r.current]}))).toEqual(ledger);
  expect(JSON.stringify(ledger)).toBe(before);
  expect(serializeOutlineFactLedger([])).toBe('[]');
 });
 it('resolves only actual source identifiers and keeps a real contradiction and its calculation',async()=>{
  const {outlineFactEvidenceAnchors,resolveOutlineFactEvidence,describeOutlineFactEvidence}=await import('./outline-fact-ledger');
  const sources={canonicalBrief:'第一次用完扣一段记忆。',world:{rules:'每次触发都会损失。'},sourceChapters:[{order:0,content:'第一次之后已经少了一段记忆。'}],chapters:[{order:1,content:'第二次之后总共少一段记忆。'}]};
  const anchors=outlineFactEvidenceAnchors(sources),one=anchors.find(a=>a.text===sources.sourceChapters[0].content)!,two=anchors.find(a=>a.text===sources.chapters[0].content)!;
  const value={consistent:false,contradictions:[{anchor1:one.id,anchor2:two.id,conflict:'两次触发的累计损失与明示每次扣除不符',calculation:'1+1=2'}],ledger:[]};
  const resolved=resolveOutlineFactEvidence(value,anchors) as any;
  expect(resolved.contradictions[0]).toMatchObject({quote1:one.text,quote2:two.text,calculation:'1+1=2'});
  const review=normalizeOutlineFactReview(resolved)!;
  expect(review.consistent).toBe(false);expect(review.contradictions).toHaveLength(1);
  expect(describeOutlineFactEvidence(review,[sources.canonicalBrief,sources.world,sources.sourceChapters,sources.chapters],[...sources.sourceChapters,...sources.chapters])).toEqual([]);
  for(const defect of [{anchor2:'fact_1'},{quote2:'看似合理但未提供的摘要'},{location2:'第1章'}]){
   const bad=resolveOutlineFactEvidence({...value,contradictions:[{...value.contradictions[0],...defect}]},anchors);
   const normalized=normalizeOutlineFactReview(bad);
   expect(normalized===null || describeOutlineFactEvidence(normalized,[sources.canonicalBrief,sources.world,sources.sourceChapters,sources.chapters],[...sources.sourceChapters,...sources.chapters]).length>0).toBe(true);
  }
 });
});

it('reports an unknown generated fact id without falsely rejecting valid verdict fields',async()=>{
 const {describeOutlineFactUpdateProtocol}=await import('./outline-fact-ledger');
 const previous=[{id:'fact_1',baseline:'既定账户只在最近一笔改变去向',current:'既定账户只在最近一笔改变去向',history:[]}];
 const raw={consistent:true,contradictions:[],ledger:[{id:'fact_2',current:'新出现的调查结果'}]};
 const errors=describeOutlineFactUpdateProtocol(raw,previous);
 expect(errors).toHaveLength(1);expect(errors[0]).toContain('ledger[0].id=fact_2');
 expect(errors.join()).not.toContain('consistent必须');expect(normalizeOutlineFactReview(raw,previous)).toBeNull();
 expect(describeOutlineFactUpdateProtocol({...raw,ledger:[{current:'新出现的调查结果'}]},previous)).toEqual([]);
 expect(normalizeOutlineFactReview({...raw,ledger:[{current:'新出现的调查结果'}]},previous)?.ledger).toHaveLength(2);
});
it('keeps history protection and precise duplicate or field protocol errors',async()=>{
 const {describeOutlineFactUpdateProtocol}=await import('./outline-fact-ledger');
 const previous=[{id:'fact_1',baseline:'旧事实',current:'旧事实',history:[]}];
 const errors=describeOutlineFactUpdateProtocol({consistent:true,contradictions:[],ledger:[{id:'fact_1',current:'新状态',baseline:'擅自改历史'},{id:'fact_1',current:'又一状态'}]},previous);
 expect(errors.join()).toContain('baseline');expect(errors.join()).toContain('重复更新');expect(previous[0].baseline).toBe('旧事实');
});
it('shares quantity period, count and recipient rules across generation, audit and the public source',async()=>{
 const {OUTLINE_QUANTITY_SCOPE_POLICY}=await import('../../shared/src/system-workflow-rules.registry');
 expect(buildOutlineContinuityContext([],[])).toContain(OUTLINE_QUANTITY_SCOPE_POLICY);
 expect(buildOutlineFactReviewPrompt({canonicalBrief:'原事实',world:{},previousLedger:[],chapters:[]})).toContain(OUTLINE_QUANTITY_SCOPE_POLICY);
 expect(getSystemWorkflowRule('CTX-005')!.details!.join('\n')).toContain(OUTLINE_QUANTITY_SCOPE_POLICY);
});
