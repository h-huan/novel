/** Chapter criteria are rendered from ARCH-005; no parallel rule definitions. */
import { getSystemWorkflowRule, OUTLINE_STATE_CONTINUITY_POLICY, STORY_CAUSAL_REVIEW_POLICY } from './system-workflow-rules.registry';

const responsibilityRule = getSystemWorkflowRule('ARCH-005')!;

export interface ChapterResponsibilityCriterion {
  id: string;
  label: string;
  check: string;
}

/**
 * 规则授权边界：能力类判据的唯一表述。
 * 章节分工规划、边界审查、语义修复三处都必须引用这一句，不得各自改写一份。
 */
export const CHAPTER_RESPONSIBILITY_CRITERIA: readonly ChapterResponsibilityCriterion[] =
  responsibilityRule.clauses!.map(clause => ({ id: clause.id, label: clause.label, check: clause.text }));

export const RULE_AUTHORIZATION_BOUNDARY = CHAPTER_RESPONSIBILITY_CRITERIA.find(clause => clause.id === 'CR-1')!.check;

/** 判据的可注入文本（审查/修复提示共用同一份渲染结果）。 */
export const CHAPTER_RESPONSIBILITY_JUDGMENT_RULES: string = CHAPTER_RESPONSIBILITY_CRITERIA
  .map(criterion => `${criterion.id} ${criterion.label}：${criterion.check}`)
  .join('\n');

/**
 * 判定纪律：防止审查器把判据之外的东西当违规。
 * 没有这句时，模型会按一般常识与旧书类比继续产出无法修复的"冲突"。
 */
export const CHAPTER_RESPONSIBILITY_SCOPE_DISCIPLINE = responsibilityRule.contracts!.scopeDiscipline;

/** 审查器的输出契约：必须同时给出通过与冲突两种形状，否则模型会被"只演示失败形状"的示例带偏。 */
/** The short/long creation entry/exit review uses the same verdict as other
 * chapter checks, but MUST include conditionChecks even when consistent=true.
 * This is a transport contract, not a weaker semantic quality gate. */
/** The two real callers use different citation transports. Render the
 * correct ONE shape at the shared rule source; mixing quote examples into
 * ID-address prompts made the model omit required chapter checks. The verdict,
 * independent causal Gate, and evidence requirements stay unchanged. */
export function chapterResponsibilityAuditOutputContract(
 entryExitContract=false,evidenceMode:'quotes'|'anchors'='quotes',
):string{
 const condition=(status:'supported'|'gap')=>!entryExitContract?{}:{
  conditionChecks:[evidenceMode==='anchors'?{
   chapter:1,taskAnchorId:'chapter:c1:task',status,
   bridgeAnchorIds:status==='gap'?[]:['chapter:c1:task'],
   reason:'逐章核对实际取得的行动、条件时效及完整出口结果',
  }:{
   chapter:1,taskEvidence:'本章responsibility连续逐字原文',
   exitStateEvidence:'本章exitState连续逐字原文',status,
   bridgeSource:'body',
   bridgeEvidence:status==='gap'?'':'本章或前章responsibility中实际完成的动作逐字原文',
   reason:'逐章核对实际取得的行动、条件时效及完整出口结果',
  }]
 };
 const conflict=evidenceMode==='anchors'&&entryExitContract?{
  chapter:1,criterion:'CR-1',taskAnchorId:'chapter:c1:task',
  conflict:'已确认规则与实际行动之间的具体冲突',
  ruleAnchorIds:['project_context:v1'],retain:'必须保留的目标',
  fix:'沿确认规则可执行的替代任务',
 }:{
  chapter:1,criterion:'CR-1',task:'发生冲突的本章责任原文',
  conflict:'已确认规则与实际行动之间的具体冲突',
  ruleEvidence:'已确认世界规则或执行标准中的连续逐字原文',
  retain:'必须保留的目标',fix:'沿确认规则可执行的替代任务',
 };
 return '只输出JSON对象：无真实冲突时返回 '
  +JSON.stringify({consistent:true,contradictions:[],...condition('supported')})
  +'；确有冲突时返回 '+JSON.stringify({consistent:false,contradictions:[conflict],...condition('gap')})
  +'。以上仅为字段结构示例，不是对任一章节的事实判定；不得复制示例引用地址或假定全部章节supported。'
  +' criterion必须是已有判据编号，冲突需有真实冻结来源的逐字双边证据。'
  +(entryExitContract?
   ' conditionChecks必须每章恰好一项，包含所有章节，章号准确且不重复；真实状态按supported、gap、not_required选择。'
   +' 普通自主行动且不依赖外部资格时用not_required并说明，不能为凑supported虚构已取得条件。'
   +' supported必须引用当章或前章实际执行的取得动作，不能只引用prerequisites名称、timeline、exitState结果或世界规则；gap必须对应真实contradictions，不得擅自放行。'
   +(evidenceMode==='anchors'?
    ' conditionChecks只返回taskAnchorId、bridgeAnchorIds及状态理由，证据编号须从本次服务端目录选择，不返回taskEvidence/bridgeEvidence。'
    :' conditionChecks只返回taskEvidence、exitStateEvidence、bridgeSource、bridgeEvidence及状态理由，证据必须是本次章节规划中的连续逐字原文，不返回虚构地址。')
   :'');
}
export const CHAPTER_RESPONSIBILITY_AUDIT_OUTPUT_CONTRACT=chapterResponsibilityAuditOutputContract();

