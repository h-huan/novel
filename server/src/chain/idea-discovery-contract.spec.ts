import { describe, expect, it } from 'vitest';
import {
  SHORT_IDEA_HOOK_MIN_SIGNALS,
  ideaHookRequirement,
  ideaRecoveryDirective,
} from './idea-discovery-contract';

describe('idea discovery hook contract', () => {
  it('keeps the short-story prompt aligned with the gate signal minimum without turning signals into a creation checklist', () => {
    const contract = ideaHookRequirement('short_story');
    expect(SHORT_IDEA_HOOK_MIN_SIGNALS).toBe(3);
    expect(contract).toContain('先构思一个值得读的完整故事题材');
    expect(contract).toContain('Gate 字段只是验收证据，不是创作清单');
    expect(contract).toContain('现实利益冲突、关系反常、制度困境、隐藏事实或超常现象');
    expect(contract).toContain('异常/信息差');
    expect(contract).toContain('代价或时限');
    expect(contract).toContain('具体行动');
    expect(contract).toContain('关系锚点');
    expect(contract).toContain(`至少命中 ${SHORT_IDEA_HOOK_MIN_SIGNALS} 类`);
    expect(contract).toContain('不能把行动或代价只藏在 description');
  });

  it('keeps long-story hooks actionable and story-first without forcing short-story density', () => {
    const contract = ideaHookRequirement('long_novel');
    expect(contract).toContain('先构思一个值得读的完整故事题材');
    expect(contract).toContain('现实压力或代价');
    expect(contract).toContain('下一步具体行动');
    expect(contract).toContain('可持续追问');
    expect(contract).not.toContain(`至少命中 ${SHORT_IDEA_HOOK_MIN_SIGNALS} 类`);
  });

  it('turns gate failures into story-level recovery guidance instead of a keyword patch list', () => {
    const directive = ideaRecoveryDirective('short_story', [
      '核心钩子缺少明确代价、时限或失去风险',
      '核心钩子没有迫使主角采取具体行动',
      '核心钩子没有迫使主角采取具体行动',
      '开篇钩子与核心卖点/冲突脱节，阅读承诺不能尽早兑现',
    ], 3);
    expect(directive).toContain('失败原因只用于指出“故事哪里不成立”');
    expect(directive).toContain('不是让你逐项补关键词');
    expect(directive).toContain('人物处境→核心冲突→主动选择→后果升级→有效反转/兑现');
    expect(directive).toContain('若问题只是 hook');
    expect(directive).toContain('才重写 hook 本字段');
    expect(directive).toContain('反转、二阶后果、不可替换性或生活期盼本身不成立，必须重想故事因果');
    expect(directive).toContain('uniquePoint/coreConflict');
    expect(directive).toContain('description 前 260 字');
    expect(directive).toContain(`短篇 hook 仍必须满足“四类信号至少 ${SHORT_IDEA_HOOK_MIN_SIGNALS} 类”`);
    expect(directive).toContain('这是表达验收');
    expect(directive).toContain('不是四项创作配方');
    expect(directive).toContain('不复写已通过项');
    expect(directive.match(/核心钩子没有迫使主角采取具体行动/g)).toHaveLength(1);
  });

  it('keeps long-story recovery actionable without importing the short-story signal quota', () => {
    const directive = ideaRecoveryDirective('long_novel', [
      '核心钩子缺少明确代价、时限或失去风险',
      '核心钩子没有迫使主角采取具体行动',
    ], 2);

    expect(directive).toContain('本轮只补足缺少的 2 项');
    expect(directive).toContain('若问题只是 hook');
    expect(directive).toContain('重想故事因果');
    expect(directive).not.toContain('四类信号至少');
  });

  it('covers the exact all-rejected short-story failure set with one recoverable story-first contract', () => {
    const reasons = [
      '核心钩子缺少一眼可识别的异常/信息差',
      '核心钩子缺少明确代价、时限或失去风险',
      '核心钩子没有迫使主角采取具体行动',
      '短篇首屏钩子信息过弱：异常/压力/行动/关系至少应形成 3 个有效信号',
      '开篇钩子与核心卖点/冲突脱节，阅读承诺不能尽早兑现',
    ];
    const directive = ideaRecoveryDirective('short_story', reasons, 5);

    for (const reason of reasons) expect(directive).toContain(reason);
    expect(directive).toContain('故事哪里不成立');
    expect(directive).toContain('禁止为了过 Gate 把普通故事强行改成超常机制');
    expect(directive).toContain('hook 或 description 前 260 字');
    expect(directive).toContain(`四类信号至少 ${SHORT_IDEA_HOOK_MIN_SIGNALS} 类`);
    expect(directive).toContain('本轮只补足缺少的 5 项');
  });
});
