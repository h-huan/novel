import { describe, expect, it, vi } from 'vitest';
import { ChainEngineService } from './chain-engine.service';
import { ChainTemplateService } from './chain-template.service';
import { PromptRegistryService } from './prompt-registry.service';
import { describeChapterResponsibilityPlan } from '../../shared/src/chapter-responsibility-review';

const input = { projectId: 'sequence-test', story_setting: '番茄悬疑，主角追查旧站', targetWords: 100, genre: '悬疑' };
const skeleton = {
  coreSetting: { title: '旧站之谜', coreConflict: '寻找失踪证据' },
  skeletonVolumes: [{ volumeNumber: 1, title: '旧站卷', estimatedChapters: 250, chapterCountReason: '完整调查事件链需要250章' }],
};

describe('long novel foundation dependency', () => {
  it('retains quoted plan text when only JSON escaping is missing, and stops genuinely malformed upstream structure', async () => {
    const generate = vi.fn().mockResolvedValueOnce({ content: '{"coreSetting":{"title":"目标从"救一个人"变成"留证""}}' })
      .mockResolvedValueOnce({ content: '{"worldview":{}}' });
    const chain = new ChainTemplateService(new ChainEngineService(new PromptRegistryService(), { generate } as any));
    const result = await chain.executeChain('long-novel-init-foundation', input);
    expect(result.status).toBe('completed');
    expect(result.outputs.node_1_skeleton.coreSetting.title).toBe('目标从"救一个人"变成"留证"');
    const badGenerate = vi.fn().mockResolvedValue({ content: '{"coreSetting":{"title":"未完成' });
    const badChain = new ChainTemplateService(new ChainEngineService(new PromptRegistryService(), { generate: badGenerate } as any));
    expect((await badChain.executeChain('long-novel-init-foundation', input)).status).toBe('failed');
    expect(badGenerate).toHaveBeenCalledTimes(1);
  });
  it('passes the existing time window and relative timeline contract into registered chapter planning', async () => {
    const chapterResponsibilities = [{ chapter: 1, title: '旧站', function: '追查', responsibility: '取得进站线索', prerequisites: ['持有送货凭证'], timeline: '当夜，倒计时尚未结束', exitState: '取得旧站钥匙' }];
    const generate = vi.fn()
      .mockResolvedValueOnce({ content: JSON.stringify({ chapterResponsibilities }) })
      .mockResolvedValueOnce({ content: JSON.stringify({ volumes: [{ volumeNumber: 1, chapters: [] }] }) })
      .mockResolvedValueOnce({ content: JSON.stringify({ volumes: [{ volumeNumber: 1, chapters: [] }] }) });
    const chain = new ChainTemplateService(new ChainEngineService(new PromptRegistryService(), { generate } as any));
    await chain.executeChain('long-novel-flexible-outline', { ...input, story_setting: '核心事件必须在一夜内结束，之后才是多年后的收束。', chapterLimit: 5, wordRangeText: '3000–5000字', platform_directive: '按项目执行标准规划' });
    const prompt = generate.mock.calls[2][0].prompt;
    expect(prompt).toContain('核心事件必须在一夜内结束');
    expect(prompt).toContain('"timeline"');
    expect(prompt).toContain('不能把收束阶段的跨度放进尚未结束的倒计时');
    expect(prompt).toContain('不补造秒数');
    for (const call of generate.mock.calls.slice(1)) {
      expect(call[0].prompt).toContain('持有送货凭证');
      expect(call[0].prompt).toContain('取得旧站钥匙');
      expect(call[0].prompt).toContain('当夜，倒计时尚未结束');
      expect(call[0].planningSources?.analysis).toEqual({ chapterResponsibilities });
    }
    expect(generate.mock.calls[0][0].planningSources).toBeUndefined();
    expect(generate.mock.calls[0][0].planningResponsibilityPreflight).toBe(true);
    expect(generate.mock.calls[2][0].planningSources?.volumes).toEqual({ volumes: [{ volumeNumber: 1, chapters: [] }] });
  });
  it('stops before downstream planning when the entry plan is absent', async () => {
    const generate = vi.fn().mockResolvedValue({ content: JSON.stringify({ volumes: [] }) });
    const chain = new ChainTemplateService(new ChainEngineService(new PromptRegistryService(), { generate } as any));
    const result = await chain.executeChain('long-novel-flexible-outline', { ...input, chapterLimit: 5 });
    expect(result.status).toBe('failed');
    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.outputs.node_2_volumes).toBeUndefined();
  });
  it('validates a bounded upcoming window without demanding a full long-novel schedule', () => {
    const plan = { chapterResponsibilities: [{ chapter: 1, title: '旧站', function: '调查', responsibility: '获得线索', prerequisites: [], timeline: '未知具体钟点，同一夜', exitState: '取得钥匙' }] };
    expect(describeChapterResponsibilityPlan(plan, 5)).toEqual([]);
    expect(describeChapterResponsibilityPlan(plan, 0)).toEqual([]);
    expect(describeChapterResponsibilityPlan({ chapterResponsibilities: [{ ...plan.chapterResponsibilities[0], chapter: 2, exitState: '' }] }, 5).length).toBeGreaterThan(0);
  });
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