/** 修复器的修订边界：与判据同源，避免修复提示里再抄一份走样表述。 */
export const CHAPTER_RESPONSIBILITY_REPAIR_BOUNDARIES = responsibilityRule.contracts!.repairBoundary;

/**
 * 判据编号识别：审查条目必须引用本文件的判据编号，否则不算冲突。
 * 提示词里说「给不出逐字证据的疑虑不得写成冲突」是一次；这里用代码再兜一次，
 * 避免模型换一种说法就把判据之外的东西塞回冲突列表。
 */
export const CHAPTER_RESPONSIBILITY_CRITERION_ID_PATTERN = /CR-?\s*([1-7])\b/;

export const isChapterResponsibilityCriterionId = (value: unknown): boolean =>
  CHAPTER_RESPONSIBILITY_CRITERION_ID_PATTERN.test(String(value ?? ""));

export interface ChapterResponsibilityConflict {
  chapter: number;
  criterion: string;
  task: string;
  conflict: string;
  ruleEvidence: string;
  retain: string;
  fix: string;
}

/** 契约守卫：章节、判据编号、冲突描述、逐字证据与可执行修法齐全，才算一条真冲突。 */
export const isEvidencedChapterResponsibilityConflict = (value: unknown): value is ChapterResponsibilityConflict => {
  const item = value as Partial<ChapterResponsibilityConflict> | null | undefined;
  if (!item || typeof item !== "object") return false;
  const chapter = Number(item.chapter);
  return Number.isInteger(chapter) && chapter > 0
    && isChapterResponsibilityCriterionId(item.criterion)
    && String(item.task || "").trim().length > 0
    && String(item.conflict || "").trim().length > 0
    && String(item.ruleEvidence || "").trim().length > 0
    && String(item.retain || (item as any).preservedGoal || "").trim().length > 0
    && String(item.fix || "").trim().length > 0;
};

/**
 * 章节分工规划指令（生成前能力边界编译）。
 * 章节规划、章数精确重规划、边界审查、语义修复四处必须注入同一份判据，
 * 不得再各自内联一份——三份副本正是「改一处不生效、且各自夹带旧书题材」的来源。
 */
