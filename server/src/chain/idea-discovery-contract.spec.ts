import { premiseSeedFactIssues } from './idea-discovery-contract';
import { describe, expect, it } from 'vitest';
import { standardDirectiveCache } from '../modules/module-standards/standard-directive.cache';
import {
  confirmedIdeaStoryCard,
  separateIdeaDiscoveryAudit,
  applyOrderedIdeaRepairPatches,
  applyIsolatedIdeaRepairPatches,
  retainValidAutomaticPlotTags,
  bindStructuredIdeaCardToPremise,
  ideaCardStructuringDirective,
  ideaPreselectionCapacity,
  ideaCardHistoryTitleReminder,
  ideaGateLocalRepairDirective,
  ideaHookRequirement,
  ideaPremiseSelectionDirective,
  ideaDiscoveryAuthorSettings,
  ideaDiscoveryAuthorContext,
  normalizePremiseSelectionPayload,
  minimumAcceptableIdeaCount,
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

describe('locked-card historical exclusion transport', () => {
  it('does not repeat full historical story material once the premise is locked, while retaining every title', () => {
    const excludes = [
      { title: '旧题材一', hook: '历史钩子秘密不应重复给已锁定题材卡'.repeat(15), description: '历史故事完整概要应在上游去重和最终Gate保留'.repeat(40) },
      { title: '旧\n题材二', hook: '第二条历史钩子', description: '第二条历史概要' },
    ];
    const original = structuredClone(excludes);
    const prompt = ideaCardHistoryTitleReminder(excludes);
    expect(prompt).toContain('1. 旧题材一');
    expect(prompt).toContain('2. 旧 题材二');
    expect(prompt).toContain('最终去重仍使用原始完整历史');
    expect(prompt).not.toContain(excludes[0].hook);
    expect(prompt).not.toContain(excludes[0].description);
    expect(prompt).not.toContain(excludes[1].description);
    expect(excludes).toEqual(original);
    expect(prompt.length).toBeLessThan(JSON.stringify(excludes).length / 3);
    expect(ideaCardHistoryTitleReminder([])).toBe('');
  });
});

describe('bounded preselection surplus',()=>{
  it('keeps eight reviewed paths only when the fixed pool supports five plus three',()=>{
    expect(ideaPreselectionCapacity(5,15)).toBe(8);
    expect(ideaPreselectionCapacity(5,6)).toBe(6);
    expect(ideaPreselectionCapacity(5,5)).toBe(5);
    expect(ideaPreselectionCapacity(2,12)).toBe(3);
    expect(ideaPreselectionCapacity(1,10)).toBe(2);
    expect(ideaPreselectionCapacity(3,12)).toBe(5);
    expect(ideaPreselectionCapacity(4,12)).toBe(6);
    expect(ideaPreselectionCapacity(8,24)).toBe(11);
    expect(ideaPreselectionCapacity(10,7)).toBe(7);
    expect(()=>ideaPreselectionCapacity(5,-1)).toThrow('候选池数量无效');
  });
});

describe('locked-card structuring reference transport',()=>{
  it('retains full target facts and all peer causal differences without repeatedly sending peer source and self-praise',()=>{
    const target={...selectedPremise('P1'),workingTitle:'目标题材',storyCore:'目标原池事实保留且不得更改',causalPlan:[{action:{field:'activeChoice',quote:'目标行动'}}]};
    const peer={...selectedPremise('P2'),workingTitle:'参照题材',storyCategory:'都市日常',
      storyCore:'参照原池完整故事不应在每张其它卡里重复'.repeat(60),
      differentiation:'参照候选自己声称新颖不得替代真正故事区别'.repeat(30),
      causalPlan:[{action:{field:'activeChoice',quote:'参照重复行动'},conditions:[],result:{field:'payoff',quote:'参照重复结局'}}]};
    const before=structuredClone([target,peer]);
    const prompt=ideaCardStructuringDirective(target,[target,peer],false);
    const refs=JSON.parse(prompt.split('【同批差异参照（只作边界，不生成或借用其故事路径）】')[1].trim());
    expect(refs).toHaveLength(1);
    expect(refs[0]).toEqual({
      workingTitle:peer.workingTitle,storyCategory:peer.storyCategory,
      coreConflict:peer.coreConflict,activeChoice:peer.activeChoice,escalation:peer.escalation,
      reversalEffect:peer.reversalEffect,payoff:peer.payoff,
      irreplaceableCarrier:peer.irreplaceableCarrier,
    });
    expect(prompt).toContain(target.storyCore);
    expect(prompt).toContain('目标行动');
    expect(prompt).not.toContain(peer.storyCore);
    expect(prompt).not.toContain(peer.differentiation);
    expect(prompt).not.toContain('参照重复行动');
    expect([target,peer]).toEqual(before);
    const oldPeers=Object.fromEntries(Object.entries(peer).filter(([key])=>key!=='premiseId'&&key!=='causalPlan'));
    expect(JSON.stringify(refs).length).toBeLessThan(JSON.stringify([oldPeers]).length/2);
  });
});

describe('requested genre is an identity constraint, not a duplicate verdict',()=>{
  it('keeps the selected genre shell and requires an event-level distinguishing beat without new fields',()=>{
    const prompt=ideaPremiseSelectionDirective('short_story',5,15);
    expect(prompt).toContain('隐藏能力、被低估、亮出本事属于应当兑现的共同类型承诺');
    expect(prompt).toContain('本身不算重复');
    expect(prompt).toContain('不可互换的关键操作、意外升级、胜负转向和实际代价');
    expect(prompt).toContain('不要求硬塞热血、搞笑、热梗');
    expect(prompt).toContain('收存证据、准备材料不能冒充导致对手行动');
    expect(prompt).toContain('恋爱类不能只有查案、补课、事后作证');
    expect(prompt).toContain('入选骨架应有至少一个真实事件构成可简短转述的记忆点');
    // Output economy is a transport optimization, not permission to omit
    // causal links or downgrade the preselection quality contract.
    expect(prompt).toContain('最短连续原文');
    expect(prompt).toContain('不丢掉决定性桥接');
    expect(prompt).toContain('勿跨字段重述同一整段');
    expect(prompt).toContain('必要的行动主体、对象、前置能力与兑现条件必须完整保留');
  });
});
describe('idea discovery preselection contract', () => {
  it('allows omitted self-assessed differentiation but keeps every causal field mandatory', () => {
    const item:any=selectedPremise('P1');delete item.differentiation;
    const pool=[{premiseId:'P1',workingTitle:'维修铺的选择',storyCore:'主角承担失去铺面的代价，完成自己作出的既定选择。'}];
    const result=normalizePremiseSelectionPayload({pool,selectedPremises:[item]},1,1);
    expect(result.selected[0].differentiation).toBeUndefined();
    expect(result.selected[0].activeChoice).toBe(item.activeChoice);
    for(const field of ['activeChoice','escalation','reversalEffect','payoff']) {
      expect(()=>normalizePremiseSelectionPayload({pool,selectedPremises:[{...item,[field]:''}]},1,1)).toThrow(field);
    }
  });
  it('keeps only already generated legal automatic tags, without choosing new tags or overriding manual choices',()=>{
    const raw={plotTags:['宫斗','字典外的自造标签','逆袭','宫斗'],description:'不可改动的故事事件'};
    const valid=retainValidAutomaticPlotTags(raw,[],['宫斗','逆袭','悬念反转']);
    expect(valid.plotTags).toEqual(['宫斗','逆袭']);
    expect(valid.description).toBe(raw.description);
    expect(raw.plotTags).toHaveLength(4);
    expect(retainValidAutomaticPlotTags(raw,['宫斗'],['宫斗'])).toBe(raw);
    const unknown={plotTags:['完全不存在的词']};
    expect(retainValidAutomaticPlotTags(unknown,[],['宫斗'])).toBe(unknown);
    expect(retainValidAutomaticPlotTags({plotTags:[]},[],['宫斗'])).toEqual({plotTags:[]});
  });
  it('isolates illegal card repair patches while preserving exact accepted dictionary and story rules',()=>{
    const first={sourcePremiseId:'P6',plotTags:['字典外标签'],description:'原故事一'};
    const second={sourcePremiseId:'P2',plotTags:['宫斗'],description:'原故事二'};
    const rejected:any[]=[];
    const fixed=applyIsolatedIdeaRepairPatches([first,second],
      [{dimensionPatch:{plotTags:['字典外标签']}},{description:'对原故事二已经核实的实际条件作局部补正'}],
      {dimensionRepairOptions:[{plotTags:['宫斗','逆袭']},{}],
       dimensionOnlyPositions:[0],metadataOnlyPositions:[0],
       storyRepairPositions:[1]},
      (index,error)=>rejected.push({index,reason:String((error as Error).message)}));
    expect(fixed[0]).toBe(first);
    expect(fixed[1].description).toBe('对原故事二已经核实的实际条件作局部补正');
    expect(fixed[1].sourcePremiseId).toBe('P2');
    expect(rejected).toEqual([{index:0,reason:'标签修复只能修改服务器点名字段并使用本次字典或作者选择的候选'}]);
    expect(()=>applyIsolatedIdeaRepairPatches([first,second],[{}],{},()=>{})).toThrow('数量不符');
    // A forbidden manual choice remains forbidden; a legal per-card patch never implies Gate passage.
    const fixedManual=applyIsolatedIdeaRepairPatches([first],[{dimensionPatch:{plotTags:['逆袭']}}],
      {dimensionRepairOptions:[{plotTags:['宫斗','逆袭']}],dimensionRepairSelections:[{plotTags:['宫斗']}],
       dimensionOnlyPositions:[0]},()=>{});
    expect(fixedManual[0]).toBe(first);
  });
  it('repairs only authorized dictionary fields and rejects invented labels or story edits for dimension-only failures',()=>{
    const original={sourcePremiseId:'P5',storyTone:['温情','热血'],description:'既有完整故事保持不变',ending:'原结局保持不变'};
    const options=[{storyTone:['温馨','热血']}];
    const patched=applyOrderedIdeaRepairPatches([original],[{dimensionPatch:{storyTone:['温馨','热血']}}],[],[],[],options,[0])[0];
    expect(patched.storyTone).toEqual(['温馨','热血']);expect(patched.description).toBe(original.description);expect(patched.ending).toBe(original.ending);
    for(const patch of [{dimensionPatch:{storyTone:['温情']}},{dimensionPatch:{writingStyle:['白描']}},
      {dimensionPatch:{storyTone:['温馨']},description:'偷改故事'}]) {
      expect(()=>applyOrderedIdeaRepairPatches([original],[patch],[],[],[],options,[0])).toThrow();
    }
    expect(()=>applyOrderedIdeaRepairPatches([original],[{dimensionPatch:{storyTone:['温馨']}}])).toThrow();
    expect(original.storyTone).toEqual(['温情','热血']);
  });
  it('projects only author choices for the initial generation and all later reviews without inferring omitted fields', () => {
    const input={storyType:'short_story',platform:'fanqie',storyCategory:'都市日常',webNovelGenre:['扮猪吃虎','退婚流'],
      plotTags:['婆媳'],storyTone:[],writingStyle:['白描'],pov:'第一人称',apiKey:'must-not-project'};
    const settings=ideaDiscoveryAuthorSettings(input);
    expect(settings).toMatchObject({webNovelGenre:['扮猪吃虎','退婚流'],plotTags:['婆媳'],storyTone:[],writingStyle:['白描'],pov:'第一人称'});
    expect(settings).not.toHaveProperty('apiKey');
    expect(ideaDiscoveryAuthorContext(input)).toContain(JSON.stringify(settings));
    expect(ideaDiscoveryAuthorContext(input)).toContain('类型相同不能豁免真实因果同构');
    expect(ideaDiscoveryAuthorSettings({storyCategory:'自动候选',discoveryCategoryOptions:['都市日常','悬疑']}))
      .toMatchObject({storyCategory:null,categoryCandidates:['都市日常','悬疑'],webNovelGenre:[]});
  });
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
    expect(contract).toContain('原池 storyCore 与所选 openingEvent');
    expect(contract).toContain('人物当时提出请求这一事件不能凭动机反转被取消');
    expect(contract).toContain('要写清谁实施、为谁实施、交给谁或影响谁');
    expect(contract).toContain('选择导致的升级—改变胜负条件—兑现及代价');
    expect(contract).toContain('共同条件之外的选择、升级机制和兑现路径仍应分别构思');
    expect(contract).toContain('不默认取pool前几项');
    expect(contract).toContain('建立能指向责任人的具体比对依据');
    expect(contract).toContain('已问话不等于已取得回答');
    expect(contract).toContain('对手获知的途径');
    expect(contract).toContain('普通直接因果不补无关手续或法律条文');
  });

  it('carries the whole causal chain into one-card structuring', () => {
    const directive = ideaCardStructuringDirective(selectedPremise('P1'));
    expect(directive).toContain('触发动作、人物身份与知情、到场事件、时间阶段、升级机制和结局方向');
    expect(directive).toContain('请求发生这一事实必须保留');
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

  it('continues with a qualified partial pool when the search target exceeds the minimum deliverable count', () => {
    const pool = Array.from({ length: 3 }, (_, index) => ({
      premiseId: 'P' + (index + 1),
      workingTitle: '成熟候选' + (index + 1),
      storyCore: '这是第' + (index + 1) + '个具有独立选择、升级和兑现路径的轻量题材骨架。',
    }));
    const result = normalizePremiseSelectionPayload({
      pool,
      selectedPremises: pool.map(item => selectedPremise(item.premiseId)),
    }, 5, 15, undefined, 3);

    expect(result.pool).toHaveLength(3);
    expect(result.selected).toHaveLength(3);
    expect(result.poolTargetMet).toBe(false);
    expect(() => normalizePremiseSelectionPayload({
      pool: pool.slice(0, 2),
      selectedPremises: pool.slice(0, 2).map(item => selectedPremise(item.premiseId)),
    }, 5, 15, undefined, 3)).toThrow('低于最低可交付数量 3 个');
  });

  it('allows fixed-pool selection to proceed with one qualified candidate when the broad pool is short', () => {
    const pool = [1, 2].map(index => ({
      premiseId: 'P' + index,
      workingTitle: '候选' + index,
      storyCore: '这是一个具有独立选择、升级和兑现路径的轻量题材骨架' + index,
    }));
    const result = normalizePremiseSelectionPayload({
      pool,
      selectedPremises: [selectedPremise('P1')],
    }, 5, 15, undefined, 1);
    const directive = ideaPremiseSelectionDirective('short_story', 5, 15, false, 1);

    expect(result.pool).toHaveLength(2);
    expect(result.selected).toHaveLength(1);
    expect(result.poolTargetMet).toBe(false);
    expect(directive).toContain('只有 1-5 个题材真正满足');
    expect(directive).toContain('selectedPremises 返回 1-5 项');
    expect(directive).toContain('绝不为了凑数加入弱项');
  });

  it('asks the fixed-pool selector for as many mature premises as exist without padding weak candidates', () => {
    const directive = ideaPremiseSelectionDirective('short_story', 5, 15, false, 3);
    expect(directive).toContain('只有 3-5 个题材真正满足');
    expect(directive).toContain('selectedPremises 返回 3-5 项');
    expect(directive).toContain('绝不为了凑数加入弱项');
    expect(ideaPremiseSelectionDirective('short_story', 5)).toContain('selectedPremises 返回 恰好 5 项');
  });

  it('allows fewer independently selected mature premises without relaxing evidence requirements', () => {
    const pool = Array.from({ length: 15 }, (_, index) => ({
      premiseId: 'P' + (index + 1),
      workingTitle: '候选' + (index + 1),
      storyCore: '这是第' + (index + 1) + '个具备独立因果路径的轻量题材骨架。',
    }));
    const four = pool.slice(0, 4).map(item => selectedPremise(item.premiseId));
    const result = normalizePremiseSelectionPayload({ pool, selectedPremises: four }, 5, 15, undefined, 3);
    expect(result.selected).toHaveLength(4);
    expect(result.poolTargetMet).toBe(true);

    const three = normalizePremiseSelectionPayload({ pool, selectedPremises: four.slice(0, 3) }, 5, 15, undefined, 3);
    expect(three.selected).toHaveLength(3);
    expect(() => normalizePremiseSelectionPayload({ pool, selectedPremises: four.slice(0, 2) }, 5, 15, undefined, 3))
      .toThrow('3-5 个成熟题材');
    expect(() => normalizePremiseSelectionPayload({ pool, selectedPremises: four }, 5, 15))
      .toThrow('5-5 个成熟题材');

    const missingEvidence = four.slice(0, 3).map(item => ({ ...item }));
    missingEvidence[1] = { ...missingEvidence[1], payoff: '' };
    expect(() => normalizePremiseSelectionPayload({ pool, selectedPremises: missingEvidence }, 5, 15, undefined, 3))
      .toThrow('payoff');
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

  it('keeps the original pool source even when the generated expansion tries to overwrite it', () => {
    const pool=['P1','P2'].map(premiseId=>({premiseId,workingTitle:'原池暂名'+premiseId,
      storyCore:'同一行动只能转移既有代价，不能消除代价'+premiseId}));
    const result=normalizePremiseSelectionPayload({pool,selectedPremises:pool.map(item=>({...selectedPremise(item.premiseId),
      workingTitle:'覆盖原暂名',storyCore:'展开自行改成行动消除所有代价'}))},2,2);
    expect(result.selected.map(item=>item.storyCore)).toEqual(pool.map(item=>item.storyCore));
    expect(result.selected.map(item=>item.workingTitle)).toEqual(pool.map(item=>item.workingTitle));
    expect(()=>normalizePremiseSelectionPayload({pool:[{...pool[0],storyCore:'主角把宠物命名为ChatGPT并试图用展开覆盖来源'},pool[1]],
      selectedPremises:pool.map(item=>({...selectedPremise(item.premiseId),storyCore:'覆盖来源后隐藏禁止命名'}))},2,2)).toThrow('禁止的故事命名');
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
    expect(directive).toContain('模型不得自行换身份、补生题材、改写其它题材或使用旧批次');
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

  it('repairs the reviewed story field without changing stage allocation or guessing a match', () => {
    const card = { sourcePremiseId: 'P4', setting: '记忆受损会持续累积。', ending: '她付出记忆代价，带母亲回家。',
      scopeBreakdown: [{ arc: '第一次用票', chapters: 2, reason: '她确认代价是有人忘记她一天。', outcome: '弟弟退烧。' }] };
    const patch = { storyPatches: [{ field: 'scopeBreakdown', stage: 1, subfield: 'reason',
      match: '确认代价', replacement: '起初误以为代价' }] };
    const result = applyOrderedIdeaRepairPatches([card], [patch], [], [], [0])[0];
    expect(result.scopeBreakdown).toEqual([{ ...card.scopeBreakdown[0], reason: '她起初误以为代价是有人忘记她一天。' }]);
    expect(card.scopeBreakdown[0].reason).toBe('她确认代价是有人忘记她一天。');
    expect(result.sourcePremiseId).toBe('P4'); expect(result.ending).toBe(card.ending);
    expect(() => applyOrderedIdeaRepairPatches([card], [patch])).toThrow('未获得内容审查授权');
    expect(() => applyOrderedIdeaRepairPatches([card], [{ storyPatches: [{ ...patch.storyPatches[0], subfield: 'chapters' }] }], [], [], [0])).toThrow('reason/outcome');
    expect(() => applyOrderedIdeaRepairPatches([card], [{ storyPatches: [{ field: 'ending', match: '不存在的原文', replacement: '改后' }] }], [], [], [0])).toThrow('未唯一定位');
    const repeated = { ...card, ending: '代价与代价' };
    expect(() => applyOrderedIdeaRepairPatches([repeated], [{ storyPatches: [{ field: 'ending', match: '代价', replacement: '记忆' }] }], [], [], [0])).toThrow('未唯一定位');
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

  it('preserves server-owned premise authority when an automatic plot tag is removed',()=>{
    const premise=selectedPremise('P-tag-evidence');
    const card=bindStructuredIdeaCardToPremise(premise,[{title:'自动标签归位',hook:'已有明确的初始冲突和可验证的真实行动路径。'}]);
    card.plotTags=['宫斗','模型自造词'] as any;
    const normalized=retainValidAutomaticPlotTags(card,[],['宫斗','逆袭']);
    expect(normalized.plotTags).toEqual(['宫斗']);
    expect(selectedPremiseEvidenceForIdeaCard(normalized)).toEqual(expect.objectContaining({
      premiseId:'P-tag-evidence',activeChoice:premise.activeChoice
    }));
    expect(normalized.sourcePremiseId).toBe('P-tag-evidence');
    expect(JSON.stringify(normalized)).not.toContain(premise.activeChoice);
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
describe('premise execution prerequisites', () => {
  it.each([
    { pool: [], selectedPremises: [], blocked: true, missingRequiredDimensions: ['基调', '文风', '流派', '视角'], message: '按 GEN-001 缺失必填维度，必须阻断' },
    { pool: [], selectedPremises: [], status: 'blocked', code: 'GEN-001', missingDimensions: ['基调'], message: '需补齐后才能进行题材筛选' },
    { pool: [], selectedPremises: [], blocked: true, reason: '不得用隐藏默认值补齐' },
  ])('preserves the model prerequisite refusal rather than reporting weak premises', payload => {
    expect(() => normalizePremiseSelectionPayload(payload, 5, 15)).toThrow('执行前提阻断');
    expect(() => normalizePremiseSelectionPayload(payload, 5, 15)).toThrow(payload.message || payload.reason!);
    expect(() => normalizePremiseSelectionPayload(payload, 5, 15)).not.toThrow('有效轻量题材胚子');
  });

  it('distinguishes unconfirmed discovery choices from incomplete project execution in the injected rule', () => {
    standardDirectiveCache.rebuild();
    const rule = standardDirectiveCache.rulesFor('idea_generate').find(item => item.id === 'GEN-001')!;
    expect(rule).toBeDefined();
    expect(rule.summary).toContain('不因此拒绝题材预选');
    expect(rule.summary).toContain('完整故事卡必须展示最终六维供用户确认');
    expect(rule.summary).toContain('创建项目及后续生成必须六维完整');
  });
});

describe('category diversity before story-card creation', () => {
  const payload = (categories: string[]) => {
    const pool = categories.map((storyCategory, i) => ({ premiseId: `P${i + 1}`, workingTitle: `题材${i + 1}`, storyCore: '人物有独立目标和对手，选择带来真实后果。', storyCategory }));
    return { pool, selectedPremises: pool.map(item => ({ ...selectedPremise(item.premiseId), storyCategory: item.storyCategory })) };
  };
  it('retains each selected premise category across a mixed-category batch', () => {
    const value = normalizePremiseSelectionPayload(payload(['悬疑惊悚', '现实生活', '古代言情']), 3, 9, ['悬疑惊悚', '现实生活', '古代言情']);
    expect(value.selected.map(x => x.storyCategory)).toEqual(['悬疑惊悚', '现实生活', '古代言情']);
  });
  it('rejects a batch collapsed into one category when several were explicitly offered', () => {
    expect(() => normalizePremiseSelectionPayload(payload(['悬疑惊悚', '悬疑惊悚']), 2, 6, ['悬疑惊悚', '现实生活'])).toThrow('全部落在同一分类');
  });
  it('rejects a fabricated category and relabeling a selected premise', () => {
    expect(() => normalizePremiseSelectionPayload(payload(['不存在的分类', '现实生活']), 2, 6, ['悬疑惊悚', '现实生活'])).toThrow('不在本次平台分类候选');
    const changed = payload(['悬疑惊悚', '现实生活']); changed.selectedPremises[0].storyCategory = '现实生活';
    expect(() => normalizePremiseSelectionPayload(changed, 2, 6, ['悬疑惊悚', '现实生活'])).toThrow('禁止改分类标签');
  });
  it('allows within-category exploration when the author fixed the category', () => {
    expect(normalizePremiseSelectionPayload(payload(['悬疑惊悚', '悬疑惊悚']), 2, 6, ['悬疑惊悚']).selected).toHaveLength(2);
  });
});

describe('confirmed idea story-card projection', () => {
  it('does not manufacture ending or scene outcomes from synopsis and stage labels', () => {
    const card = confirmedIdeaStoryCard({ description: '她必须在更多人出事前查清真相', coreConflict: '查清旧案', scopeBreakdown: [{ arc: '调查', reason: '找到线索' }] });
    expect(card.ending).toBeUndefined(); expect(card.scenes[0].outcome).toBeUndefined();
  });
  it('inherits only explicitly confirmed closure and state changes', () => {
    const card = confirmedIdeaStoryCard({ ending: '她提交证据，承认沉默的责任，与母亲断联', scopeBreakdown: [{ arc: '公开作证', reason: '同学施压要求撤回', outcome: '材料交付，主角承担公开作证的代价' }] });
    expect(card.ending).toContain('承认沉默的责任'); expect(card.scenes[0].outcome).toBe('材料交付，主角承担公开作证的代价');
  });
});


it('packs identical review-standard lines without losing card-specific criteria, order or reference context',async()=>{
 const {packIdeaReviewStandards}=await import('./idea-discovery-contract');
 const common='已有共同规则，事实不能覆盖。'.repeat(35);
 const cards=[{title:'A',description:'第一题材事实',executionStandard:common+'\n\n本卡仅允许科幻\n'+common},{title:'B',description:'第二题材事实',executionStandard:common+'\n本卡仅允许历史'}];
 const references=[{title:'已通过',ending:'既定结局',executionStandard:common+'\n本卡仅允许历史'}];
 const before=JSON.stringify({cards,references}),packed=packIdeaReviewStandards(cards,references) as any;
 expect(JSON.stringify(packed).length).toBeLessThan(before.length);
 const decode=(rows:any[])=>rows.map(({executionStandardRefs,...row})=>({...row,executionStandard:executionStandardRefs.map((id:string)=>packed.standardLines[id]).join('\n')}));
 expect(decode(packed.cards)).toEqual(cards);expect(decode(packed.references)).toEqual(references);
 expect(JSON.stringify({cards,references})).toBe(before);
 expect(packIdeaReviewStandards([{executionStandard:'短'}],[])).toEqual({cards:[{executionStandard:'短'}],references:[]});
});
it('packs local repair standards losslessly with per-card facts and all pending defects preserved',()=>{
 const common='共用标准：不改变已确认人物、关键机制和结果条件。'.repeat(35);
 const targets=[{card:{title:'A',setting:'事实A'},executionStandard:common+'\n本卡分类A',gateIssues:['缺少取得路径']},
  {card:{title:'B',setting:'事实B'},executionStandard:common+'\n本卡分类B',gateIssues:['遗漏交付结果']}];
 const before=JSON.stringify(targets),text=ideaGateLocalRepairDirective(targets);
 const json=text.split('【按顺序待修复内容】\n')[1].split('\n若存在standardLines')[0];
 const data=JSON.parse(json);
 expect(data.cards.map((row:any)=>row.executionStandardRefs.map((id:string)=>data.standardLines[id]).join('\n')))
  .toEqual(targets.map(row=>row.executionStandard));
 expect(data.cards.map((row:any)=>row.gateIssues)).toEqual(targets.map(row=>row.gateIssues));
 expect(data.cards.map((row:any)=>row.card)).toEqual(targets.map(row=>row.card));
 expect(JSON.stringify(targets)).toBe(before);
});


describe('minimum acceptable idea count', () => {
  it('allows at most two missing cards without making a three-card request collapse to one', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(minimumAcceptableIdeaCount)).toEqual([1, 2, 3, 3, 3, 4, 5]);
    expect(() => minimumAcceptableIdeaCount(0)).toThrow('正整数');
  });
});


describe('confirmed story persistence boundary', () => {
  it('keeps the batch discovery audit separate from the canonical selected story without mutating input', () => {
    const input = {
      title: '已选题材',
      sourcePremiseId: 'P2',
      ideaDiscoveryAudit: {
        schemaVersion: 8,
        acceptedEvidence: [{ sourcePremiseId: 'P2', title: '已选题材' }],
        candidateAssessments: [{ sourcePremiseId: 'P3', passed: false, issues: ['不合格候选'] }],
      },
    };
    const original = structuredClone(input);
    const result = separateIdeaDiscoveryAudit(input);
    expect(result.confirmedStory).toEqual({ title: '已选题材', sourcePremiseId: 'P2' });
    expect(result.ideaDiscoveryAudit).toEqual(original.ideaDiscoveryAudit);
    expect(input).toEqual(original);
    expect(JSON.stringify(result.confirmedStory)).not.toContain('candidateAssessments');
  });

  it('does not invent an audit when the selected story has none', () => {
    const result = separateIdeaDiscoveryAudit({ title: '自定义题材' });
    expect(result.confirmedStory).toEqual({ title: '自定义题材' });
    expect(result.ideaDiscoveryAudit).toBeNull();
  });
});

describe('candidate seed structural evidence prevents downstream rescue',()=>{
 it('rejects lengthy freeform synopses with no traceable prerequisite',()=>{
  expect(premiseSeedFactIssues('发现线索后胜利了。'.repeat(50))).toContain('候选骨架缺少有序的处境触发、主动选择、必要条件、反转兑现、分类流派机制');
 });
 it('blocks missing causal bridge even when other sections are present',()=>{
  const front='【处境触发】某普通职员发现主管隐瞒了影响居民权益的关键材料。【主动选择】职员决定拒绝替主管签字并公开原始记录。';
  const end='【反转兑现】主管的决定被原始材料推翻，职员却因此失去了原有工作。【分类流派机制】被低估的普通人依靠多年积累的职业技能揭破欺骗并承担代价。';
  expect(premiseSeedFactIssues(front+'【必要条件】有证据。'+end)).toContain('【必要条件】缺少足以进入选优的实际事件或因果条件');
  expect(premiseSeedFactIssues(front+'【必要条件】记录须经过有权核查人员确认并作出书面决定后才产生效果。'+end)).toEqual([]);
 });
});
