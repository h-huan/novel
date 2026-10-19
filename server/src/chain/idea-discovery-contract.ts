import {IDEA_CARD_PROMISE_CLOSURE_POLICY, STORY_PREREQUISITE_POLICY} from '../../shared/src/system-workflow-rules.registry';
import { assertPremiseCausalPlans, bindPremiseCausalPlan } from './premise-causal-plan';
import { applyIdeaScopeAllocation, bindUniqueIdeaScopeAllocation, type IdeaScopeAllocationPlan } from './idea-scope-allocation';
import { prohibitedFictionNames, applyFictionNamingReplacements } from '../../shared/src/fiction-naming';
import { bindPremiseCategory } from './premise-category-identity';
import { FICTION_NAMING_POLICY, IDEA_PRESELECTION_REVIEW_POLICY } from '../../shared/src/system-workflow-rules.registry';
export type IdeaStoryType = 'short_story' | 'long_novel';

export class PremiseNamingError extends Error {}

/** Current rejection and attempt history are different views. Never report a
 * fixed initial defect as the reason the latest candidate is still blocked. */
export function latestIdeaFailureReasons(assessments:readonly {sourcePremiseId?:unknown;passed?:unknown;issues?:unknown}[],missingIds:readonly string[]):string[]{
  const latest=new Map<string,typeof assessments[number]>();
  for(const item of assessments){const id=String(item.sourcePremiseId||'').trim();if(id)latest.set(id,item);}
  return [...new Set(missingIds.flatMap(id=>{
    const item=latest.get(id);return item&&item.passed!==true&&Array.isArray(item.issues)
      ? item.issues.filter((issue):issue is string=>typeof issue==='string'&&!!issue.trim()):[];
  }))];
}

/** Only author-selected discovery settings; never infer choices from generated candidates. */
export function ideaDiscoveryAuthorSettings(input: {
  storyType?: string; platform?: string; storyCategory?: string; targetAudience?: string;
  webNovelGenre?: string[]; storyTone?: string[]; writingStyle?: string[];
  submissionTags?: string[]; plotTags?: string[]; pov?: string; targetWords?: string; genreFitNote?: string;
  discoveryCategoryOptions?: string[];
}) {
  return {
    storyType: input.storyType ?? null, platform: input.platform ?? null,
    storyCategory: input.discoveryCategoryOptions && input.discoveryCategoryOptions.length > 1 ? null : input.storyCategory ?? null,
    ...(input.discoveryCategoryOptions?.length ? { categoryCandidates: input.discoveryCategoryOptions } : {}),
    targetAudience: input.targetAudience || null, webNovelGenre: input.webNovelGenre || [],
    storyTone: input.storyTone || [], writingStyle: input.writingStyle || [],
    submissionTags: input.submissionTags || [], plotTags: input.plotTags || [],
    pov: input.pov || null, targetWords: input.targetWords || null, genreFitNote: input.genreFitNote || null,
  };
}

export function ideaDiscoveryAuthorContext(input: Parameters<typeof ideaDiscoveryAuthorSettings>[0]): string {
  return '\n【本次作者明确选择；空项为未指定，不能由候选反推】' + JSON.stringify(ideaDiscoveryAuthorSettings(input))
    + '\n本次明确的共同流派、关系或情节条件须保留，不因共同条件本身判来源偏移或同构；仍比较共同条件之外的主动选择、具体升级、反转改变与兑现代价，类型相同不能豁免真实因果同构。';
}

// 创建前筛选已经形成了结构化语义证据。它只在当前进程内随服务器绑定的题材卡流转，
// 不进入 JSON / API / Canon，避免最终 Gate 丢掉上游证据后又靠关键词重新猜同一件事。
const selectedPremiseEvidenceByCard = new WeakMap<object, Record<string, unknown>>();

export function selectedPremiseEvidenceForIdeaCard(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  const evidence = selectedPremiseEvidenceByCard.get(value as object);
  return evidence ? structuredClone(evidence) : null;
}

