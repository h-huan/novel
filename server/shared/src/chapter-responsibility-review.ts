/**
 * 章节分工审查判据 —— 全平台唯一来源（长篇/短篇共用，平台无关）
 *
 * 为什么必须只有一份：
 * 这套判据此前在 chain.controller.ts 里被抄了三份（章节分工规划、章节分工边界审查、
 * 章节分工语义修复），并且逐字夹带了某一部旧书的题材化例子——看房、签约、报警、取证、
 * 继承权、亲属关系证明、失踪登记、替身、影子、门禁、档案、监控、法律物证。后果有三：
 *   1) 与执行标准自身的「不得把标准之外的内容判为违规」直接冲突，等于存在第二套口径；
 *   2) 与本书题材无关的条目永远无法被满足，审查器每轮都能找到"冲突"，修复闭环不收敛
 *      （实测：末班地铁短篇 12 次 LLM 调用、694 秒、0 产出，最终抛错在
 *      chain.controller.ts 的「章节分工经自适应定向修复后仍违反世界规则或跨章边界」）；
 *   3) 判据有三份副本就会各自漂移，改一处不生效。
 * 因此判据只在本文件维护，其余位置一律引用本模块的导出，不再内联第二份。
 *
 * 维护约定：本文件的任何改动都必须同步把 module-standards.seed.ts 的 SEED_BASELINE_VERSION +1，
 * 让执行标准在重启后立即生效并留审计快照（执行标准内容始终保存最新）。
 */

export interface ChapterResponsibilityCriterion {
  id: string;
  label: string;
  check: string;
}

/**
 * 规则授权边界：能力类判据的唯一表述。
 * 章节分工规划、边界审查、语义修复三处都必须引用这一句，不得各自改写一份。
 */
export const RULE_AUTHORIZATION_BOUNDARY =
  '每个异常/超自然效果必须能在【已确认世界规则】中找到对主体、对象、载体与动作范围的逐字授权；未授权即禁止。规则若只作用于感知、记忆或身份痕迹，不得被扩写为改写现实设备、记录、档案、监控或物证，也不得凭空制造或改写现实记录（显示既存的旧记录可以）。';

export const CHAPTER_RESPONSIBILITY_CRITERIA: readonly ChapterResponsibilityCriterion[] = [
  {
    id: 'CR-1',
    label: '能力授权边界',
    check: `${RULE_AUTHORIZATION_BOUNDARY}一个异常效果只允许执行规则明确赋予的最小动作，不得自行增加规则未授予的能力。`,
  },
  {
    id: 'CR-2',
    label: '触发条件与时点',
    check: '规则规定的触发条件（前置动作、次数、人数、数量、证据组合、代价、时点）必须在该章真实成立；并列条件与精确数量是不可拆分的执行合同：上层写明 A+B+C、两名/三份/第N次等要件时，下层不得缩写成 A、模糊成“有人/若干/多次”，也不得把未明写当作已满足。条件未满足就出现效果，或某信息早于其在故事时间线上发生之前就被知晓，都算冲突。',
  },
  {
    id: 'CR-3',
    label: '跨章边界',
    check: '同一推进任务不得由两章重复承担；后续章才计划完成的揭示、反转或回收不得提前到前章兑现；每章只承担一个不可替代的推进任务。',
  },
  {
    id: 'CR-4',
    label: '设定驱动的重复（豁免）',
    check: '若【已确认故事闭环】或【已确认世界规则】把某机制规定为按设定反复发生，则该机制的重复本身就是执行前提，不算冲突；只有当重复没有带来新的推进、代价、信息或状态变化时，才判为冲突。',
  },
  {
    id: 'CR-5',
    label: '动机、立场与泄密',
    check: '人物改变立场、交出关键材料，或对手泄密，必须在本章或前文有可见触发与既有动机；不得靠一次普通试探、巧合或凭空告知直接获得秘密。',
  },
  {
    id: 'CR-6',
    label: '证据、程序与权利生效',
    check: '涉及法律、行政、所有权、继承、档案校验或系统权限移交的效果，必须写明来源、生效条件、人数/数量、证据组合与生效时点；上层明确的程序要件不得在故事卡、章纲或正文压缩时省略，仅凭身份关系材料不得视为已经生效的权利。',
  },
  {
    id: 'CR-7',
    label: '遗留授权与长期机制',
    check: '已经存在的授权、记录或自动响应必须说明发生时点、持续机制，以及本章为何在此刻生效。',
  },
];

/** 判据的可注入文本（审查/修复提示共用同一份渲染结果）。 */
export const CHAPTER_RESPONSIBILITY_JUDGMENT_RULES: string = CHAPTER_RESPONSIBILITY_CRITERIA
  .map(criterion => `${criterion.id} ${criterion.label}：${criterion.check}`)
  .join('\n');

/**
 * 判定纪律：防止审查器把判据之外的东西当违规。
 * 没有这句时，模型会按一般常识与旧书类比继续产出无法修复的"冲突"。
 */
export const CHAPTER_RESPONSIBILITY_SCOPE_DISCIPLINE =
  '判定纪律：只按上列判据与【已确认世界规则/执行标准】判定。一条任务只要没有与判据或已确认规则直接冲突，就必须判为通过；不得引入判据之外的一般常识风险、题材偏好、对其它作品的类比，也不得要求补充本标准没有要求的设定。';

