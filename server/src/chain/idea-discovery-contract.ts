export type IdeaStoryType = 'short_story' | 'long_novel';

/**
 * 灵感发现的 hook 生成契约必须与 IdeaAppealGateService 使用同一口径。
 * 这里是生成侧唯一文案来源，避免 Prompt 要求和 Gate 判据再次漂移。
 */
export const SHORT_IDEA_HOOK_MIN_SIGNALS = 3;

const SELECTED_PREMISE_FIELDS = [
  'protagonistSituation',
  'openingEvent',
  'coreConflict',
  'activeChoice',
  'escalation',
  'reversalEffect',
  'payoff',
  'irreplaceableCarrier',
  'secondOrderConsequence',
  'readerQuestion',
  'differentiation',
] as const;

export interface PremiseSelectionResult {
  pool: Array<Record<string, unknown>>;
  selected: Array<Record<string, unknown>>;
  poolTargetMet: boolean;
}

/**
 * 题材池的“广搜数量”只用于提高搜索覆盖，不是质量 Gate。
 * 未被选中的轻量胚子只需最小骨架；只有最终选中的 requestedCount 项需要完整筛选证据。
 */
export function normalizePremiseSelectionPayload(
  payload: unknown,
  requestedCount: number,
  poolTarget: number,
): PremiseSelectionResult {
  if (!Number.isInteger(requestedCount) || requestedCount <= 0) {
    throw new Error('创建前题材筛选的目标数量无效。');
  }
  const source = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const rawPool = Array.isArray(source.pool) ? source.pool : [];
  const rawSelected = Array.isArray(source.selectedPremises) ? source.selectedPremises : [];

  // 未选中的池只保留最小骨架；单个额外候选写坏不能拖死已经选中的成熟题材。
  const pool: Array<Record<string, unknown>> = [];
  const byId = new Map<string, Record<string, unknown>>();
  for (const raw of rawPool) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const premiseId = String(item.premiseId || '').trim();
    const workingTitle = String(item.workingTitle || '').trim();
    const storyCore = String(item.storyCore || '').trim();
    if (!premiseId || workingTitle.length < 2 || storyCore.length < 8 || byId.has(premiseId)) continue;
    const normalized = { ...item, premiseId, workingTitle, storyCore };
    pool.push(normalized);
    byId.set(premiseId, normalized);
  }

  if (pool.length < requestedCount) {
    throw new Error(`创建前题材筛选只有 ${pool.length} 个有效轻量题材胚子，少于本次需要的 ${requestedCount} 个；系统不会用弱题材补数。`);
  }
  if (rawSelected.length !== requestedCount) {
    throw new Error(`创建前题材筛选必须明确选出 ${requestedCount} 个成熟题材；当前选择数量为 ${rawSelected.length}。`);
  }

  const selectedIds = new Set<string>();
  const selected = rawSelected.map((raw, index) => {
    if (!raw || typeof raw !== 'object') {
      throw new Error(`创建前题材筛选的第 ${index + 1} 个已选题材缺少结构化证据。`);
    }
    const item = raw as Record<string, unknown>;
    const premiseId = String(item.premiseId || '').trim();
    if (!premiseId || selectedIds.has(premiseId)) {
      throw new Error('创建前题材筛选返回了空或重复的已选 premiseId。');
    }
    const poolItem = byId.get(premiseId);
    if (!poolItem) {
      throw new Error(`创建前题材筛选引用了轻量候选池中不存在的 premiseId：${premiseId || '空'}。`);
    }
    const missing = SELECTED_PREMISE_FIELDS.filter(field => String(item[field] || '').trim().length < 4);
    if (missing.length) {
      throw new Error(`已选题材 ${premiseId} 缺少创建完整题材卡所需的筛选证据：${missing.join('、')}。`);
    }
    selectedIds.add(premiseId);
    return {
      ...poolItem,
      ...item,
      premiseId,
      workingTitle: String(item.workingTitle || poolItem.workingTitle || '').trim(),
      storyCore: String(item.storyCore || poolItem.storyCore || '').trim(),
    };
  });

  return {
    pool,
    selected,
    poolTargetMet: pool.length >= Math.max(requestedCount, Number.isFinite(poolTarget) ? Math.floor(poolTarget) : requestedCount),
  };
}

/**
 * 完整题材卡创建之前的唯一选题契约。
 * 这一阶段只产生轻量题材池并明确选择，不生成展示卡，不让最终 Gate 承担主要选题。
 */
