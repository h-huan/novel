import { describe, expect, it } from 'vitest';
import { StoryChainService } from './story-chain.service';

describe('StoryChainService stage-three configuration', () => {
  it('uses the authoritative post-synthesis review instead of generic score-only QA', () => {
    const service = new StoryChainService({} as any, {} as any);
    const chain = (service as any).buildStage3Chain();

    expect(chain.config.enableQualityGate).toBe(false);
    expect(chain.nodes.map((node: { id: string }) => node.id)).not.toContain('node_10_chapter_qa');
    expect(chain.nodes.map((node: { id: string }) => node.id)).toContain('node_9_chapter_synthesis');
  });
});