/** Only project registry-owned instruction text, never user story content. */
function responsibilityJudgmentRules(includeSharedPolicies: boolean): string {
  return includeSharedPolicies ? CHAPTER_RESPONSIBILITY_JUDGMENT_RULES
    : CHAPTER_RESPONSIBILITY_JUDGMENT_RULES.replace(OUTLINE_STATE_CONTINUITY_POLICY, '按已注入CTX-005、CTX-008执行累计状态与时间核对。');
}

export function chapterResponsibilityPlanningDirective(includeSharedPolicies = true): string {
  return [
    "【生成前规则执行编译 · 判据与审查/修复同源】逐项核对所有受世界规则约束的事件、程序与效果：作用主体、作用对象、载体、全部前置条件、人数/数量、证据组合、触发时点和能力范围都必须与已确认世界规则一致；不得因章纲压缩而省略会改变是否生效的必要条件。",
    responsibilityJudgmentRules(includeSharedPolicies),
    "【跨章已完成结果不得重复兑现】规划章节唯一责任时，为每章分别明确此前尚未完成的结果和本章实际新增的行动。前章已经通过联名、审批、签字或其它决定完成的保全、留任、撤销、救助，后章仅持有同一张纸、回忆旧事或重复强调既定承诺，不能再次声称完成同一结果；后章须承接真实尚未发生的经营、付出代价、关系转变、剩余危机或新的有效行动。每章的responsibility必须能被该章content与characterActions自己的实际行动独立证明，而不是借前章的结果自证。不要制造多余反转或额外条件；保持已确认故事结果及合法重复发生的日常机制。",
    CHAPTER_RESPONSIBILITY_SCOPE_DISCIPLINE,
  ].join("\n");
}

/** Shared output contract for short and long chapter planning. */
export const CHAPTER_RESPONSIBILITY_PLAN_EXAMPLE = { chapterResponsibilities: [{chapter:1,title:'原章节标题',function:'章节功能',responsibility:'本章实际行动与唯一推进任务',prerequisites:['由已确认资源、规则和先行动作取得且本章仍有效的条件；普通自主动作允许空数组'],timeline:'继承既定期限的相对时点，不补精确时长',exitState:'本章行动实际产生的状态，未完成目标明确保留'}] };

/** The same entry/exit contract must survive analysis -> volume -> detail. */
export function describeChapterResponsibilityPlan(value: unknown, chapterLimit?: unknown): string[] {
  const plan = (value as any)?.chapterResponsibilities;
  if (!Array.isArray(plan) || !plan.length) return ['缺少本批次章节职责合同，不能跳过上游规划直接展开章纲'];
  const limit = Number(chapterLimit);
  const issues: string[] = [];
  if (Number.isInteger(limit) && limit > 0 && plan.length > limit) issues.push('章节职责数量超过本批章节上限');
  plan.forEach((chapter: any, index: number) => {
    if (chapter?.chapter !== index + 1) issues.push(`第${index + 1}项章节职责章号不连续`);
    for (const field of ['title', 'function', 'responsibility', 'timeline', 'exitState']) {
      if (typeof chapter?.[field] !== 'string' || !chapter[field].trim()) issues.push(`第${index + 1}章职责缺少${field}`);
    }
    if (!Array.isArray(chapter?.prerequisites) || chapter.prerequisites.some((item: unknown) => typeof item !== 'string' || !item.trim())) {
      issues.push(`第${index + 1}章进入条件无效`);
    }
  });
  return issues;
}

export interface ChapterResponsibilityAuditPromptInput {
  executionStandard: string;
  creativeBrief: string;
  shortStoryCard: unknown;
  worldContinuityDirective: string;
  includeSharedPolicies?: boolean;
  plan: unknown;
  entryExitContract?: boolean;
  evidenceMode?: 'quotes'|'anchors';
}