/** 审查器的输出契约：必须同时给出通过与冲突两种形状，否则模型会被"只演示失败形状"的示例带偏。 */
export const CHAPTER_RESPONSIBILITY_AUDIT_OUTPUT_CONTRACT =
  '只输出JSON对象：全部可在已确认规则内执行时返回 {"consistent":true,"contradictions":[]}；确有冲突时返回 {"consistent":false,"contradictions":[{"chapter":1,"criterion":"CR-1","task":"存在冲突的任务原文","conflict":"违反了哪条判据与哪条已确认规则，以及为何无法执行","ruleEvidence":"被违反的判据编号与【已确认世界规则/执行标准】原文逐字引用","retain":"必须保留的故事目标","fix":"不新增任何能力、且可直接执行的替代任务"}]}。criterion 必须是上列判据编号之一，ruleEvidence 必须是逐字引用；给不出逐字证据的疑虑不得写成冲突。';

/** 修复器的修订边界：与判据同源，避免修复提示里再抄一份走样表述。 */
export const CHAPTER_RESPONSIBILITY_REPAIR_BOUNDARIES =
  '修订边界：每章只承担一个独有推进任务；后续章的反转不得提前；能力和世界规则必须满足明确触发条件；设定规定为反复发生的机制必须保留其重复性，只调整推进、代价或信息增量，不得为了消除重复而删掉设定机制本身；物品、份数、人员与信息来源必须写清。';

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
export function chapterResponsibilityPlanningDirective(): string {
  return [
    "【生成前规则执行编译 · 判据与审查/修复同源】逐项核对所有受世界规则约束的事件、程序与效果：作用主体、作用对象、载体、全部前置条件、人数/数量、证据组合、触发时点和能力范围都必须与已确认世界规则一致；不得因章纲压缩而省略会改变是否生效的必要条件。",
    CHAPTER_RESPONSIBILITY_JUDGMENT_RULES,
    CHAPTER_RESPONSIBILITY_SCOPE_DISCIPLINE,
  ].join("\n");
}

export interface ChapterResponsibilityAuditPromptInput {
  executionStandard: string;
  creativeBrief: string;
  shortStoryCard: unknown;
  worldContinuityDirective: string;
  plan: unknown;
}

/** 边界审查提示词：判据、判定纪律与「通过与冲突两种形状」的输出契约必须完整注入。 */
export function buildChapterResponsibilityAuditPrompt(input: ChapterResponsibilityAuditPromptInput): string {
  return [
    `只审查全书章节分工能否在已确认世界规则内逐章执行，不扩写章纲、不评价文风。${input.executionStandard}`,
    `【已确认题材】${input.creativeBrief}`,
    `【已确认故事闭环】${JSON.stringify(input.shortStoryCard || {})}${input.worldContinuityDirective}`,
    `【待审查章节分工】${JSON.stringify(input.plan)}`,
    "逐章按下列判据检查：",
    CHAPTER_RESPONSIBILITY_JUDGMENT_RULES,
    CHAPTER_RESPONSIBILITY_SCOPE_DISCIPLINE,
    "若某任务冲突，必须返回可直接替换章节责任的 fix，而不是只批评。",
    CHAPTER_RESPONSIBILITY_AUDIT_OUTPUT_CONTRACT,
  ].join("\n");
}

export interface ChapterResponsibilityRepairPromptInput {
  strategyDirective: string;
  issueContracts: unknown;
  currentPlan: unknown;
  creativeBrief: string;
  shortStoryCard: unknown;
  worldContinuityDirective: string;
  requiredChapterCount: number;
}

/** 语义修复提示词：修订边界与判据同源，不再内联第二份走样表述。 */
export function buildChapterResponsibilityRepairPrompt(input: ChapterResponsibilityRepairPromptInput): string {
  return [
    "修订当前全书章节分工，只处理审查明确指出的世界规则、时间因果和跨章边界冲突；保留没有被指出的问题章节、已确认人物、真相、核心反转与结局，不得把冲突任务换一种说法保留。",
    `【本轮修复策略】${input.strategyDirective}`,
    `【可执行修复合同】${JSON.stringify(input.issueContracts)}`,
    "合同中的 forbiddenTask 必须从问题章删除，requiredReplacement 是已经过审查器约束的执行方式，必须落实而非当作参考；retain 只能保留目标，不能保留违规机制。",
    `【当前章节分工】${JSON.stringify(input.currentPlan)}`,
    `【已确认题材】${input.creativeBrief}`,
    `【已确认故事闭环】${JSON.stringify(input.shortStoryCard || {})}${input.worldContinuityDirective}`,
    `必须返回完整的${input.requiredChapterCount}章，且问题章与依赖这些事件的后续章节必须同步修改。`,
    CHAPTER_RESPONSIBILITY_JUDGMENT_RULES,
    CHAPTER_RESPONSIBILITY_SCOPE_DISCIPLINE,
    CHAPTER_RESPONSIBILITY_REPAIR_BOUNDARIES,
    "resolutions必须与本轮合同逐项对应，issueIndex不得遗漏或重复，并分别写明删除了什么、替换成什么、依据哪条判据与已确认规则。",
    `只输出JSON对象：{"resolutions":[{"issueIndex":1,"chapters":[3],"removedMechanism":"已删除的违规机制","replacementMechanism":"实际替代任务","ruleEvidence":"遵守的判据编号与已确认规则逐字证据"}],"chapters":[{"order":1,"title":"标题","function":"功能","responsibility":"本章独有推进任务、揭示与章末结果"}]}。`,
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