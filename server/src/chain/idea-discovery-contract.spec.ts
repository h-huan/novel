import { describe, expect, it } from 'vitest';
import {
  applyOrderedIdeaRepairPatches,
  bindStructuredIdeaCardToPremise,
  ideaCardStructuringDirective,
  ideaGateLocalRepairDirective,
  ideaHookRequirement,
  ideaPremiseSelectionDirective,
  normalizePremiseSelectionPayload,
  selectedPremiseEvidenceForIdeaCard,
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

  it('structures one preselected premise at a time without exposing its opaque id to the model', () => {
    const directive = ideaCardStructuringDirective({
      premiseId: 'P2',
      workingTitle: '候选二',
      storyCore: '主角在不可替换的职业责任中被迫做出选择',
      coreConflict: '冲突二',
    });

    expect(directive).toContain('恰好 1 张完整题材卡');
    expect(directive).toContain('不再重新选题');
    expect(directive).toContain('服务器已经锁定题材身份');
    expect(directive).toContain('候选二');
    expect(directive).not.toContain('P2');
    expect(directive).toContain('不要输出 premiseId、sourcePremiseId');
    expect(directive).toContain('不是自动补生或改写其它题材');
  });

  it('binds each one-card response back to the server-owned selected premise identity', () => {
    const selected = Array.from({ length: 5 }, (_, index) => ({
      premiseId: `P${index + 1}`,
      workingTitle: `候选${index + 1}`,
    }));
    const cards = selected.map((premise, index) => bindStructuredIdeaCardToPremise(premise, [{
      sourcePremiseId: 'MODEL_SHOULD_NOT_OWN_THIS',
      premiseId: 'MODEL_INTERNAL_ID',
      title: `完整卡${index + 1}`,
      hook: `这是第${index + 1}张完整题材卡的具体钩子`,
    }]));

    expect(cards).toHaveLength(5);
    expect(cards.map(card => card.sourcePremiseId)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5']);
    expect(cards.map(card => card.title)).toEqual(['完整卡1', '完整卡2', '完整卡3', '完整卡4', '完整卡5']);
    expect(cards.every(card => card.premiseId === undefined)).toBe(true);
  });

  it('rejects zero or multiple full cards for one selected premise instead of hiding the mismatch in a batch', () => {
    const premise = { premiseId: 'P3', workingTitle: '候选三' };
    expect(() => bindStructuredIdeaCardToPremise(premise, []))
      .toThrow('返回 0 张，期望恰好 1 张');
    expect(() => bindStructuredIdeaCardToPremise(premise, [{ title: 'A' }, { title: 'B' }]))
      .toThrow('返回 2 张，期望恰好 1 张');
  });

  it('keeps final-gate premise identity on the server instead of asking the model to echo opaque ids', () => {
    const directive = ideaGateLocalRepairDirective([
      {
        premise: { premiseId: 'P11', workingTitle: '旧味甜汤', storyCore: '主角从一碗甜汤查出旧案' },
        card: { sourcePremiseId: 'P11', title: '旧味甜汤', hook: '原钩子' },
        gateIssues: ['核心钩子信息过弱'],
      },
      {
        premise: { premiseId: 'P14', workingTitle: '假契', storyCore: '主角公开念出假契' },
        card: { sourcePremiseId: 'P14', title: '假契', hook: '原钩子二' },
        gateIssues: ['推进链证据不足'],
      },
    ]);

    expect(directive).toContain('patches 数组必须恰好 2 项');
    expect(directive).toContain('严格按输入 position 的顺序逐项对应');
    expect(directive).not.toContain('P11');
    expect(directive).not.toContain('P14');
    expect(directive).not.toContain('sourcePremiseId');
    expect(directive).not.toContain('premiseId');
  });

  it('merges ordered local patches without allowing the model to replace identity or project settings', () => {
    const cards = [{
      sourcePremiseId: 'P11',
      title: '旧标题',
      targetPlatform: 'fanqie',
      storyCategory: '悬疑',
      estimatedWords: 20000,
      hook: '旧钩子',
      description: '旧概要',
      noveltyProof: {
        familiarShell: '旧外壳',
        readerQuestion: '旧追问',
        secondOrderConsequence: '旧二阶后果',
      },
    }];
    const repaired = applyOrderedIdeaRepairPatches(cards, [{
      sourcePremiseId: 'PX',
      title: '模型试图换标题',
      targetPlatform: 'other',
      estimatedWords: 1,
      hook: '把原故事已有的压力与主动行动写清楚',
      noveltyProof: {
        readerQuestion: '新的具体追问是什么？',
        unknownField: '不得进入',
      },
      unknownTopLevel: '不得进入',
    }]);

    expect(repaired).toHaveLength(1);
    expect(repaired[0].sourcePremiseId).toBe('P11');
    expect(repaired[0].title).toBe('旧标题');
    expect(repaired[0].targetPlatform).toBe('fanqie');
    expect(repaired[0].estimatedWords).toBe(20000);
    expect(repaired[0].hook).toBe('把原故事已有的压力与主动行动写清楚');
    expect((repaired[0].noveltyProof as any).familiarShell).toBe('旧外壳');
    expect((repaired[0].noveltyProof as any).readerQuestion).toBe('新的具体追问是什么？');
    expect((repaired[0].noveltyProof as any).unknownField).toBeUndefined();
    expect(repaired[0].unknownTopLevel).toBeUndefined();
  });

  it('requires one ordered patch per failed card but never requires a premise id in the patch itself', () => {
    const cards = [
      { sourcePremiseId: 'P11', hook: '旧钩子一' },
      { sourcePremiseId: 'P14', hook: '旧钩子二' },
    ];
    expect(() => applyOrderedIdeaRepairPatches(cards, [{ hook: '只返回一项' }]))
      .toThrow('期望 2 个');
    expect(applyOrderedIdeaRepairPatches(cards, [
      { hook: '修复后的钩子一' },
      { hook: '修复后的钩子二' },
    ]).map(item => item.sourcePremiseId)).toEqual(['P11', 'P14']);
  });

  it('treats hook generation as expression of a preselected story rather than another search stage', () => {
    const contract = ideaHookRequirement('short_story');
    expect(contract).toContain('题材已经通过完整题材卡创建前的轻量候选池筛选');
    expect(contract).toContain('这里只把该题材最有吸引力的起始事件准确压缩成 hook');
    expect(contract).toContain('不再重新选题、换题');
    expect(contract).toContain('主角正在做什么或明确选择什么');
    expect(contract).toContain('继续阅读理由');
    expect(contract).toContain('现实代价');
    expect(contract).toContain('关系冲突');
    expect(contract).toContain('信息差');
    expect(contract).toContain('未解问题');
    expect(contract).toContain('不得按关键词数量或固定信号个数凑 Gate');
    expect(contract).not.toContain('内部广泛寻找');
    expect(contract).not.toContain('补足缺少');
  });

  it('keeps long-story hooks actionable without forcing short-story signal density', () => {
    const contract = ideaHookRequirement('long_novel');

    expect(contract).toContain('题材已经通过完整题材卡创建前的轻量候选池筛选');
    expect(contract).toContain('现实压力或代价');
    expect(contract).toContain('下一步具体行动');
    expect(contract).toContain('可持续追问');
    expect(contract).not.toContain('固定信号个数');
  });
});