/** 边界审查提示词：判据、判定纪律与「通过与冲突两种形状」的输出契约必须完整注入。 */
export function buildChapterResponsibilityAuditPrompt(input: ChapterResponsibilityAuditPromptInput): string {
  return [
    `只审查全书章节分工能否在已确认世界规则内逐章执行，不扩写章纲、不评价文风。${input.executionStandard}`,
    `【已确认题材】${input.creativeBrief}`,
    `【已确认故事闭环】${JSON.stringify(input.shortStoryCard || {})}${input.worldContinuityDirective}`,
    `【待审查章节分工】${JSON.stringify(input.plan)}`,
    input.entryExitContract ? '本次为进入/退出合同审查。按chapterResponsibilities逐章判断整个exitState是否真能由实际行动、已取得且仍有效的条件产生。prerequisites只是待满足的条件名称，不能充当取得证明；普通自主行动无外部许可依赖时用not_required并说明。涉及他人决定、权限、移交和责任归属必须有原计划的实际桥接；缺少则报告gap及有依据的具体冲突，不得靠结果自证。consistent=true也必须逐章输出conditionChecks。字段JSON形状以本次末尾唯一的协议示例为准，不混用逐字引用与编号引用。' : '',
    "逐章按下列判据检查：",
    responsibilityJudgmentRules(input.includeSharedPolicies !== false),
    CHAPTER_RESPONSIBILITY_SCOPE_DISCIPLINE,
    "若某任务冲突，必须返回可直接替换章节责任的 fix，而不是只批评。",
    chapterResponsibilityAuditOutputContract(input.entryExitContract===true,input.evidenceMode||'quotes'),
  ].join("\n");
}

export interface ChapterResponsibilityRepairPromptInput {
  strategyDirective: string;
  issueContracts: unknown;
  currentPlan: unknown;
  creativeBrief: string;
  shortStoryCard: unknown;
  worldContinuityDirective: string;
  includeSharedPolicies?: boolean;
  requiredChapterCount: number;
  entryExitContract?: boolean;
}

/** 语义修复提示词：修订边界与判据同源，不再内联第二份走样表述。 */
export function buildChapterResponsibilityRepairPrompt(input: ChapterResponsibilityRepairPromptInput): string {
  return [
    "修订当前全书章节分工，只处理审查明确指出的世界规则、时间因果和跨章边界冲突；保留没有被指出的问题章节、已确认人物、真相、核心反转与结局，不得把冲突任务换一种说法保留。",
    `【本轮修复策略】${input.strategyDirective}`,
    `【可执行修复合同】${JSON.stringify(input.issueContracts)}`,
    "合同中的 forbiddenTask 必须从问题章删除，requiredReplacement 是已经过审查器约束的执行方式，必须落实而非当作参考；retain 只能保留目标，不能保留违规机制。requiredReplacement是待实现的约束，不是其机制已经成立的证明。修订后沿受影响行动到最终exitState核对整条必要条件链，不能只补被点名的一步就重复结论；普通自主行动不额外追加程序。必要条件落实为人物行动、可用资源与具体结果，不把自检过程写成正文解释段。",
    `【当前章节分工】${JSON.stringify(input.currentPlan)}`,
    `【已确认题材】${input.creativeBrief}`,
    `【已确认故事闭环】${JSON.stringify(input.shortStoryCard || {})}${input.worldContinuityDirective}`,
    `必须返回完整的${input.requiredChapterCount}章，且问题章与依赖这些事件的后续章节必须同步修改。`,
    responsibilityJudgmentRules(input.includeSharedPolicies !== false),
    CHAPTER_RESPONSIBILITY_SCOPE_DISCIPLINE,
    CHAPTER_RESPONSIBILITY_REPAIR_BOUNDARIES,
    input.entryExitContract ? STORY_CAUSAL_REVIEW_POLICY : '',
    "resolutions必须与本轮合同逐项对应，issueIndex不得遗漏或重复，并分别写明删除了什么、替换成什么、依据哪条判据与已确认规则。failureReason是原机制不能成立的已举证原因，替代路径必须消除这一原因，不能只换执行者或同义措辞。",
    input.entryExitContract
      ? `只输出JSON对象：{"resolutions":[{"issueIndex":1,"chapters":[3],"removedMechanism":"已删除机制","replacementMechanism":"实际替代任务","ruleEvidence":"遵守的判据与来源"}],"chapterResponsibilities":[{"chapter":1,"title":"原章节标题","function":"原章节功能","responsibility":"任务","prerequisites":["必要条件的具体来源、取得途径及在本章仍有效的依据"],"timeline":"累计期限与相对时点","exitState":"实际出口状态"}]}。被取消或过期的条件不得只重复名称当作仍可用；优先由已有能力且有可见动机的人完成必要触发，不给人物新增无来源权限。`
      : `只输出JSON对象：{"resolutions":[{"issueIndex":1,"chapters":[3],"removedMechanism":"已删除的违规机制","replacementMechanism":"实际替代任务","ruleEvidence":"遵守的判据编号与已确认规则逐字证据"}],"chapters":[{"order":1,"title":"标题","function":"功能","responsibility":"本章独有推进任务、揭示与章末结果"}]}。`,
  ].join("\n");
}