export const SELECTED_PREMISE_FIELDS = [
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
    // A pool item is not an approved expanded plan. Never inherit a stray plan
    // from it when the selected candidate omitted its own prerequisites.
    const { causalPlan: _unreviewedPoolPlan, ...poolFields } = item;
    const normalized = { ...bindPremiseCategory(poolFields, categoryOptions, false), premiseId, workingTitle, storyCore };
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
    const item = bindPremiseCategory(raw as Record<string, unknown>, categoryOptions);
    const premiseId = String(item.premiseId || '').trim();
    if (!premiseId || selectedIds.has(premiseId)) {
      throw new Error('创建前题材筛选返回了空或重复的已选 premiseId。');
    }
    const rawPoolItem = byId.get(premiseId);
    const poolItem = rawPoolItem ? bindPremiseCategory(rawPoolItem, categoryOptions) : undefined;
    if (!poolItem) {
      throw new Error(`创建前题材筛选引用了轻量候选池中不存在的 premiseId：${premiseId || '空'}。`);
    }
    const prohibited = prohibitedFictionNames({ ...poolItem, ...item,
      workingTitle: poolItem.workingTitle, storyCore: poolItem.storyCore });
    if (prohibited.length) throw new PremiseNamingError(`已选题材 ${premiseId} 含禁止的故事命名：${prohibited.join('、')}；请使用原创虚构名称。`);
    // Difference is established by the independent overlap review, not this self-description.
    const missing = SELECTED_PREMISE_FIELDS.filter(field => field !== 'differentiation' && String(item[field] || '').trim().length < 4);
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
    return bindPremiseCausalPlan({
      ...poolItem,
      ...item,
      premiseId,
      workingTitle: String(poolItem.workingTitle).trim(),
      storyCore: String(poolItem.storyCore).trim(),
      ...(categoryOptions?.length ? { storyCategory } : {}),
    });
  });

  if (requestedCount > 1 && categoryOptions && new Set(categoryOptions).size > 1
    && new Set(selected.map(item => item.storyCategory)).size < 2) {
    throw new Error('未预选分类的发现批次全部落在同一分类，未执行跨分类题材探索；不创建同分类的整批故事卡。');
  }

  if (rawSelected.some(item => item && typeof item === 'object' && 'causalPlan' in item)) assertPremiseCausalPlans({ selected });
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
  includeSharedPolicy = true,
): string {
  const storyTypeRule = storyType === 'short_story'
    ? '短篇必须能在有限篇幅内形成单线闭环和明确兑现；反转少而重，不能靠不断加设定续命。'
    : '长篇必须有可持续升级的核心矛盾、人物成长/关系变化和阶段性兑现空间，不能只有一个短梗被机械拉长。';
  return `【题材卡创建前筛选】
这一步发生在完整题材卡创建之前。先广泛搜寻，再比较，再选择；禁止先创建完整题材卡再交给最终 Gate 大量淘汰。
${includeSharedPolicy ? STORY_PREREQUISITE_POLICY : '按已注入GEN-002的生成前必要条件合同规划。'}
已选项在展开完整卡之前先提供causalPlan：只列影响成败的状态转移，不列普通动作清单，不设固定条数。每项action、conditions、result均用{field,quote}逐字锚定本题材筛选字段；覆盖关键阶段结果及payoff。conditions可为空的只有普通直接因果，能力边界、资料取得/转交、知情、权限、到场与他人决定需要的条件须写入对应筛选字段后再引用，不能由结局倒推。计划是简短故事事件数据，不输出思考过程、自评或长篇论证；原池范围和已有调用不增加。
原池的storyCore也须用一到两句写清“处境与触发—主动选择—选择导致的升级—改变胜负条件—兑现及代价”的因果方向，不能只列职业和开端，再把所有展开补成同一条翻案路径。严格保留用户指定的类型、关系与情节条件；共同条件之外的选择、升级机制和兑现路径仍应分别构思，不能把职业列表当成不同故事。先在内部按实际因果路径归组，再跨不同路径比较选取成熟项，不默认取pool前几项；未选候选也须提供可辨认的路径，才能真正作为原池备用。以上只在现有storyCore中表达，不新增字段、输出长篇分析或增加模型调用。
选题必须先证明读者为什么愿意点开：暂名也应有具体利益冲突、反常关系或迫切悬念，不能全是意象与道具名。先比较不同关系与欲望、主动对手、选择和推进路径，不要把所有题材收敛为“职业发现账册/印记→追查权贵→公开证据”。遵守用户分类，在分类内部广搜不同冲突；现实两难、关系背叛、绝境求生、欲望争夺、反常身份均可按故事取舍，不是逐项配额。
对已选项逐对比较“人物关系—主动选择—对手制约—因果升级—反转改变—结局代价”；换时代、职业、身份包装或分类标签不算实质差异。若两项共享同一营救、潜入、被利用和反设局路径，须在锁定题材前从原轻量池选择真正不同的成熟项。筛选证据必须证明故事成立，不能靠自称独特或完整字段过关；能力触发、边界与代价应前后一致，不要求解释超自然科学来源或提前揭示全部谜底。选中前须比较openingEvent、coreConflict、escalation、reversalEffect与payoff中的同一事实；临时代价不能无条件变成永久代价，物资预支不能无条件变成复活或赎回活人，同一个人不能既已死亡又等待营救。无法沿原规则成立的胚子应在锁定前淘汰，从原池选择成熟项。反转不得取消已建立的核心前提，程序或权利的兑现必须有因果条件，不能让新能力或一次公开证据无条件解决全部冲突。
选中前先在内部逐项对照原池 storyCore 与所选 openingEvent、coreConflict、activeChoice、escalation、reversalEffect、payoff：已明确的触发动作、人物身份、到场事件、时间阶段和结局方向须保留；未明确的真实动机可经反转揭示，但人物当时提出请求这一事件不能凭动机反转被取消。原池骨架涉及代写、转交、救助等多方动作时，要写清谁实施、为谁实施、交给谁或影响谁；没有明确的对象关系不得在展开时自行定成相反事实。只在内部检查，不增加输出字段。
合理展开可补充原池未限定且与原约束兼容的细节；不得把原有职业或专业经历升级成更高等级、冠军资历、新权限或新能力来取得胜负，也不能让新增关键证据、对手目的或新角色取代原骨架的反转和兑现依赖。展开需要的关键身份与因果条件应在本次原池骨架中先明确，不能等到筛选字段再偷偷升级。
先固定原池中每条规则的触发动作、作用对象及适用条件，再展开选择、升级、反转与兑现。尤其核对“有/无、已经/尚未、只作用于/不作用于”等条件；后文不能把作用对象改成其排除对象，也不能用一个此前没有的例外或新能力兑现原机制做不到的结果。若原机制无法支撑拟定结局，选择符合原规则的行动与代价，或在锁定前改选原池成熟候选，不把矛盾留给完整卡修复。selectedPremises 不返回或重写storyCore、workingTitle；这两项由服务器从原池继承。
1. 以 ${poolSize} 个真正不同的轻量题材胚子作为广搜目标；这里只写 premiseId、暂名和一句到两句核心故事骨架，不写完整题材卡。${poolSize} 是扩大搜索覆盖的目标，不是整批成功的硬门槛；若已经充分比较并能明确选出 ${requestedCount} 个成熟题材，可以少于 ${poolSize}，禁止为了凑数填弱项。
2. 未被选中的轻量胚子不需要补齐完整筛选字段；只有最终选中的 ${requestedCount} 个题材，才必须给出人物处境、核心冲突、主角主动选择、选择后的因果升级、有效反转/兑现、生活/职业载体不可替换性、二阶后果、读者持续追问和与历史题材的差异证据。
3. 必须在创建完整题材卡之前淘汰：只有噱头没有人物目标/主动选择、冲突不能升级、反转只是补充信息、职业/关系可随意替换、只有悬念没有兑现、熟悉套路只换名换皮、单层“行为→超常奖惩→调查”的寓言机制。
4. 从轻量胚子池中明确选出恰好 ${requestedCount} 个成熟题材；选择由故事成立程度和本次平台/分类/创作设定共同决定，不按关键词数量打分，不把最终 Gate 当主要选题器。payoff须写出从主角行动到结果成立的必要桥接：涉及他人决定、机构认可或对手配合时，说明谁依据什么作出该决定，不能把交出证据、人情口碑、集体支持或主动请求直接当成对方必然认可。普通直接因果不补无关手续或法律条文；原池没有可成立的路径时，在锁定前选择其它成熟项，不把缺口留给完整卡再编新规则。
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
    Object.fromEntries(Object.entries(item).filter(([key]) => key !== 'premiseId' && key !== 'causalPlan')));
  return `【完整题材卡结构化】
${includePreselectionPolicy ? IDEA_PRESELECTION_REVIEW_POLICY : "按已注入GEN-002锁定前继承与差异规则执行。"}
这个题材胚子已经在“完整题材卡创建前筛选”阶段被选中。现在只负责把这一项结构化成恰好 1 张完整题材卡，不再重新选题。
${includePreselectionPolicy ? STORY_PREREQUISITE_POLICY : '按已注入GEN-002的同一必要条件合同展开。'}
先读取causalPlan逐项确定本卡setting、description、mainReversal、ending和scopeBreakdown各自承接的行动、条件、结果，再写展示表达。所有影响成败的已审条件须落入实际故事字段，不能只留在内部计划；可以换表达，不能删掉取得、传递、触发或决定的环节。新加人名或场景不等于获准增加新能力、权限、证据渠道或自动到场安排。不要在卡中回传causalPlan或审查自评，服务器保留内部来源，最终审核仍独立执行。
- 服务器已经锁定题材身份；不要输出 premiseId、sourcePremiseId 或任何内部标识，系统会在返回后绑定原题材身份。
- 禁止替换、合并、拆分、另造题材，禁止因为某字段难写就把故事换成更容易过 Gate 的套路。
- 标题必须先兑现点击承诺：脱离概要也能看懂具体冲突、反常关系或未解问题；从原故事已有事件和关系中提炼，不沿用文雅暂名，不靠夸张空话和虚假设定。hook先写命运改变的现场与人物选择，不用职业查证流程开篇。
- hook、description、setting、ending、scopeBreakdown、coreConflict、mainReversal、uniquePoint、noveltyProof 必须展开同一个已选胚子的因果链；能力触发、持续时间、代价与同一人物状态须在所有字段一致。只能补足表达和可执行细节，不能改变胚子的核心人物处境、主动选择、升级机制、反转效果与兑现方向。
- 最终 Gate 独立验收，失败须如实拒绝；由服务器在本批原池与共享预算内处理缺额，模型不得自行换身份、补生题材、改写其它题材或使用旧批次。
写完后再逐项核对原池骨架和所选胚子中的触发动作、人物身份与知情、到场事件、时间阶段、升级机制和结局方向；同一事实在所有卡片字段中保持一致。人物当时的请求可以有后来才揭露的另一层动机，但请求发生这一事实必须保留。
原池storyCore是事实来源；其它已选字段是经过来源核查的展开，不能用重复出现的展开新规则替代原池条件。若仍发现两者互斥，不得通过新增例外或能力把错误前提圆成另一故事。
${IDEA_CARD_PROMISE_CLOSURE_POLICY}
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
      .filter(([key]) => key !== 'sourcePremiseId' && key !== 'premiseId' && key !== 'causalPlan'),
  );
  const boundCard = bindUniqueIdeaScopeAllocation({ ...safeCard, sourcePremiseId: premiseId });
  selectedPremiseEvidenceByCard.set(boundCard, structuredClone(selectedPremise));
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
/** Manual choices are conjunctive; random choices may use any nonempty, unique subset of the dictionary. */
export function discoveryDimensionSelectionIssues(value:unknown,selected:readonly string[],options:readonly string[]):string[]{
 if(!Array.isArray(value)||!value.length||value.some(item=>typeof item!=='string'||!item.trim())||new Set(value).size!==value.length)
  return ['标签须为非空、无重复的字符串数组'];
 if(selected.length){
  if(value.length!==selected.length||selected.some(item=>!value.includes(item)))return ['手动选择的全部标签须原样继承，不得少选或替换'];
 }else if(value.some(item=>!options.includes(item)))return ['随机标签只能从本次字典候选中选择'];
 return [];
}

