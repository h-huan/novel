import { prohibitedFictionNames } from '../../shared/src/fiction-naming';
import { FICTION_NAMING_POLICY, IDEA_PRESELECTION_REVIEW_POLICY } from '../../shared/src/system-workflow-rules.registry';
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

/** Only project explicitly planned outcomes; a synopsis is not an ending. */
export function confirmedIdeaStoryCard(idea: Record<string, any>): Record<string, any> {
  const prohibited = prohibitedFictionNames(idea);
  if (prohibited.length) throw new Error(`题材包含禁止的故事命名：${prohibited.join('、')}；请先完成统一命名修复再创建。`);
  return {
    coreConflict: idea.coreConflict,
    protagonistDesire: idea.protagonist,
    turningPoint: idea.mainReversal || idea.turningPoint,
    reveal: idea.mainReversal || idea.reveal,
    ending: idea.ending,
    scenes: (Array.isArray(idea.scopeBreakdown) ? idea.scopeBreakdown : []).map((stage: any) => ({
      goal: stage?.arc,
      conflict: stage?.reason,
      outcome: stage?.outcome,
    })),
  };
}

/**
 * 题材池的“广搜数量”只用于提高搜索覆盖，不是质量 Gate。
 * 未被选中的轻量胚子只需最小骨架；只有最终选中的 requestedCount 项需要完整筛选证据。
 */
