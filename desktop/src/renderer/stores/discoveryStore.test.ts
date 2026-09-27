import { beforeEach, describe, expect, it } from 'vitest';
import { useDiscoveryStore } from './discoveryStore';

describe('discovery execution settings', () => {
  beforeEach(() => useDiscoveryStore.getState().reset());

  it('keeps tone, writing style, and platform topic tags in separate dimensions', () => {
    const state = useDiscoveryStore.getState();
    state.setTargetPlatform('fanqie');
    state.setSelectedCategory('男频·都市日常');
    state.toggleTone('轻松');
    state.toggleWritingStyle('白描朴素');
    state.toggleGenre('都市');
    expect(useDiscoveryStore.getState()).toMatchObject({
      selectedTones: ['轻松'],
      selectedWritingStyles: ['白描朴素'],
      selectedGenres: ['都市'],
    });
  });

  it('clears platform submission tags after category or platform changes while retaining creative genre', () => {
    const state = useDiscoveryStore.getState();
    state.setTargetPlatform('fanqie');
    state.setSelectedCategory('男频·都市日常');
    state.toggleGenre('都市');
    state.toggleSubmissionTag('都市');
    state.setSelectedCategory('男频·都市脑洞');
    expect(useDiscoveryStore.getState().selectedGenres).toEqual(['都市']);
    expect(useDiscoveryStore.getState().selectedSubmissionTags).toEqual([]);
    useDiscoveryStore.getState().toggleSubmissionTag('系统');
    useDiscoveryStore.getState().setTargetPlatform('qidian');
    expect(useDiscoveryStore.getState()).toMatchObject({
      selectedGenres: ['都市'], selectedSubmissionTags: [], selectedCategory: '',
    });
  });

  it('切换长短篇立即清除旧题材及排除记录，保留作者选择的创作维度', () => {
    const state = useDiscoveryStore.getState();
    state.toggleTone('治愈');
    state.setStoryType('long_novel');
    state.setIdeas([{ title: '旧长篇', storyType: 'long_novel' } as any]);
    state.setGeneratedSignature('long-signature');
    state.setGenerationDone(true);
    state.addPrevTitles(['旧长篇']);
    state.setStoryType('short_story');
    expect(useDiscoveryStore.getState()).toMatchObject({
      storyType: 'short_story', selectedTones: ['治愈'], ideas: [],
      generatedSignature: null, generationDone: false, prevTitles: [],
    });
  });
});