export function ideaGateLocalRepairDirective(
  targets: ReadonlyArray<{ premise?: unknown; card?: unknown; executionStandard?: string; gateIssues?: unknown; storyRepairAllowed?: boolean;
    dimensionRepairOptions?: Record<string, readonly string[]>; dimensionRepairSelections?: Record<string, readonly string[]>;
    scopeAllocationPlan?: IdeaScopeAllocationPlan }>,
): string {
  const safeTargets = targets.map((target, index) => ({
    position: index + 1,
    premise: withoutIdeaInternalIdentity(target?.premise, 'premiseId'),
    card: withoutIdeaInternalIdentity(target?.card, 'sourcePremiseId'),
    executionStandard: target.executionStandard || '',
    gateIssues: Array.isArray(target?.gateIssues) ? target.gateIssues.map(String) : [],
    storyRepairAllowed: target.storyRepairAllowed === true,
    dimensionRepairOptions: target.dimensionRepairOptions || {},
    dimensionRepairSelections: target.dimensionRepairSelections || {},
    scopeAllocationPlan: target.scopeAllocationPlan,
  }));
  return `【最终 Gate·同题材有序局部修复】
下面 ${safeTargets.length} 项已经完成创建前筛选和完整题材卡结构化。服务器已经锁定每一项的题材身份，你不负责回传、生成或修改内部标识，也不得换题。
1. patches 数组必须恰好 ${safeTargets.length} 项，并严格按输入 position 的顺序逐项对应；每项只写需要修改的字段。
2. 若gateIssues明确点名标题，可额外返回title，须满足4—16字符的本地合同（标点和数字均计入），只改原故事的表达且不得换题；其它情况下标题保持原样。patches每项内部只允许 hook、description、coreConflict、uniquePoint、mainReversal；noveltyProof 内只允许 familiarShell、uncommonCombination、avoidedPatterns、irreplaceableWhy、secondOrderConsequence、readerQuestion。不要输出平台、分类、篇幅、章数或任何内部标识。仅当服务器提供dimensionRepairOptions时，可另返回dimensionPatch对象，只修其中点名的标签字段，从该字段给定候选中选择1项或实际需要的多项，不重复；dimensionRepairSelections中非空的手动选择须全部原样继承，不能只选其中一部分；未授权字段不能修改。只存在标签问题时只返回dimensionPatch，不改故事，不返回空补丁。
3. 每项executionStandard是本卡完整的平台、分类与创作执行标准，修订后仍须全部满足；不能只修点名因果而破坏关系推进、阶段回报或其它既定阅读承诺。只修 gateIssues 点名的表达证据，让原故事已有的异常/信息差、现实压力、主角行动、关系、因果升级、反转和二阶后果更清楚；禁止新增另一套案件、能力、身份、亲属关系或结局。
先核对premise.storyCore中的原池事实是否允许这次修复；不能把其它展开字段里重复出现的新机制当作原池授权。改变一处规则的适用对象或状态时，须同步核对hook、description、setting、反转、结局与全部阶段的同一事实依赖；不能只改规则定义而让既有事件仍按相反条件发生。无法在原池事实与锁定选择、代价下修复时，该项返回空对象保留原卡供最终门继续拒绝，不补万能例外或新能力。
若storyRepairAllowed=true，必须同步修复点名问题在setting、ending与scopeBreakdown中的所有矛盾引用，不能只改description留下旧规则。这些字段不接受整对象覆盖，只能另返回storyPatches数组：{"field":"setting或ending","match":"逐字存在且唯一的短原文","replacement":"修正后片段"}，或{"field":"scopeBreakdown","stage":1,"subfield":"reason或outcome","match":"该阶段字段中逐字存在且唯一的短原文","replacement":"修正后片段"}。stage从1开始。保留原题材人物、核心困境、选择方向和结局代价，不新增能力或改变已有规则数值；存在无法沿原事实修复的真实矛盾就保持拒绝，不能靠补一条万能规则圆回。不得改arc、chapters、篇幅或平台配置。storyRepairAllowed=false时禁止此数组。
若gateIssues点名故事命名，可另返回namingReplacements对象（原禁止名称:原创虚构名称），服务器会在全部故事文本中统一替换，包含人物/宠物名、结局与章节规划；只许更换名称，不改变行为、关系和事件。其它题材不允许此字段。
仅当服务器给出scopeAllocationPlan时，可在该patch内返回scopeAllocation正整数数组，按原阶段顺序写每阶段占用的章节数量（不是章节序号）；长度等于原阶段数，合计严格等于冻结plannedChapters。只改数量，不改阶段文字、总章数、总字数、故事或身份。只有标签/数量问题时只返回对应dimensionPatch/scopeAllocation，不改故事，也不返回空补丁。
4. 某字段无需改就省略；禁止用空字符串删除原证据。服务器只会合并白名单内的非空文本，其余输出会被忽略。
5. 根对象只有patches；所有修订字段均放在patches对应项内。标签修订结构为{"patches":[{"dimensionPatch":{"点名字段":["本卡给定候选原文"]}}]}，不得把dimensionPatch或其它修订字段放在patches数组旁边。不输出分析、Markdown或额外文字。
${IDEA_CARD_PROMISE_CLOSURE_POLICY}
【按顺序待修复内容】
${JSON.stringify(packIdeaReviewStandards(safeTargets,[]))}
若存在standardLines，cards按position逐项对应patches；executionStandardRefs按原顺序取standardLines并用换行拼回，逐字还原本卡全部标准。若未压缩则直接读取cards的executionStandard。references为空，不另造题材。`;
}

