import { describe, expect, it } from 'vitest';
import {
  SHORT_IDEA_HOOK_MIN_SIGNALS,
  ideaHookRequirement,
  ideaRecoveryDirective,
} from './idea-discovery-contract';

describe('idea discovery hook contract', () => {
  it('keeps the short-story prompt aligned with the gate signal minimum', () => {
    const contract = ideaHookRequirement('short_story');
    expect(SHORT_IDEA_HOOK_MIN_SIGNALS).toBe(3);
    expect(contract).toContain('异常/信息差');
    expect(contract).toContain('代价或时限');
    expect(contract).toContain('具体行动');
    expect(contract).toContain('关系锚点');
    expect(contract).toContain(`至少命中 ${SHORT_IDEA_HOOK_MIN_SIGNALS} 类`);
    expect(contract).toContain('不能把行动或代价只藏在 description');
  });

  it('keeps long-story hooks actionable without forcing short-story density', () => {
    const contract = ideaHookRequirement('long_novel');
    expect(contract).toContain('现实压力或代价');
    expect(contract).toContain('下一步具体行动');
    expect(contract).toContain('可持续追问');
  });

  it('turns gate failures into field-specific recovery instructions instead of repeating the same generic prompt', () => {
    const directive = ideaRecoveryDirective('short_story', [
      '核心钩子缺少明确代价、时限或失去风险',
      '核心钩子没有迫使主角采取具体行动',
      '开篇钩子与核心卖点/冲突脱节，阅读承诺不能尽早兑现',
    ], 3);
    expect(directive).toContain('直接重写 hook 本字段');
    expect(directive).toContain('uniquePoint/coreConflict');
    expect(directive).toContain('description 前 260 字');
    expect(directive).toContain(`短篇 hook 仍必须满足“四类信号至少 ${SHORT_IDEA_HOOK_MIN_SIGNALS} 类”`);
    expect(directive).toContain('不复写已通过项');
  });
});
