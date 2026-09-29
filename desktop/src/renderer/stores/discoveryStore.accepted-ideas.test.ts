import { beforeEach, describe, expect, it } from 'vitest';
import { acceptedDiscoveryIdeas, useDiscoveryStore, type DiscoveryIdea } from './discoveryStore';

const accepted: DiscoveryIdea = {
  title: '通过题材',
  ideaAppealGate: { passed: true, distinctivenessScore: 8 },
};
const rejected: DiscoveryIdea = {
  title: '未通过题材',
  ideaAppealGate: { passed: false, distinctivenessScore: 3 },
};
const rawWithoutGate: DiscoveryIdea = { title: '原始候选' };

describe('灵感发现前端只展示通过后端 Gate 的题材', () => {
  beforeEach(() => useDiscoveryStore.getState().reset());

  it('过滤掉明确 rejected 和没有通过凭证的 raw 候选', () => {
    expect(acceptedDiscoveryIdeas([rejected, rawWithoutGate, accepted]).map((idea) => idea.title))
      .toEqual(['通过题材']);
  });

  it('写入 discovery store 时再次执行 accepted-only 防守', () => {
    useDiscoveryStore.getState().setIdeas([accepted, rejected, rawWithoutGate]);
    expect(useDiscoveryStore.getState().ideas.map((idea) => idea.title)).toEqual(['通过题材']);
  });
});