/**
 * 把模型返回的有序局部补丁合回服务器持有的原卡。
 * 只允许白名单文本字段覆盖；标题仅在 Gate 点名的位置可修，身份与用户配置始终取原卡。
 */
export function orderedIdeaRepairPatches(payload: unknown, targetCount: number): unknown {
  const envelope = ideaRepairRecord(payload);
  if (!envelope) throw new Error('局部修复响应须为对象');
  const fields = [...IDEA_GATE_REPAIR_TEXT_FIELDS, 'title', 'noveltyProof', 'dimensionPatch', 'storyPatches', 'namingReplacements', 'scopeAllocation'];
  const misplaced = Object.keys(envelope).filter(key => fields.includes(key));
  if (!misplaced.length) return envelope.patches;
  if (targetCount !== 1) throw new Error('多卡修复字段落在patches外，无法唯一绑定题材；不得猜测归属');
  const rows = envelope.patches === undefined ? [{}] : envelope.patches;
  if (!Array.isArray(rows) || rows.length !== 1 || !ideaRepairRecord(rows[0])) throw new Error('单卡修复patches结构不完整');
  const patch = structuredClone(rows[0]);
  for (const key of misplaced) {
    const value = envelope[key];
    if (patch[key] === undefined) {patch[key] = value;continue;}
    if (JSON.stringify(patch[key]) === JSON.stringify(value)) continue;
    const outer = ideaRepairRecord(value), inner = ideaRepairRecord(patch[key]);
    if (['dimensionPatch','noveltyProof','namingReplacements'].includes(key) && outer && inner) {
      for (const [field, change] of Object.entries(outer)) {
        if (inner[field] !== undefined && JSON.stringify(inner[field]) !== JSON.stringify(change)) throw new Error(`修订字段${key}.${field}内外冲突，禁止选择一份覆盖`);
        inner[field] = change;
      }
      continue;
    }
    throw new Error(`修订字段${key}内外冲突，禁止选择一份覆盖`);
  }
  // Only placement is normalized. Authorization, dictionary membership and all
  // content gates remain owned by applyOrderedIdeaRepairPatches and the reviewer.
  return [patch];
}