export function normalizePremiseSelectionPayload(
  payload: unknown,
  requestedCount: number,
  poolTarget: number,
  categoryOptions?: readonly string[],
): PremiseSelectionResult {
  if (!Number.isInteger(requestedCount) || requestedCount <= 0) {
    throw new Error('创建前题材筛选的目标数量无效。');
  }
  const source = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  if (source.blocked === true || source.status === 'blocked') {
    const dimensions = source.missingRequiredDimensions ?? source.missingDimensions;
    const missing = Array.isArray(dimensions) ? dimensions.map(String).join('、') : '';
    const reason = String(source.message || source.reason || '').trim();
    throw new Error(`创建前题材筛选被执行前提阻断${missing ? `（${missing}）` : ''}：${reason || '模型未说明原因'}；未进入题材质量筛选。`);
  }
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
    const prohibited = prohibitedFictionNames({ ...poolItem, ...item });
    if (prohibited.length) throw new Error(`已选题材 ${premiseId} 含禁止的故事命名：${prohibited.join('、')}；请使用原创虚构名称。`);
    const missing = SELECTED_PREMISE_FIELDS.filter(field => String(item[field] || '').trim().length < 4);
    if (missing.length) {
      throw new Error(`已选题材 ${premiseId} 缺少创建完整题材卡所需的筛选证据：${missing.join('、')}。`);
    }
    selectedIds.add(premiseId);
    const storyCategory = String(item.storyCategory || poolItem.storyCategory || '').trim();
    if (categoryOptions?.length && item.storyCategory && poolItem.storyCategory
      && item.storyCategory !== poolItem.storyCategory) {
      throw new Error(`已选题材 ${premiseId} 的分类与原胚子不一致，禁止改分类标签制造差异。`);
    }
    if (categoryOptions?.length && !categoryOptions.includes(storyCategory)) {
      throw new Error(`已选题材 ${premiseId} 的分类“${storyCategory || '空'}”不在本次平台分类候选中。`);
    }
    return {
      ...poolItem,
      ...item,
      premiseId,
      workingTitle: String(item.workingTitle || poolItem.workingTitle || '').trim(),
      storyCore: String(item.storyCore || poolItem.storyCore || '').trim(),
      ...(categoryOptions?.length ? { storyCategory } : {}),
    };
  });

  if (requestedCount > 1 && categoryOptions && new Set(categoryOptions).size > 1
    && new Set(selected.map(item => item.storyCategory)).size < 2) {
    throw new Error('未预选分类的发现批次全部落在同一分类，未执行跨分类题材探索；不创建同分类的整批故事卡。');
  }

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
对已选项逐对比较“人物关系—主动选择—对手制约—因果升级—反转改变—结局代价”；换时代、职业、身份包装或分类标签不算实质差异。若两项共享同一营救、潜入、被利用和反设局路径，须在锁定题材前从原轻量池选择真正不同的成熟项。筛选证据必须证明故事成立，不能靠自称独特或完整字段过关；能力触发、边界与代价应前后一致，不要求解释超自然科学来源或提前揭示全部谜底。选中前须比较openingEvent、coreConflict、escalation、reversalEffect与payoff中的同一事实；临时代价不能无条件变成永久代价，物资预支不能无条件变成复活或赎回活人，同一个人不能既已死亡又等待营救。无法沿原规则成立的胚子应在锁定前淘汰，从原池选择成熟项。反转不得取消已建立的核心前提，程序或权利的兑现必须有因果条件，不能让新能力或一次公开证据无条件解决全部冲突。
选中前先在内部逐项对照原池 storyCore 与所选 openingEvent、coreConflict、activeChoice、escalation、reversalEffect、payoff：已明确的触发动作、人物身份、到场事件、时间阶段和结局方向须保留；未明确的真实动机可经反转揭示，但人物当时提出请求这一事件不能凭动机反转被取消。只在内部检查，不增加输出字段。
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
  batch: readonly Record<string, unknown>[] = [],
  includePreselectionPolicy = true,
): string {
  const safePremise = Object.fromEntries(
    Object.entries(selectedPremise || {}).filter(([key]) => key !== 'premiseId'),
  );
  const references = batch.filter(item => item.premiseId !== selectedPremise.premiseId).map(item =>
    Object.fromEntries(Object.entries(item).filter(([key]) => key !== 'premiseId')));
  return `【完整题材卡结构化】
${includePreselectionPolicy ? IDEA_PRESELECTION_REVIEW_POLICY : "按已注入GEN-002锁定前继承与差异规则执行。"}
这个题材胚子已经在“完整题材卡创建前筛选”阶段被选中。现在只负责把这一项结构化成恰好 1 张完整题材卡，不再重新选题。
- 服务器已经锁定题材身份；不要输出 premiseId、sourcePremiseId 或任何内部标识，系统会在返回后绑定原题材身份。
- 禁止替换、合并、拆分、另造题材，禁止因为某字段难写就把故事换成更容易过 Gate 的套路。
- 标题必须先兑现点击承诺：脱离概要也能看懂具体冲突、反常关系或未解问题；从原故事已有事件和关系中提炼，不沿用文雅暂名，不靠夸张空话和虚假设定。hook先写命运改变的现场与人物选择，不用职业查证流程开篇。
- hook、description、setting、ending、scopeBreakdown、coreConflict、mainReversal、uniquePoint、noveltyProof 必须展开同一个已选胚子的因果链；能力触发、持续时间、代价与同一人物状态须在所有字段一致。只能补足表达和可执行细节，不能改变胚子的核心人物处境、主动选择、升级机制、反转效果与兑现方向。
- 所有面向读者的字段（尤其protagonist、hook、description和ending）使用自然、准确的中文叙述：不要写残缺主语、同义句堆叠、证据到结论的逻辑跳跃或硬凑的AI式抽象判断。事实与推断要分开：局部证据真实不等于整件事的责任已获证明；发现或公开事实不等于相关权利、程序或机构处置已经完成。遇到“越A越B”“因此”“坐实”等因果词，逐字核对B是否真由已建立事实推出，不能靠修辞掩盖条件缺失。若原骨架结局依赖第三方授权、法定程序或证据取得条件，必须在既定事件链中留下可信的行动和权限桥梁，否则不能把结果写成已发生。
- 最终 Gate 只做独立验收；若这一张结构化后仍不成立，系统应暴露这一题材的管线失败，而不是自动补生或改写其它题材。
写完后再逐项核对原池骨架和所选胚子中的触发动作、人物身份与知情、到场事件、时间阶段、升级机制和结局方向；同一事实在所有卡片字段中保持一致。人物当时的请求可以有后来才揭露的另一层动机，但请求发生这一事实必须保留。
【已选题材胚子（内部标识已由服务器移除）】
${JSON.stringify(safePremise)}
【同批差异参照（只作边界，不生成或借用其故事路径）】
${JSON.stringify(references)}`;
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
  'protagonist',
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
  targets: ReadonlyArray<{ premise?: unknown; card?: unknown; gateIssues?: unknown; storyRepairAllowed?: boolean; autoGenreRepairAllowed?: boolean }>,
  allowedGenres: readonly string[] = [],
): string {
  const safeTargets = targets.map((target, index) => ({
    position: index + 1,
    premise: withoutIdeaInternalIdentity(target?.premise, 'premiseId'),
    card: withoutIdeaInternalIdentity(target?.card, 'sourcePremiseId'),
    gateIssues: Array.isArray(target?.gateIssues) ? target.gateIssues.map(String) : [],
    storyRepairAllowed: target.storyRepairAllowed === true,
    autoGenreRepairAllowed: target.autoGenreRepairAllowed === true,
  }));
  return `【最终 Gate·同题材有序局部修复】
下面 ${safeTargets.length} 项已经完成创建前筛选和完整题材卡结构化。服务器已经锁定每一项的题材身份，你不负责回传、生成或修改内部标识，也不得换题。
1. patches 数组必须恰好 ${safeTargets.length} 项，并严格按输入 position 的顺序逐项对应；每项只写需要修改的字段。
2. 若gateIssues明确点名标题，可额外返回title，只改原故事的表达且不得换题；其它情况下标题保持原样。顶层只允许 hook、description、protagonist、coreConflict、uniquePoint、mainReversal；protagonist仅可修人物简介的指代、语义与既有弱点表达，不得改名、人物身份或动机；noveltyProof 内只允许 familiarShell、uncommonCombination、avoidedPatterns、irreplaceableWhy、secondOrderConsequence、readerQuestion。不要输出平台、分类、篇幅、章数、标签或任何内部标识。
仅当 autoGenreRepairAllowed=true 时可额外返回 webNovelGenre（从允许字典 ${JSON.stringify(allowedGenres)} 中选择1-2项），纠正系统自动误贴的流派；不改变分类、用户已选流派或故事的行动机制，不可以通过凭空新增系统任务、奖励或幕后操作来迁就标签。autoGenreRepairAllowed=false 时不允许返回该字段。所有标签纠正仍须重新完整 Gate 审核。
3. 只修 gateIssues 点名的表达证据，让原故事已有的异常/信息差、现实压力、主角行动、关系、因果升级、反转和二阶后果更清楚；禁止新增另一套案件、能力、身份、亲属关系或结局。
若storyRepairAllowed=true，必须同步修复点名问题在setting、ending与scopeBreakdown中的所有矛盾引用，不能只改description留下旧规则。这些字段不接受整对象覆盖，只能另返回storyPatches数组：{"field":"setting或ending","match":"逐字存在且唯一的短原文","replacement":"修正后片段"}，或{"field":"scopeBreakdown","stage":1,"subfield":"reason或outcome","match":"该阶段字段中逐字存在且唯一的短原文","replacement":"修正后片段"}。stage从1开始。保留原题材人物、核心困境、选择方向和结局代价，不新增能力或改变已有规则数值；存在无法沿原事实修复的真实矛盾就保持拒绝，不能靠补一条万能规则圆回。不得改arc、chapters、篇幅或平台配置。storyRepairAllowed=false时禁止此数组。
若gateIssues点名故事命名，可另返回namingReplacements对象（原禁止名称:原创虚构名称），服务器会在全部故事文本中统一替换，包含人物/宠物名、结局与章节规划；只许更换名称，不改变行为、关系和事件。其它题材不允许此字段。
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
  namingRepairPositions: readonly number[] = [],
  storyRepairPositions: readonly number[] = [],
  autoGenreRepairPositions: readonly number[] = [],
  allowedGenres: readonly string[] = [],
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
    if(patch.webNovelGenre!==undefined){
      if(!autoGenreRepairPositions.includes(index))throw new Error('只有系统自动选择且被证实不合适的流派允许修订');
      if(!Array.isArray(patch.webNovelGenre)||patch.webNovelGenre.length<1||patch.webNovelGenre.length>2
        ||patch.webNovelGenre.some((genre:unknown)=>typeof genre!=='string'||!allowedGenres.includes(genre))
        ||new Set(patch.webNovelGenre).size!==patch.webNovelGenre.length)
        throw new Error('流派修订必须使用现有创作字典中1-2个不同标签');
      next.webNovelGenre=[...patch.webNovelGenre];
    }
    if (namingRepairPositions.includes(index) && patch.namingReplacements !== undefined) {
      const replacements = ideaRepairRecord(patch.namingReplacements);
      if (!replacements || !Object.keys(replacements).length) throw new Error('故事命名修复必须给出完整名称映射');
      for (const [oldName, newName] of Object.entries(replacements)) {
        if (!FICTION_NAMING_POLICY.prohibitedNames.some(name => name.toLowerCase() === oldName.toLowerCase())
          || typeof newName !== 'string' || newName.trim().length < 2 || newName.length > 30
          || prohibitedFictionNames({ title: newName }).length) throw new Error('故事命名修复只能将禁止名称改为原创虚构名称');
        const pattern = new RegExp(oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        const replace = (value: unknown): unknown => typeof value === 'string' ? value.replace(pattern, () => newName.trim())
          : Array.isArray(value) ? value.map(replace)
          : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, part]) => [key, replace(part)])) : value;
        for (const field of FICTION_NAMING_POLICY.narrativeFields) if (field in next) next[field] = replace(next[field]);
      }
    }
    if (titleRepairPositions.includes(index) && typeof patch.title === 'string' && patch.title.trim()) next.title = patch.title.trim();
    for (const field of IDEA_GATE_REPAIR_TEXT_FIELDS) {
      const value = typeof patch[field] === 'string' ? String(patch[field]).trim() : '';
      if (value) next[field] = value;
    }

    if (patch.storyPatches !== undefined) {
      if (!storyRepairPositions.includes(index)) throw new Error('题材设定/结局/阶段修复未获得内容审查授权');
      if (!Array.isArray(patch.storyPatches) || !patch.storyPatches.length) throw new Error('题材故事字段修复必须给出非空局部补丁数组');
      const stages = Array.isArray(next.scopeBreakdown) ? next.scopeBreakdown.map(stage => ({ ...(ideaRepairRecord(stage) || {}) })) : [];
      for (const raw of patch.storyPatches) {
        const change = ideaRepairRecord(raw);
        if (!change || typeof change.match !== 'string' || !change.match.trim() || typeof change.replacement !== 'string' || !change.replacement.trim()) throw new Error('题材故事字段修复须有非空逐字原文与替换片段');
        const field = String(change.field);
        let target: Record<string, unknown> = next;
        let key = field;
        if (field === 'scopeBreakdown') {
          const stage = Number(change.stage);
          if (!Number.isInteger(stage) || stage < 1 || stage > stages.length || !['reason', 'outcome'].includes(String(change.subfield))) throw new Error('题材阶段修复只能定位既有阶段的reason/outcome，编号从1开始');
          target = stages[stage - 1]; key = String(change.subfield);
        } else if (!['setting', 'ending'].includes(field)) throw new Error('题材故事局部修复只允许setting、ending及既有阶段reason/outcome');
        const source = target[key];
        if (typeof source !== 'string' || !source.includes(change.match) || source.indexOf(change.match) !== source.lastIndexOf(change.match)) throw new Error(`题材故事字段${field}修复原文未唯一定位，禁止猜测合并`);
        target[key] = source.replace(change.match, () => String(change.replacement));
      }
      if (patch.storyPatches.some(raw => ideaRepairRecord(raw)?.field === 'scopeBreakdown')) next.scopeBreakdown = stages;
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


/** Prompt transport only: each complete standard is an ordered list of exact lines. */
export function packIdeaReviewStandards(cards:Record<string,any>[],references:Record<string,any>[]) {
 const standardLines:Record<string,string>={},ids=new Map<string,string>();
 const pack=(rows:Record<string,any>[])=>rows.map(row=>{
  if(typeof row.executionStandard!=='string')return {...row};
  const {executionStandard,...rest}=row;
  const executionStandardRefs=executionStandard.split('\n').map(text=>{
   let id=ids.get(text);if(!id){id='D'+(ids.size+1);ids.set(text,id);standardLines[id]=text;}return id;
  });
  return {...rest,executionStandardRefs};
 });
 const packedCards=pack(cards),packedReferences=pack(references);
 const encoded={standardLines,cards:packedCards,references:packedReferences};
 const plain={cards,references};
 return JSON.stringify(encoded).length<JSON.stringify(plain).length?encoded:plain;
}
