import { describe, expect, it } from 'vitest';
import { useDiscoveryStore } from '../stores/discoveryStore';
import { missingExecutionStandards } from '../lib/executionStandards';
import { discoveryRecoveryMatchesSelection, discoveryResponseMatchesSelection, discoverySignature, findProjectForIdea, standardsForIdea } from './DiscoveryWizardPage';
import type { Project } from '@novel/shared';

describe('从题材卡创建项目的执行设定', () => {
  it('仅在已选平台下将未预选创作维度与分类从题材卡继承', () => {
    const state = {
      ...useDiscoveryStore.getState(),
      storyType: 'long_novel' as const,
      targetPlatform: 'fanqie', selectedCategory: '', selectedSubCategory: '',
      selectedTones: [], selectedWritingStyles: [], selectedGenres: [],
      selectedSubmissionTags: [], selectedPlotTags: [], narrativePov: '',
    };
    const idea = {
      targetPlatform: 'fanqie', storyCategory: '男频·悬疑脑洞',
      storyTone: ['悬疑'], writingStyle: ['白描/朴素'],
      webNovelGenre: ['系统流'], submissionTags: ['灵异'],
      plotTags: ['探案'], pov: '第三人称限知',
    };
    const standards = standardsForIdea(state, idea);
    expect(standards).toMatchObject({
      targetPlatform: 'fanqie', category: '男频·悬疑脑洞',
      storyTone: ['悬疑'], writingStyle: ['白描/朴素'],
      webNovelGenre: ['系统流'], submissionTags: ['灵异'],
      plotTags: ['探案'], pov: '第三人称限知',
    });
    expect(missingExecutionStandards(standards)).toEqual([]);
  });

  it('未选平台不能从题材卡反向填入隐藏默认值', () => {
    const state = { ...useDiscoveryStore.getState(), targetPlatform: '' };
    const standards = standardsForIdea(state, { targetPlatform: 'fanqie', storyCategory: '男频·悬疑脑洞' });
    expect(standards.targetPlatform).toBe('');
    expect(missingExecutionStandards(standards)).toContain('平台');
  });
});

describe('题材卡与已创建项目', () => {
  it('刷新后只将完整确认题材匹配到原项目，避免重复创建', () => {
    const idea = { title: '代驾听你说完', hook: '车内证词', storyType: 'long_novel', targetPlatform: 'fanqie' };
    const project: Project = {
      id: 'existing', title: idea.title, type: 'long_novel', status: 'generation_failed',
      description: '', wordCount: 0, chapterCount: 0, targetPlatform: 'fanqie', targetWords: 500_000,
      creativeConstitution: {
        schemaVersion: 1, revision: 1, projectType: 'long_novel', targetPlatform: 'fanqie', targetWords: 500_000,
        category: '男频·悬疑脑洞', storyTone: ['悬疑'], writingStyle: [], webNovelGenre: ['现实向'],
        submissionTags: [], plotTags: [], genreFitNote: '', pov: 'third_person', targetAudience: null,
        chapterWordRange: { min: 1000, max: 6000 }, platformRules: {}, confirmedStory: idea,
      },
      currentWorkflowStage: 'world_setting', createdAt: new Date(), updatedAt: new Date(),
    };
    expect(findProjectForIdea([project], idea)?.id).toBe('existing');
    expect(findProjectForIdea([project], { ...idea, storyType: 'short_story' })).toBeUndefined();
    expect(findProjectForIdea([project], { ...idea, hook: '另一题材' })).toBeUndefined();
  });
});

describe('发现结果必须对应发起时的选择', () => {
  it('切为短篇后拒收仍在途的长篇响应，且拒收错类型题材', () => {
    // 本用例只验证“请求签名/长短篇类型”维度，因此显式把本轮数量设为 1；
    // 数量完整性由下一用例单独验证，避免用默认 5 张契约干扰这里的单一断言。
    const longState = { ...useDiscoveryStore.getState(), storyType: 'long_novel' as const, targetPlatform: 'fanqie', ideaCount: 1 };
    const shortState = { ...longState, storyType: 'short_story' as const };
    const requested = discoverySignature(longState);
    const longIdeas = [{ storyType: 'long_novel', targetPlatform: 'fanqie' }];
    expect(discoveryResponseMatchesSelection(requested, shortState, longIdeas)).toBe(false);
    expect(discoveryResponseMatchesSelection(discoverySignature(shortState), shortState, longIdeas)).toBe(false);
    expect(discoveryResponseMatchesSelection(discoverySignature(shortState), shortState,
      [{ storyType: 'short_story', targetPlatform: 'fanqie' }])).toBe(true);
  });

  it('拒收缺量、空批次与超额响应，只接受完整数量', () => {
    const state = { ...useDiscoveryStore.getState(), storyType: 'short_story' as const, targetPlatform: 'fanqie', ideaCount: 3 };
    const signature = discoverySignature(state);
    const one = { storyType: 'short_story', targetPlatform: 'fanqie' };
    expect(discoveryResponseMatchesSelection(signature, state, [one])).toBe(false);
    expect(discoveryResponseMatchesSelection(signature, state, [])).toBe(false);
    expect(discoveryResponseMatchesSelection(signature, state, [one, one, one, one])).toBe(false);
    expect(discoveryResponseMatchesSelection(signature, state, [one, one, one])).toBe(true);
  });

  it('已选文风变化时拒收旧响应', () => {
    const original = { ...useDiscoveryStore.getState(), storyType: 'short_story' as const, targetPlatform: 'fanqie', selectedWritingStyles: ['白描'] };
    const changed = { ...original, selectedWritingStyles: ['日记体'] };
    expect(discoveryResponseMatchesSelection(discoverySignature(original), changed,
      [{ storyType: 'short_story', targetPlatform: 'fanqie' }])).toBe(false);
  });
});

