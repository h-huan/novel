import { describe, expect, it, vi } from 'vitest';
import { ChainEngineService } from './chain-engine.service';
import { ChainTemplateService } from './chain-template.service';
import { PromptRegistryService } from './prompt-registry.service';

const input = { projectId: 'sequence-test', story_setting: '番茄悬疑，主角追查旧站', targetWords: 100, genre: '悬疑' };
const skeleton = {
  coreSetting: { title: '旧站之谜', coreConflict: '寻找失踪证据' },
  skeletonVolumes: [{ volumeNumber: 1, title: '旧站卷', estimatedChapters: 250, chapterCountReason: '完整调查事件链需要250章' }],
};

describe('long novel foundation dependency', () => {
  it('passes the accepted skeleton into a separate world generation request', async () => {
    const generate = vi.fn()
      .mockResolvedValueOnce({ content: JSON.stringify(skeleton) })
      .mockResolvedValueOnce({ content: JSON.stringify({ worldview: { geography: [], factions: [] } }) });
    const chain = new ChainTemplateService(new ChainEngineService(new PromptRegistryService(), { generate } as any));
    const result = await chain.executeChain('long-novel-init-foundation', input);
    expect(result.status).toBe('completed');
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[0][0].scenario).toBe('outline');
    expect(generate.mock.calls[1][0].scenario).toBe('world_building');
    expect(generate.mock.calls[1][0].prompt).toContain('旧站之谜');
    expect(result.outputs.node_1_skeleton.coreSetting.title).toBe('旧站之谜');
  });

  it('can rerun only the existing skeleton node when recovery must reuse a frozen world', async () => {
    const generate = vi.fn().mockResolvedValueOnce({ content: JSON.stringify(skeleton) });
    const chain = new ChainTemplateService(new ChainEngineService(new PromptRegistryService(), { generate } as any));
    const result = await chain.executeLongNovelFoundationSkeleton(input);
    expect(result.status).toBe('completed');
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0].scenario).toBe('outline');
    expect(result.outputs.node_1_skeleton.coreSetting.title).toBe('旧站之谜');
    expect(result.outputs.node_2_worldview).toBeUndefined();
  });

  it('never starts world generation when skeleton generation fails', async () => {
    const generate = vi.fn().mockRejectedValue(new Error('UND_ERR_SOCKET'));
    const chain = new ChainTemplateService(new ChainEngineService(new PromptRegistryService(), { generate } as any));
    const result = await chain.executeChain('long-novel-init-foundation', input);
    expect(result.status).toBe('failed');
    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.outputs.node_2_worldview).toBeUndefined();
  });
});