export function applyOrderedIdeaRepairPatches(
  cards: readonly Record<string, unknown>[],
  rawPatches: unknown,
  titleRepairPositions: readonly number[] = [],
  namingRepairPositions: readonly number[] = [],
  storyRepairPositions: readonly number[] = [],
  dimensionRepairOptions: readonly Record<string, readonly string[]>[] = [],
  dimensionOnlyPositions: readonly number[] = [],
  dimensionRepairSelections: readonly Record<string, readonly string[]>[] = [],
  scopeAllocationPlans: readonly (IdeaScopeAllocationPlan | undefined)[] = [],
  metadataOnlyPositions: readonly number[] = [],
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
    if (dimensionOnlyPositions.includes(index) && Object.keys(patch).some(key=>key!=='dimensionPatch')) {
      throw new Error('仅标签问题禁止修改故事或其它字段');
    }
    if(metadataOnlyPositions.includes(index)&&Object.keys(patch).some(key=>!['dimensionPatch','scopeAllocation'].includes(key)))throw Error('仅标签或数量问题禁止修改故事或其它字段');
    const next: Record<string, unknown> = { ...card };
    if(patch.scopeAllocation!==undefined){
      const plan=scopeAllocationPlans[index];
      if(!plan)throw Error('章节分配修复未获得本卡数量合同授权');
      Object.assign(next,applyIdeaScopeAllocation(next,patch.scopeAllocation,plan));
    }
    if (patch.dimensionPatch !== undefined) {
      const dimensions = ideaRepairRecord(patch.dimensionPatch);
      const allowed = dimensionRepairOptions[index] || {};
      if (!dimensions || !Object.keys(dimensions).length) throw new Error('标签修复须提供非空dimensionPatch');
      for (const [field, values] of Object.entries(dimensions)) {
        if (!['storyTone','writingStyle','webNovelGenre','plotTags'].includes(field) || !allowed[field]
          || discoveryDimensionSelectionIssues(values,dimensionRepairSelections[index]?.[field]||[],allowed[field]).length>0) {
          throw new Error('标签修复只能修改服务器点名字段并使用本次字典或作者选择的候选');
        }
        next[field] = [...values as string[]];
      }
    }
    if (namingRepairPositions.includes(index) && patch.namingReplacements !== undefined) {
      Object.assign(next, applyFictionNamingReplacements(next, patch.namingReplacements));
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
