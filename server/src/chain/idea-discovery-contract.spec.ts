import { describe, expect, it } from 'vitest';
import {
  SHORT_IDEA_HOOK_MIN_SIGNALS,
  ideaCardStructuringDirective,
  ideaHookRequirement,
  ideaPremiseSelectionDirective,
} from './idea-discovery-contract';

describe('idea discovery preselection contract', () => {
  it('screens a broad lightweight premise pool before any complete idea cards are created', () => {
    const contract = ideaPremiseSelectionDirective('short_story', 5);

    expect(contract).toContain('题材卡创建前筛选');
    expect(contract).toContain('至少 15 个真正不同的轻量题材胚子');
    expect(contract).toContain('这里只构思故事骨架，不写完整题材卡');
    expect(contract).toContain('人物处境、核心冲突、主角主动选择');
    expect(contract).toContain('生活/职业载体不可替换性');
    expect(contract).toContain('二阶后果');
    expect(contract).toContain('单层“行为→超常奖惩→调查”的寓言机制');
    expect(contract).toContain('恰好 5 个成熟题材');
    expect(contract).toContain('不按关键词数量打分');
    expect(contract).toContain('不把最终 Gate 当主要选题器');
    expect(contract).toContain('selectedPremiseIds');
    expect(contract).not.toContain('完整 hook/description/scopeBreakdown');
  });

  it('keeps long premise selection sustainable without importing short-story closure rules', () => {
    const contract = ideaPremiseSelectionDirective('long_novel', 4);

    expect(contract).toContain('至少 12 个真正不同的轻量题材胚子');
    expect(contract).toContain('可持续升级的核心矛盾');
    expect(contract).toContain('人物成长/关系变化');
    expect(contract).toContain('阶段性兑现空间');
    expect(contract).not.toContain('有限篇幅内形成单线闭环');
  });

  it('structures only the premises already selected before card creation', () => {
    const directive = ideaCardStructuringDirective([
      { premiseId: 'P2', workingTitle: '候选二', coreConflict: '冲突二' },
      { premiseId: 'P7', workingTitle: '候选七', coreConflict: '冲突七' },
    ]);

    expect(directive).toContain('完整题材卡结构化');
    expect(directive).toContain('不再重新选题');
    expect(directive).toContain('sourcePremiseId：["P2","P7"]');
    expect(directive).toContain('禁止替换、合并、拆分、另造题材');
    expect(directive).toContain('最终 Gate 只做独立验收');
    expect(directive).toContain('不是自动补生另一批题材');
  });

  it('treats hook generation as expression of a preselected story rather than another search stage', () => {
    const contract = ideaHookRequirement('short_story');

    expect(SHORT_IDEA_HOOK_MIN_SIGNALS).toBe(3);
    expect(contract).toContain('题材已经通过完整题材卡创建前的轻量候选池筛选');
    expect(contract).toContain('这里只把该题材最有吸引力的起始事件准确压缩成 hook');
    expect(contract).toContain('不再重新选题、换题');
    expect(contract).toContain('异常/信息差');
    expect(contract).toContain('代价或时限');
    expect(contract).toContain('具体行动/选择');
    expect(contract).toContain('关系锚点');
    expect(contract).toContain(`至少 ${SHORT_IDEA_HOOK_MIN_SIGNALS} 类有效信号`);
    expect(contract).toContain('必须包含主角具体行动或明确选择');
    expect(contract).toContain('不要求固定组合');
    expect(contract).not.toContain('内部广泛寻找');
    expect(contract).not.toContain('补足缺少');
  });

  it('keeps long-story hooks actionable without forcing short-story signal density', () => {
    const contract = ideaHookRequirement('long_novel');

    expect(contract).toContain('题材已经通过完整题材卡创建前的轻量候选池筛选');
    expect(contract).toContain('现实压力或代价');
    expect(contract).toContain('下一步具体行动');
    expect(contract).toContain('可持续追问');
    expect(contract).not.toContain(`至少 ${SHORT_IDEA_HOOK_MIN_SIGNALS} 类有效信号`);
  });
});
