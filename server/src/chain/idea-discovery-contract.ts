export type IdeaStoryType = 'short_story' | 'long_novel';

// 创建前筛选已经形成了结构化语义证据。它只在当前进程内随服务器绑定的题材卡流转，
// 不进入 JSON / API / Canon，避免最终 Gate 丢掉上游证据后又靠关键词重新猜同一件事。
const selectedPremiseEvidenceByCard = new WeakMap<object, Record<string, unknown>>();

export function selectedPremiseEvidenceForIdeaCard(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  const evidence = selectedPremiseEvidenceByCard.get(value as object);
  return evidence ? { ...evidence } : null;
}

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
选题必须先证明读者为什么愿意点开：暂名也应有具体利益冲突、反常关系或迫切悬念，不能全是意象与道具名。先比较不同关系与欲望、主动对手、选择和推进路径，不要把所有题材收敛为“职业发现账册/印记→追查权贵→公开证据”。遵守用户分类，在分类内部广搜不同冲突；现实两难、关系背叛、绝境求生、欲望争夺、反常身份均可按故事取舍，不是逐项配额。
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
  selectedPremise: Record<string, unknown>,
): string {
  const safePremise = Object.fromEntries(
    Object.entries(selectedPremise || {}).filter(([key]) => key !== 'premiseId'),
  );
  return `【完整题材卡结构化】
这个题材胚子已经在“完整题材卡创建前筛选”阶段被选中。现在只负责把这一项结构化成恰好 1 张完整题材卡，不再重新选题。
- 服务器已经锁定题材身份；不要输出 premiseId、sourcePremiseId 或任何内部标识，系统会在返回后绑定原题材身份。
- 禁止替换、合并、拆分、另造题材，禁止因为某字段难写就把故事换成更容易过 Gate 的套路。
- 标题必须先兑现点击承诺：脱离概要也能看懂具体冲突、反常关系或未解问题；从原故事已有事件和关系中提炼，不沿用文雅暂名，不靠夸张空话和虚假设定。hook先写命运改变的现场与人物选择，不用职业查证流程开篇。
- hook、description、coreConflict、mainReversal、uniquePoint、noveltyProof 必须展开同一个已选胚子的因果链；只能补足表达和可执行细节，不能改变胚子的核心人物处境、主动选择、升级机制、反转效果与兑现方向。
- 最终 Gate 只做独立验收；若这一张结构化后仍不成立，系统应暴露这一题材的管线失败，而不是自动补生或改写其它题材。
【已选题材胚子（内部标识已由服务器移除）】
${JSON.stringify(safePremise)}`;
}

/**
 * 每个已选 premise 独立结构化一张完整题材卡。
 * 模型只负责卡片内容；opaque premise 身份始终由服务器绑定，避免批量大 JSON 少卡或错 ID。
 */
export function bindStructuredIdeaCardToPremise(
  selectedPremise: Record<string, unknown>,
  rawIdeas: unknown,
): Record<string, unknown> {
  const premiseId = String(selectedPremise?.premiseId || '').trim();
  const label = String(selectedPremise?.workingTitle || premiseId || '未知题材').trim();
  if (!premiseId) throw new Error('完整题材卡结构化缺少服务器持有的 premiseId。');
  const ideas = Array.isArray(rawIdeas) ? rawIdeas : [];
  if (ideas.length !== 1) {
    throw new Error(`题材“${label}”的完整题材卡结构化返回 ${ideas.length} 张，期望恰好 1 张；系统不会换题、补题或重复改写其它题材。`);
  }
  const rawCard = ideas[0];
  if (!rawCard || typeof rawCard !== 'object' || Array.isArray(rawCard)) {
    throw new Error(`题材“${label}”的完整题材卡不是合法对象；系统不会猜测或换题。`);
  }
  const safeCard = Object.fromEntries(
    Object.entries(rawCard as Record<string, unknown>)
      .filter(([key]) => key !== 'sourcePremiseId' && key !== 'premiseId'),
  );
  const boundCard = { ...safeCard, sourcePremiseId: premiseId };
  selectedPremiseEvidenceByCard.set(boundCard, { ...selectedPremise });
  return boundCard;
}

const IDEA_GATE_REPAIR_TEXT_FIELDS = [
  'hook',
  'description',
  'coreConflict',
  'uniquePoint',
  'mainReversal',
] as const;

const IDEA_GATE_REPAIR_NOVELTY_FIELDS = [
  'familiarShell',
  'uncommonCombination',
  'avoidedPatterns',
  'irreplaceableWhy',
  'secondOrderConsequence',
  'readerQuestion',
] as const;

function ideaRepairRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function withoutIdeaInternalIdentity(value: unknown, internalField: string): Record<string, unknown> {
  const record = ideaRepairRecord(value) || {};
  return Object.fromEntries(Object.entries(record).filter(([key]) => key !== internalField));
}

/**
 * 最终 Gate 的一次同题材局部修复协议。
 * premise/card 的内部身份由服务器按数组位置持有，不交给模型回传，避免真实模型遗漏 opaque id
 * 就把整批题材判成失败。模型只负责修 Gate 点名的可读字段。
 */