/** 按判据编号取判据原文，供其它提示词引用同一条判据，不再各自复述一份。 */
export function chapterResponsibilityCriteriaText(ids: readonly string[]): string {
  return ids
    .map(id => CHAPTER_RESPONSIBILITY_CRITERIA.find(criterion => criterion.id === id))
    .filter((criterion): criterion is ChapterResponsibilityCriterion => Boolean(criterion))
    .map(criterion => `${criterion.id} ${criterion.label}：${criterion.check}`)
    .join("\n");
}

/**
 * 短篇故事卡的能力边界编译 —— 故事卡生成、事实审查、事实修复三处必须注入同一份，不得各自复述。
 *
 * 为什么必须共用：故事卡由本平台生成，又由本平台的审查器按判据判违规。此前生成侧不注入判据、
 * 只有审查侧单方面持有（且审查提示里还内联了第四份走样的复述），产物必然反复撞墙——
 * 实测 2026-09-23 末班地铁短篇：5 次 LLM 调用、309 秒、0 产出，最终抛错在
 * chain.controller.ts 的「短篇故事卡与已确认题材冲突：能力触发违规…」。
 * 判据原文只维护在 CHAPTER_RESPONSIBILITY_CRITERIA，本函数只做渲染。
 */
export function storyCardAuthorizationDirective(): string {
  return [
    "【生成前规则执行编译 · 短篇故事卡 · 与事实审查/修复同源】故事卡不是世界规则的摘要，而是后续章纲的可执行合同。逐场景核对所有会产生状态变化、程序效果、证据效力、权限变化或异常效果的机制，明确主体、对象、载体、全部前置条件、人数/数量、证据组合、触发时点、代价与结果；只有【已确认世界规则】授权且条件完整满足的结果才能进入 outcome。",
    "【无损继承】上层规则中的 AND 条件、枚举项和精确数量不得被语义压缩：A+B+C 不能改成 A；“两名/三份/第N次”不能写成“有人/若干/多次”；“须/必须/仅当/若…则…”中的必要条件不得省略。若场景暂时只具备部分条件，只能写申请、调查、补证、等待或其它尚未生效的动作，不能提前写最终程序/权限/规则效果已经成立。",
    "【审查与修复闭环】审查只按同一判据指出真实冲突或缺失的必要条件；每条问题必须给出 criterion、scene、cardEvidence、ruleEvidence、conflict、fix。用于修复时，fix 是强制合同，必须逐条落实，不得用同义缩写再次丢掉人数、证据项、时点或必要动作；不得为了修一处改掉已确认人物、真相、核心反转、结局或其它已通过场景的职责。",
    chapterResponsibilityCriteriaText(['CR-1', 'CR-2', 'CR-4', 'CR-6']),
    CHAPTER_RESPONSIBILITY_SCOPE_DISCIPLINE,
  ].join("\n");
}
