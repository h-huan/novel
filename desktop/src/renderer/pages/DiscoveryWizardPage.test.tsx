import { describe, expect, it } from 'vitest';
import { useDiscoveryStore } from '../stores/discoveryStore';
import { missingExecutionStandards } from '../lib/executionStandards';
import { discoveryResponseMatchesSelection, discoverySignature, findProjectForIdea, standardsForIdea } from './DiscoveryWizardPage';
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

  it('返回数量必须与本轮 ideaCount 完全一致', () => {
    const state = { ...useDiscoveryStore.getState(), storyType: 'short_story' as const, targetPlatform: 'fanqie', ideaCount: 3 };
    const signature = discoverySignature(state);
    const one = { storyType: 'short_story', targetPlatform: 'fanqie' };
    expect(discoveryResponseMatchesSelection(signature, state, [one])).toBe(false);
    expect(discoveryResponseMatchesSelection(signature, state, [one, one, one])).toBe(true);
  });

  it('已选文风变化时拒收旧响应', () => {
    const original = { ...useDiscoveryStore.getState(), storyType: 'short_story' as const, targetPlatform: 'fanqie', selectedWritingStyles: ['白描'] };
    const changed = { ...original, selectedWritingStyles: ['日记体'] };
    expect(discoveryResponseMatchesSelection(discoverySignature(original), changed,
      [{ storyType: 'short_story', targetPlatform: 'fanqie' }])).toBe(false);
  });
});
