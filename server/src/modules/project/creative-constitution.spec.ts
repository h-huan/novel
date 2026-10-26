import { describe, it, expect } from 'vitest';
import { readConstitution, updateConstitution, constitutionColumns, constitutionSettings, normalizeStoredConstitutions, buildExecutionStandard, genreFitProblem, isPlatformStandardPresent, missingConstitutionStandards } from './creative-constitution';
import { getPlatform, buildBenchmarkDirective } from '../../chain/platform-benchmarks';

describe('creative constitution boundary', () => {
  it('supplies the actual platform benchmark to the same criterion used by generation and review', () => {
    const c = updateConstitution({}, { targetPlatform: 'fanqie', type: 'short_story' });
    const platform = buildExecutionStandard(c).dimensions.find(d => d.dimension === 'platform')!;
    expect(platform.requirement).toContain(buildBenchmarkDirective('fanqie', 'short_story'));
    expect(platform.requirement).toContain('分类级可读性口径未核验');
  });
  it('内置幕后流可核对但不能只凭隐藏凶手判为符合，自定义流派保留未知状态', () => {
    const c = readConstitution({ target_platform: 'fanqie', settings: { webNovelGenre: ['幕后流'] } });
    const genre = buildExecutionStandard(c).dimensions.find(d => d.dimension === 'genre')!;
    expect(genre.definitionStatus).toBe('provided');
    expect(genre.requirement).toContain('仅有隐藏凶手或未知阴谋不等于幕后流');
    expect(genre.requirement).toContain('不要求首章解释完整计划');
    const unknown = buildExecutionStandard({ ...c, webNovelGenre: ['作者自建流派'], genreFitNote: '' }).dimensions.find(d => d.dimension === 'genre')!;
    expect(unknown.definitionStatus).toBe('unknown_definition');
    expect(buildExecutionStandard({ ...c, webNovelGenre: ['作者自建流派'], genreFitNote: '代理交易引发身份冲突' }).dimensions.find(d => d.dimension === 'genre')!.definitionStatus).toBe('provided');
  });
  it('preserves plot tags without blocking tags absent from a non-exhaustive public sample', () => {
    const base = updateConstitution({}, {
      targetPlatform: 'fanqie', type: 'long_novel', category: '男频·都市日常',
      storyTone: ['热血'], writingStyle: ['白描/朴素'], webNovelGenre: ['都市现实'], submissionTags: ['系统流'],
      pov: '第三人称限知', plotTags: ['逆袭'],
    });
    expect(genreFitProblem(base)).toBeNull();
    const fitted = updateConstitution({ settings: JSON.stringify({ creativeConstitution: base }) }, {
      genreFitNote: '系统机制通过都市职业晋升兑现人物逆袭，而非借用异界设定',
    });
    expect(genreFitProblem(fitted)).toBeNull();
    const loaded = readConstitution(constitutionColumns({}, fitted));
    expect(loaded.plotTags).toEqual(['逆袭']);
    expect(loaded.genreFitNote).toBe(fitted.genreFitNote);
    expect(buildExecutionStandard(loaded).directive).toContain('情节取向「逆袭」');
    expect(buildExecutionStandard(loaded).directive).toContain(fitted.genreFitNote);
  });
  it('applies existing plot tags as event-level operations without scheduling random payoffs', () => {
    const c=updateConstitution({}, {
      targetPlatform:'fanqie',type:'short_story', category:'男频脑洞',
      storyTone:['紧张'], writingStyle:['口语化'], webNovelGenre:['扮猪吃虎'],
      plotTags:['悬念反转','打脸回报','人物牺牲','梗'], pov:'第一人称',
    });
    const rule=buildExecutionStandard(c).dimensions.find(d=>d.dimension==='genre')!.requirement;
    expect(rule).toContain('情节取向「悬念反转、打脸回报、人物牺牲、梗」');
    expect(rule).toContain('前置线索');
    expect(rule).toContain('既有误判');
    expect(rule).toContain('人物先拥有可见的目标');
    expect(rule).toContain('再次出现须带来新作用或反差');
    expect(rule).toContain('不为凑热血、搞笑、反转、梗或刀点增加未获授权的事件');
    expect(rule).toContain('扮猪吃虎');
  });
  it('inherits a known tone meaning for a plot tag and avoids a second copy if tone already selected', () => {
    const c=updateConstitution({}, {
      storyTone:['热血'], plotTags:['热血','搞笑','刀人','自定义原样标签'],
    });
    const standard=buildExecutionStandard(c);
    const plot=standard.dimensions.find(d=>d.dimension==='genre')!.requirement;
    const tone=standard.dimensions.find(d=>d.dimension==='tone')!.requirement;
    expect(tone).toContain('靠「立目标—受挫—突破」推进');
    expect(plot).toContain('情节取向「热血、搞笑、刀人、自定义原样标签」');
    expect(plot).toContain('笑点来自情境反差');
    expect(plot).toContain('已投入的关系');
    expect(plot).not.toContain('热血：靠「立目标—受挫—突破」');
    expect(plot).not.toContain('自定义原样标签：');
  });
  it('builds the constitution only from canonical project fields', () => {
    const c = updateConstitution({ settings: '{}' }, { title: 'test', type: 'short_story', targetPlatform: 'zhihu' });
    expect(c).toMatchObject({ projectType: 'short_story', targetPlatform: 'zhihu' });
    expect(c.chapterWordRange).toEqual({ min: 3000, max: 5000 });
  });
  it('uses a saved constitution even when old mirrors disagree', () => {
    const c = updateConstitution({}, { targetPlatform: 'fanqie', storyTone: ['热血'], pov: '第一人称' });
    const row = constitutionColumns({}, c);
    expect(readConstitution({ ...row, target_platform: 'zhihu', type: 'short_story' })).toEqual(c);
  });
  it('normalizes a legacy saved chapter range when it is read', () => {
    const c = updateConstitution({}, { targetPlatform: 'fanqie' });
    const legacy = { ...c, chapterWordRange: { min: 1500, max: 8000 }, platformRules: { ...c.platformRules, chapterWords: [1500, 8000] } };
    expect(readConstitution({ settings: JSON.stringify({ creativeConstitution: legacy }) })).toMatchObject({
      chapterWordRange: { min: 3000, max: 5000 },
      platformRules: { chapterWords: [3000, 5000] },
    });
  });
  it('lets the legacy platform_style column only fill an empty platform, never override it', () => {
    // platform_style 是 platform 维的历史别名（与 story_category / story_tone / point_of_view 同类），
    // 也是 hardline 扫描与质检评分读平台时唯一允许之外的最后一个兜底。三条边界必须同时成立：
    // 它不能覆盖宪法、不能覆盖 target_platform、只能在两者都为空时补空 —— 否则同一维度就又有两个判据，
    // 会出现「宪法说番茄、列说 fantasy」而按哪一份跑都说不清。
    expect(readConstitution({ settings: '{}', type: 'short_story', platform_style: 'fantasy' }).targetPlatform)
      .toBe('generic');

    const c = updateConstitution({}, { targetPlatform: 'fanqie' });
    expect(readConstitution({ ...constitutionColumns({}, c), platform_style: 'fantasy' }).targetPlatform)
      .toBe('fanqie');

    const blanked = { ...c, targetPlatform: '' };
    expect(readConstitution({
      settings: JSON.stringify({ creativeConstitution: blanked }),
      type: 'short_story', target_platform: '', platform_style: 'fanqie',
    }).targetPlatform).toBe('fanqie');
  });
  it('rejects duplicate settings sources and invalid configuration', () => {
    expect(() => updateConstitution({}, { targetPlatform: 'fanqie', settings: { targetPlatform: 'zhihu' } })).toThrow('必须使用创作宪法字段');
    expect(() => readConstitution({ settings: 'broken' })).toThrow('JSON');
    expect(() => readConstitution({ settings: { creativeConstitution: { schemaVersion: 1, revision: 1 } } })).toThrow('创作宪法');
    expect(() => updateConstitution({}, { chapterWordRange: { min: 4000, max: 1000 } })).toThrow();
  });
  it('increments revision only when creative fields change and permits clearing tags', () => {
    const c = updateConstitution({}, { storyTone: ['热血'], writingStyle: ['白描'] });
    const row = constitutionColumns({}, c);
    expect(updateConstitution(row, { title: 'rename' }).revision).toBe(c.revision);
    expect(updateConstitution(row, { storyTone: [] })).toMatchObject({ storyTone: [], revision: c.revision + 1 });
  });
  it('never promotes an idea recommendation into the selected platform', () => {
    expect(readConstitution({ settings: JSON.stringify({ recommendedPlatform: 'zhihu' }) }).targetPlatform).toBe('generic');
  });
  it('treats a custom platform as unset until the user writes its standard', () => {
    const withoutNote = updateConstitution({}, { targetPlatform: 'custom' });
    expect(isPlatformStandardPresent(withoutNote)).toBe(false);
    expect(missingConstitutionStandards(withoutNote).map(m => m.dimension)).toContain('platform');

    const withNote = updateConstitution({}, { targetPlatform: 'custom', customPlatformNote: '自建站：每章 800 字以内，强钩子，单主角' });
    expect(isPlatformStandardPresent(withNote)).toBe(true);
    expect(missingConstitutionStandards(withNote).map(m => m.dimension)).not.toContain('platform');
  });
  it('requires all six creative dimensions while keeping Fanqie work tag naming', () => {
    const missingTags = updateConstitution({}, {
      targetPlatform: 'fanqie', projectType: 'long_novel', category: '男频·都市日常',
      storyTone: [], writingStyle: [], webNovelGenre: [], pov: '',
    });
    expect(missingConstitutionStandards(missingTags).map(item => item.field)).toEqual(['storyTone', 'writingStyle', 'webNovelGenre', 'pov', 'submissionTags']);
    const tagged = updateConstitution({}, { ...missingTags, webNovelGenre: ['都市日常'], submissionTags: ['都市'] });
    expect(missingConstitutionStandards(tagged).map(item => item.dimension)).toEqual(['tone', 'style', 'pov']);
    const standard = buildExecutionStandard(tagged);
    expect(standard.dimensions.map(item => item.dimension)).toContain('genre');
    expect(standard.missing.map(item => item.dimension)).toContain('pov');
  });
  it('uses the user note as the custom platform standard instead of the built-in label', () => {
    const note = '自建站：每章 800 字以内，强钩子，单主角';
    const c = updateConstitution({}, { targetPlatform: 'custom', customPlatformNote: note });
    const standard = buildExecutionStandard(c);
    const platform = standard.dimensions.find(d => d.dimension === 'platform');
    // 用户说明是平台维度的唯一事实源；系统不掌握该平台基准，不得用内置 label 冒充成它的标准。
    expect(platform?.value).toBe(note);
    expect(platform?.value).not.toBe(getPlatform('custom').label);
    expect(platform?.requirement).toContain('唯一事实源');
    expect(platform?.requirement).toContain(note);
  });
});

