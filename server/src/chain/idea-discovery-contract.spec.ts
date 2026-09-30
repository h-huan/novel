import { describe, expect, it } from 'vitest';
import {
  SHORT_IDEA_HOOK_MIN_SIGNALS,
  ideaCardStructuringDirective,
  ideaHookRequirement,
  ideaPremiseSelectionDirective,
  normalizePremiseSelectionPayload,
} from './idea-discovery-contract';

const selectedPremise = (premiseId: string) => ({
  premiseId,
  protagonistSituation: '主角想守住自己的工作和家人关系',
  openingEvent: '一份异常订单把主角卷入必须立刻处理的现实冲突',
  coreConflict: '主角的生活目标与另一方主动争夺资源的目标正面冲突',
  activeChoice: '主角决定冒着失去工作的风险主动查清订单来源',
  escalation: '调查让利益关系连续暴露并迫使主角付出越来越高的现实代价',
  reversalEffect: '关键事实改变了主角原先的目标和与盟友的关系',
  payoff: '终局由主角自己的选择兑现最初承诺并承担后果',
  irreplaceableCarrier: '这个职业掌握的流程和责任决定了冲突只能在此发生',
  secondOrderConsequence: '规则启动后第三方受益，迫使原本同盟的人重新站队',
  readerQuestion: '主角能否在失去工作前找到真正操纵订单的人',
  differentiation: '冲突由具体职业责任和不可替换关系共同推动，不靠换名套路',
});

describe('idea discovery preselection contract', () => {
  it('treats the broad pool size as a search target instead of an all-candidate hard gate', () => {
    const contract = ideaPremiseSelectionDirective('short_story', 5);

    expect(contract).toContain('以 15 个真正不同的轻量题材胚子作为广搜目标');
    expect(contract).toContain('不是整批成功的硬门槛');
    expect(contract).toContain('可以少于 15');
    expect(contract).toContain('禁止为了凑数填弱项');
    expect(contract).toContain('未被选中的轻量胚子不需要补齐完整筛选字段');
    expect(contract).toContain('selectedPremises');
    expect(contract).toContain('单层“行为→超常奖惩→调查”的寓言机制');
    expect(contract).toContain('不把最终 Gate 当主要选题器');
  });

  it('accepts five valid selected premises even when the lightweight pool misses the 15-item search target', () => {
    const pool = Array.from({ length: 5 }, (_, index) => ({
      premiseId: `P${index + 1}`,
      workingTitle: `候选${index + 1}`,
      storyCore: `这是第${index + 1}个彼此不同的轻量故事骨架，用于创建前比较。`,
    }));
    const result = normalizePremiseSelectionPayload({
      pool,
      selectedPremises: pool.map(item => ({ ...selectedPremise(item.premiseId) })),
    }, 5, 15);

    expect(result.pool).toHaveLength(5);
    expect(result.selected).toHaveLength(5);
    expect(result.poolTargetMet).toBe(false);
  });

  it('ignores malformed unselected extras instead of letting one weak pool item zero the whole batch', () => {
    const validPool = Array.from({ length: 5 }, (_, index) => ({
      premiseId: `P${index + 1}`,
      workingTitle: `候选${index + 1}`,
      storyCore: `这是第${index + 1}个可用于比较的轻量故事骨架，信息足够。`,
    }));
    const result = normalizePremiseSelectionPayload({
      pool: [
        ...validPool,
        { premiseId: 'BROKEN', workingTitle: '', storyCore: '' },
        { nonsense: true },
      ],
      selectedPremises: validPool.map(item => selectedPremise(item.premiseId)),
    }, 5, 15);

    expect(result.pool).toHaveLength(5);
    expect(result.selected.map(item => item.premiseId)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5']);
  });

  it('still blocks a selected premise that lacks the evidence needed before complete card creation', () => {
    const pool = Array.from({ length: 5 }, (_, index) => ({
      premiseId: `P${index + 1}`,
      workingTitle: `候选${index + 1}`,
      storyCore: `这是第${index + 1}个可用于比较的轻量故事骨架，信息足够。`,
    }));
    const selected = pool.map(item => selectedPremise(item.premiseId));
    selected[2] = { ...selected[2], activeChoice: '' };

    expect(() => normalizePremiseSelectionPayload({ pool, selectedPremises: selected }, 5, 15))
      .toThrow('activeChoice');
  });

  it('blocks duplicate selections and selections that do not come from the lightweight pool', () => {
    const pool = Array.from({ length: 5 }, (_, index) => ({
      premiseId: `P${index + 1}`,
      workingTitle: `候选${index + 1}`,
      storyCore: `这是第${index + 1}个可用于比较的轻量故事骨架，信息足够。`,
    }));
    const duplicate = [
      selectedPremise('P1'), selectedPremise('P1'), selectedPremise('P3'), selectedPremise('P4'), selectedPremise('P5'),
    ];
    expect(() => normalizePremiseSelectionPayload({ pool, selectedPremises: duplicate }, 5, 15))
      .toThrow('重复');

    const unknown = pool.map(item => selectedPremise(item.premiseId));
    unknown[4] = selectedPremise('PX');
    expect(() => normalizePremiseSelectionPayload({ pool, selectedPremises: unknown }, 5, 15))
      .toThrow('不存在的 premiseId');
  });

  it('keeps long premise selection sustainable without importing short-story closure rules', () => {
    const contract = ideaPremiseSelectionDirective('long_novel', 4);

    expect(contract).toContain('以 12 个真正不同的轻量题材胚子作为广搜目标');
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