export function ideaPremiseSelectionDirective(
  storyType: IdeaStoryType,
  requestedCount: number,
  poolSize = Math.max(requestedCount * 3, requestedCount + 5),
): string {
  const storyTypeRule = storyType === 'short_story'
    ? '短篇必须能在有限篇幅内形成单线闭环和明确兑现；反转少而重，不能靠不断加设定续命。'
    : '长篇必须有可持续升级的核心矛盾、人物成长/关系变化和阶段性兑现空间，不能只有一个短梗被机械拉长。';
  return `【题材卡创建前筛选】
这一步发生在完整题材卡创建之前。先广泛搜寻，再比较，再选择；禁止先创建完整题材卡再交给最终 Gate 大量淘汰。
1. 以 ${poolSize} 个真正不同的轻量题材胚子作为广搜目标；这里只写 premiseId、暂名和一句到两句核心故事骨架，不写完整题材卡。${poolSize} 是扩大搜索覆盖的目标，不是整批成功的硬门槛；若已经充分比较并能明确选出 ${requestedCount} 个成熟题材，可以少于 ${poolSize}，禁止为了凑数填弱项。
2. 未被选中的轻量胚子不需要补齐完整筛选字段；只有最终选中的 ${requestedCount} 个题材，才必须给出人物处境、核心冲突、主角主动选择、选择后的因果升级、有效反转/兑现、生活/职业载体不可替换性、二阶后果、读者持续追问和与历史题材的差异证据。
3. 必须在创建完整题材卡之前淘汰：只有噱头没有人物目标/主动选择、冲突不能升级、反转只是补充信息、职业/关系可随意替换、只有悬念没有兑现、熟悉套路只换名换皮、单层“行为→超常奖惩→调查”的寓言机制。
4. 从轻量胚子池中明确选出恰好 ${requestedCount} 个成熟题材；选择由故事成立程度和本次平台/分类/创作设定共同决定，不按关键词数量打分，不把最终 Gate 当主要选题器。
5. ${storyTypeRule}
6. 输出 pool 和 selectedPremises：pool 保持轻量；selectedPremises 只包含已经选中的 ${requestedCount} 项及其筛选证据。不要输出完整 hook/description/scopeBreakdown，也不要写评分表、淘汰理由长文或思考过程。`;
}

/**
 * 创建前筛选完成后，只把被选中的胚子结构化为完整题材卡；不允许在这里重新选题。
 */
export function ideaCardStructuringDirective(
  selectedPremises: readonly Record<string, unknown>[],
): string {
  const ids = selectedPremises.map(item => String(item?.premiseId || '').trim()).filter(Boolean);
  return `【完整题材卡结构化】
以下 ${selectedPremises.length} 个题材胚子已经在“完整题材卡创建前筛选”阶段被选中。现在只负责把它们逐一结构化成完整题材卡，不再重新选题。
- 每张完整卡必须一一对应 sourcePremiseId：${JSON.stringify(ids)}。
- 禁止替换、合并、拆分、另造题材，禁止因为某字段难写就把故事换成更容易过 Gate 的套路。
- hook、description、coreConflict、mainReversal、uniquePoint、noveltyProof 必须展开同一个已选胚子的因果链；只能补足表达和可执行细节，不能改变胚子的核心人物处境、主动选择、升级机制、反转效果与兑现方向。
- 最终 Gate 只做独立验收；若结构化后仍不成立，系统应暴露管线失败，而不是自动补生另一批题材。
【已选题材胚子】
${JSON.stringify(selectedPremises)}`;
}

export function ideaHookRequirement(storyType: IdeaStoryType): string {
  const storyFirst = '题材已经通过完整题材卡创建前的轻量候选池筛选；这里只把该题材最有吸引力的起始事件准确压缩成 hook，不再重新选题、换题或为了命中 Gate 关键词改造故事。异常/信息差不等于超能力，可以来自现实利益冲突、关系反常、制度困境、隐藏事实或超常现象';
  if (storyType === 'short_story') {
    return `35-80字；${storyFirst}；hook 应自然形成异常/信息差、明确代价或时限、主角具体行动/选择、关系锚点中的至少 ${SHORT_IDEA_HOOK_MIN_SIGNALS} 类有效信号，其中必须包含主角具体行动或明确选择；其余两类按故事本身决定，不要求固定组合，也不能把关键行动/选择只藏在 description 里`;
  }
  return `35-80字；${storyFirst}；直接写出现实压力或代价、主角下一步具体行动，并留下可持续追问；不能只有设定说明`;
}