export function ideaGateLocalRepairDirective(
  targets: ReadonlyArray<{ premise?: unknown; card?: unknown; gateIssues?: unknown }>,
): string {
  const safeTargets = targets.map((target, index) => ({
    position: index + 1,
    premise: withoutIdeaInternalIdentity(target?.premise, 'premiseId'),
    card: withoutIdeaInternalIdentity(target?.card, 'sourcePremiseId'),
    gateIssues: Array.isArray(target?.gateIssues) ? target.gateIssues.map(String) : [],
  }));
  return `【最终 Gate·同题材有序局部修复】
下面 ${safeTargets.length} 项已经完成创建前筛选和完整题材卡结构化。服务器已经锁定每一项的题材身份，你不负责回传、生成或修改内部标识，也不得换题。
1. patches 数组必须恰好 ${safeTargets.length} 项，并严格按输入 position 的顺序逐项对应；每项只写需要修改的字段。
2. 若gateIssues明确点名标题，可额外返回title，只改原故事的表达且不得换题；其它情况下标题保持原样。顶层只允许 hook、description、coreConflict、uniquePoint、mainReversal；noveltyProof 内只允许 familiarShell、uncommonCombination、avoidedPatterns、irreplaceableWhy、secondOrderConsequence、readerQuestion。不要输出平台、分类、篇幅、章数、标签或任何内部标识。
3. 只修 gateIssues 点名的表达证据，让原故事已有的异常/信息差、现实压力、主角行动、关系、因果升级、反转和二阶后果更清楚；禁止新增另一套案件、能力、身份、亲属关系或结局。
4. 某字段无需改就省略；禁止用空字符串删除原证据。服务器只会合并白名单内的非空文本，其余输出会被忽略。
5. 只输出一个 JSON 对象：{"patches":[{...}]}，不输出分析、Markdown 或额外文字。
【按顺序待修复内容】
${JSON.stringify(safeTargets)}`;
}

/**
 * 把模型返回的有序局部补丁合回服务器持有的原卡。
 * 只允许白名单文本字段覆盖；标题仅在 Gate 点名的位置可修，身份与用户配置始终取原卡。
 */
export function applyOrderedIdeaRepairPatches(
  cards: readonly Record<string, unknown>[],
  rawPatches: unknown,
  titleRepairPositions: readonly number[] = [],
): Array<Record<string, unknown>> {
  if (!Array.isArray(rawPatches) || rawPatches.length !== cards.length) {
    const actual = Array.isArray(rawPatches) ? rawPatches.length : 0;
    throw new Error(`最终 Gate 定向局部修复返回 ${actual} 个有序补丁，期望 ${cards.length} 个；题材身份仍由系统保留，不会用别的题材补位。`);
  }

  return cards.map((card, index) => {
    const selectedPremiseEvidence = selectedPremiseEvidenceForIdeaCard(card);
    const patch = ideaRepairRecord(rawPatches[index]);
    if (!patch) {
      throw new Error(`最终 Gate 定向局部修复第 ${index + 1} 项不是对象；系统不会猜测它对应哪个题材。`);
    }
    const next: Record<string, unknown> = { ...card };
    if (titleRepairPositions.includes(index) && typeof patch.title === 'string' && patch.title.trim()) next.title = patch.title.trim();
    for (const field of IDEA_GATE_REPAIR_TEXT_FIELDS) {
      const value = typeof patch[field] === 'string' ? String(patch[field]).trim() : '';
      if (value) next[field] = value;
    }

    const noveltyPatch = ideaRepairRecord(patch.noveltyProof);
    if (noveltyPatch) {
      const existingNovelty = ideaRepairRecord(card.noveltyProof) || {};
      const acceptedNovelty: Record<string, unknown> = {};
      for (const field of IDEA_GATE_REPAIR_NOVELTY_FIELDS) {
        const value = typeof noveltyPatch[field] === 'string' ? String(noveltyPatch[field]).trim() : '';
        if (value) acceptedNovelty[field] = value;
      }
      if (Object.keys(acceptedNovelty).length > 0) {
        next.noveltyProof = { ...existingNovelty, ...acceptedNovelty };
      }
    }

    // 显式恢复服务器持有的身份，哪怕模型在未知字段里试图改写也不会生效。
    next.sourcePremiseId = card.sourcePremiseId;
    if (selectedPremiseEvidence) {
      selectedPremiseEvidenceByCard.set(next, selectedPremiseEvidence);
    }
    return next;
  });
}

export function ideaHookRequirement(storyType: IdeaStoryType): string {
  const storyFirst = '题材已经通过完整题材卡创建前的轻量候选池筛选；这里只把该题材最有吸引力的起始事件准确压缩成 hook，不再重新选题、换题或为了命中 Gate 关键词改造故事。异常/信息差不等于超能力，可以来自现实利益冲突、关系反常、制度困境、隐藏事实或超常现象';
  if (storyType === 'short_story') {
    return `35-80字；${storyFirst}；必须让读者看见主角正在做什么或明确选择什么，并自然给出至少一个来自本故事自身的继续阅读理由，例如现实代价、关系冲突、资源争夺、信息差、迫近后果或未解问题。不得按关键词数量或固定信号个数凑 Gate，也不能把关键行动/选择只藏在 description 里`;
  }
  return `35-80字；${storyFirst}；直接写出现实压力或代价、主角下一步具体行动，并留下可持续追问；不能只有设定说明`;
}