it('allows only explicitly marked qualified partial results without weakening the complete-batch contract',()=>{
 const state={...useDiscoveryStore.getState(),storyType:'short_story' as const,targetPlatform:'fanqie',ideaCount:3};
 const signature=discoverySignature(state),one={storyType:'short_story',targetPlatform:'fanqie'};
 expect(discoveryResponseMatchesSelection(signature,state,[one])).toBe(false);
 expect(discoveryResponseMatchesSelection(signature,state,[one],true)).toBe(true);
 expect(discoveryResponseMatchesSelection(signature,state,[],true)).toBe(false);
 expect(discoveryResponseMatchesSelection(signature,state,[one,one,one,one],true)).toBe(false);
 expect(discoveryResponseMatchesSelection(signature,state,[{...one,targetPlatform:'other'}],true)).toBe(false);
});

it('shows saved partial selection reasons without another discovery request',async()=>{
 const {discoveryShortfallReasons}=await import('./DiscoveryWizardPage');
 expect(discoveryShortfallReasons([{ideaDiscoveryAudit:{selectionAudit:{reasons:[{reason:'核心动机被改写'}]}}}])).toEqual(['核心动机被改写']);
 expect(discoveryShortfallReasons([{
   ideaDiscoveryAudit: {
     selectionAudit: {reasons:[{reason:'原池与所选因果不符'}]},
     structuringErrors:[{sourcePremiseId:'P3',error:'JSON结构化失败'}],
     reasons:['开篇行动没有后续兑现','原池与所选因果不符'],
     repairError:'模型没有返回有效的局部补丁',
   },
 }])).toEqual([
   '原池与所选因果不符',
   'P3 结构化失败：JSON结构化失败',
   '开篇行动没有后续兑现',
   '局部修复未完成：模型没有返回有效的局部补丁',
 ]);
 expect(discoveryShortfallReasons([])).toEqual([]);
 expect(discoveryShortfallReasons([{ideaDiscoveryAudit:{}}])).toEqual([]);
});


describe('历史合格灵感恢复必须严格绑定原始请求', () => {
  const state = {
    ...useDiscoveryStore.getState(),
    ideaCount: 2, storyType: 'short_story' as const, targetPlatform: 'fanqie',
    targetWords: '20000', targetAudience: '男频',
    selectedCategory: '男频', selectedSubCategory: '都市',
    customPlatformNote: '', genreFitNote: '贴合都市情节',
    selectedTones: ['紧张'], selectedWritingStyles: ['白描'],
    selectedGenres: ['悬疑'], selectedSubmissionTags: ['现实'],
    selectedPlotTags: ['调查'], narrativePov: '第一人称',
  };
  const request = {
    count: state.ideaCount, storyType: state.storyType, platform: state.targetPlatform,
    storyCategory: '男频/都市', customPlatformNote: state.customPlatformNote,
    genreFitNote: state.genreFitNote, targetWords: state.targetWords,
    targetAudience: state.targetAudience, storyTone: state.selectedTones,
    writingStyle: state.selectedWritingStyles, webNovelGenre: state.selectedGenres,
    submissionTags: state.selectedSubmissionTags, plotTags: state.selectedPlotTags,
    pov: state.narrativePov,
  };
  const cards = ['P1', 'P2'].map(sourcePremiseId => ({
    sourcePremiseId, title: '都市合同的谜团', storyType: 'short_story',
    targetPlatform: 'fanqie', ideaAppealGate: {passed: true},
  }));
  const batch = {request, qualifiedIdeas: cards};

  it('allows a saved full/partial qualified set only under its exact original settings', () => {
    expect(discoveryRecoveryMatchesSelection(batch, state)).toBe(true);
    expect(discoveryRecoveryMatchesSelection({...batch, qualifiedIdeas:[cards[0]]}, state)).toBe(true);
  });

  it.each([
    ['target words', {targetWords: '30000'}],
    ['audience', {targetAudience: '女频'}],
    ['category', {selectedSubCategory: '现实'}],
    ['custom platform standard', {customPlatformNote: '额外规则'}],
    ['genre explanation', {genreFitNote: '改过的契合理由'}],
    ['plot tags', {selectedPlotTags: ['逆袭']}],
    ['writing style', {selectedWritingStyles: ['诙谐']}],
    ['narrative POV', {narrativePov: '第三人称'}],
    ['card count', {ideaCount: 3}],
  ])('rejects past batches with changed %s', (_name, change) => {
    expect(discoveryRecoveryMatchesSelection(batch, {...state, ...change})).toBe(false);
  });

  it('refuses incomplete request snapshots, rejected, duplicated and wrong-platform cards', () => {
    expect(discoveryRecoveryMatchesSelection({...batch, request: {...request, targetAudience: undefined}}, state)).toBe(false);
    expect(discoveryRecoveryMatchesSelection({...batch, qualifiedIdeas: [cards[0], cards[0]]}, state)).toBe(false);
    expect(discoveryRecoveryMatchesSelection({...batch, qualifiedIdeas: [cards[0], {...cards[1], ideaAppealGate:{passed:false}}]}, state)).toBe(false);
    expect(discoveryRecoveryMatchesSelection({...batch, qualifiedIdeas: [cards[0], {...cards[1], targetPlatform:'other'}]}, state)).toBe(false);
    expect(discoveryRecoveryMatchesSelection({...batch, qualifiedIdeas: []}, state)).toBe(false);
  });
});