describe('persisted discovery audit isolation', () => {
  it.each(['short_story', 'long_novel'])('reads the same selected story authority for %s creation and prose', type => {
    const c = updateConstitution({}, { type, targetPlatform: 'fanqie', category: '悬疑', pov: '第一人称' });
    const story = { title: '当前作品', hook: '唯一故事钩子', readerExperienceProfile: { pace: '紧凑' },
      ideaDiscoveryAudit: { candidateAssessments: [{ candidate: { title: '另一作品' } }] } };
    c.confirmedStory = story;
    const settings = JSON.stringify({ creativeConstitution: c });
    const read = readConstitution({ settings });
    expect(read.confirmedStory).toEqual({
      title: '当前作品', hook: '唯一故事钩子', readerExperienceProfile: { pace: '紧凑' },
    });
    expect(JSON.stringify(read)).not.toContain('另一作品');
    expect(JSON.parse(settings).creativeConstitution.confirmedStory).toEqual(story);
  });
});

describe('constitution persistence across restart and edits', () => {
  it.each(['short_story', 'long_novel'])('preserves %s confirmedStory when normalizing stored rows', type => {
    const audit = { preselectedPremises: [{ title: '其它候选' }] };
    const c = updateConstitution({}, { type, targetPlatform: 'fanqie', category: '悬疑', pov: '第一人称' });
    c.confirmedStory = { title: '当前故事', hook: '核心钩子', ideaDiscoveryAudit: audit };
    c.qualityPolicy = { acceptanceThreshold: 90 } as any;
    let row: any = { id: 'p1', type, settings: JSON.stringify({ creativeConstitution: c }) };
    const db: any = { prepare: (sql: string) => sql.startsWith('SELECT')
      ? { all: () => [row] }
      : { run: (_type: string, _platform: string, _legacyPlatform: string, _words: number, _style: string, settings: string) => {
        row = { ...row, settings };
      } } };
    normalizeStoredConstitutions(db);
    const persisted = JSON.parse(row.settings).creativeConstitution;
    expect(persisted.confirmedStory).toEqual(c.confirmedStory);
    expect(persisted.qualityPolicy).toEqual(c.qualityPolicy);
    expect(readConstitution(row).confirmedStory).toEqual({ title: '当前故事', hook: '核心钩子' });
    const firstSettings = row.settings;
    normalizeStoredConstitutions(db);
    expect(row.settings).toBe(firstSettings);
  });

  it('retains the full audit outside Canon when settings are edited', () => {
    const c = updateConstitution({}, { type: 'short_story', targetPlatform: 'fanqie', category: '悬疑', pov: '第一人称' });
    const audit = { candidateAssessments: [{ candidate: { title: '另一个故事' } }] };
    c.confirmedStory = { title: '当前故事', ideaDiscoveryAudit: audit };
    const stored = { creativeConstitution: c };
    const context = readConstitution({ settings: stored });
    const edited = constitutionSettings(stored, { ...context, revision: context.revision + 1 });
    expect(edited.ideaDiscoveryAudit).toEqual(audit);
    expect(edited.creativeConstitution.confirmedStory).toEqual({ title: '当前故事' });
    expect(readConstitution({ settings: edited }).confirmedStory).toEqual({ title: '当前故事' });
    expect(constitutionSettings(edited, readConstitution({ settings: edited })).ideaDiscoveryAudit).toEqual(audit);
  });
});

 it('keeps platform classification unknown while evaluating an explicitly confirmed story scope',()=>{
    const c=readConstitution({type:'short_story',target_platform:'fanqie',settings:{category:'男频脑洞'}});
    const absent=buildExecutionStandard(c).dimensions.find(d=>d.dimension==='category')!;
    expect(absent.requirement).not.toContain('本维可执行判据为作者已确认');
    c.confirmedStory={title:'测试',setting:'远洋船上，矛盾只来自船员交换身份，没有时间回溯。'};
    const present=buildExecutionStandard(c).dimensions.find(d=>d.dimension==='category')!;
    expect(present.requirement).toContain('远洋船上');
    expect(present.requirement).toContain('官方定义未核验');
    expect(present.requirement).toContain('评分不代表平台官方分类');
    c.confirmedStory={title:'测试'};
    expect(buildExecutionStandard(c).dimensions.find(d=>d.dimension==='category')!.requirement).not.toContain('本维可执行判据为作者已确认');
  });