describe('server-owned selected-premise evidence', () => {
  it('keeps preselection evidence off the API card while making it available to the final Gate', () => {
    const premise = selectedPremise('P-evidence');
    const card = bindStructuredIdeaCardToPremise(premise, [{
      title: '证据绑定题材',
      hook: '这是一段足够长的自然语言钩子，用来确认服务器内部证据不会暴露到返回 JSON。',
    }]);

    expect(selectedPremiseEvidenceForIdeaCard(card)).toEqual(expect.objectContaining({
      premiseId: 'P-evidence',
      activeChoice: premise.activeChoice,
      openingEvent: premise.openingEvent,
    }));
    expect(JSON.stringify(card)).not.toContain('activeChoice');
    expect(JSON.stringify(card)).not.toContain('protagonistSituation');
  });

  it('preserves the same server-owned evidence across a bounded local repair clone', () => {
    const premise = selectedPremise('P-repair-evidence');
    const card = bindStructuredIdeaCardToPremise(premise, [{
      title: '修复后仍绑定',
      hook: '原钩子已经足够长，但自然表达可能没有命中固定动词词表。',
    }]);
    const repaired = applyOrderedIdeaRepairPatches([card], [{ hook: '修复后钩子仍然只改变允许修改的文本字段，题材身份和前置证据都应保留。' }])[0];

    expect(selectedPremiseEvidenceForIdeaCard(repaired)).toEqual(expect.objectContaining({
      premiseId: 'P-repair-evidence',
      activeChoice: premise.activeChoice,
    }));
  });
});
