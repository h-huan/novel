import { describe, expect, it } from 'vitest';
import { StoryChainService } from './story-chain.service';

describe('StoryChainService 当前公开 API', () => {
  it('仅保留长篇大纲链，已彻底移除短篇 stage-3（天龙8步）链', () => {
    const service = new StoryChainService({} as any);

    // 短篇正文已改为单次 body-by-outline 生成，不再有 stage-3 chain 构建方法。
    expect((service as any).buildStage3Chain).toBeUndefined();
    expect((service as any).executeStage3).toBeUndefined();

    // 现存的长篇大纲入口。
    expect(typeof service.executeLongOutline).toBe('function');
  });
});
