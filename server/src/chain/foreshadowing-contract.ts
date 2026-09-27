/**
 * 伏笔字段契约（唯一来源）。
 *
 * 此前同一份契约在三个地方各写一份，互相打架：
 * - 章纲提示词只写“每项包含 riskLevel”，从不说明取值范围，模型无从知道只能是 low/medium/high；
 * - 结果校验却要求 riskLevel 命中枚举，且非“回收”动作必须带回收区间/条件/兑现；
 * - 落库与下游读取用 foreshadowing（单数），提示词却让模型输出 foreshadowings（复数），
 *   字段名对不上就等于把模型产出的伏笔静默丢弃。
 *
 * 三处必须共用本文件；任何一方都不得自行放宽或另立口径。
 */

/**
 * 生成端允许的风险等级（写入 foreshadowings.risk_level）。
 * 手工录入接口另有一档 none/critical（见 continuity.service.ts），那是人工判定域：
 * 生成端不允许“未定级”或“致命”这类无法自动验证的等级。
 */
export const GENERATED_FORESHADOWING_RISK_LEVELS = ['low', 'medium', 'high'] as const;
export type GeneratedForeshadowingRiskLevel = (typeof GENERATED_FORESHADOWING_RISK_LEVELS)[number];

/**
 * 生成端允许的伏笔 scope（写入 foreshadowings.scope）。唯一事实源，三处必须一致：
 * 库表默认值（001_initial.ts `scope TEXT DEFAULT 'chapter'`）、前端筛选与新建下拉
 * （ForeshadowingPage `global | volume | chapter`）、生成端全部写入路径。
 * 注意：continuity 模块的 foreshadowing_threads 表用 full_book/volume/chapter，那是另一张表的另一套口径，不得与本表混用。
 */
export const GENERATED_FORESHADOWING_SCOPES = ['chapter', 'volume', 'global'] as const;
export type GeneratedForeshadowingScope = (typeof GENERATED_FORESHADOWING_SCOPES)[number];

/**
 * 生成端允许的伏笔 type（写入 foreshadowings.type）。
 * 此前桌面端同一份类型表写了两份且互不相等（展示用 8 档 / 新建下拉 5 档），
 * 这里收敛为唯一一份：取两者并集共 9 档，前端直接消费本常量，不再各写各的。
 */
export const GENERATED_FORESHADOWING_TYPES = [
  'hint', 'setup', 'clue', 'object', 'identity', 'relationship', 'mystery', 'promise', 'secret',
] as const;
export type GeneratedForeshadowingType = (typeof GENERATED_FORESHADOWING_TYPES)[number];

/** 章级伏笔动作。只有“回收”允许省略回收区间/条件/兑现效果。 */
export const FORESHADOWING_ACTIONS = ['埋设', '激活', '提醒', '回收'] as const;
export const FORESHADOWING_RECOVERY_ACTION = '回收';

/** 章级伏笔在 outlines.scenes 与下游读取中的唯一字段名（单数）。 */
export const CHAPTER_FORESHADOWING_FIELD = 'foreshadowing';
const CHAPTER_FORESHADOWING_LEGACY_ALIAS = 'foreshadowings';

export const isGeneratedRiskLevel = (value: unknown): boolean =>
  (GENERATED_FORESHADOWING_RISK_LEVELS as readonly string[]).includes(String(value ?? '').trim().toLowerCase());

export const isGeneratedForeshadowingScope = (value: unknown): boolean =>
  (GENERATED_FORESHADOWING_SCOPES as readonly string[]).includes(String(value ?? '').trim().toLowerCase());

export const isGeneratedForeshadowingType = (value: unknown): boolean =>
  (GENERATED_FORESHADOWING_TYPES as readonly string[]).includes(String(value ?? '').trim().toLowerCase());

/**
 * 写入 foreshadowings 三个枚举列（type / scope / risk_level）的唯一序列化入口。
 * 非法值一律抛错并带出原始值，绝不回落到 'hint'/'chapter'/'medium' 之类的默认值——
 * 静默兜底会把「模型没按契约产出」伪装成「数据正常」，下游再也看不到口径偏差。
 * where 说明是哪条写入路径，报错可直接定位。
 */
const requireContractEnum = (value: unknown, allowed: readonly string[], field: string, where: string): string => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!(allowed as readonly string[]).includes(normalized)) {
    throw new Error(
      `${where}：伏笔 ${field} 非法（${JSON.stringify(value ?? null)}），只能是 ${allowed.join('/')}；` +
      '本契约不提供默认值：请让生成端按契约产出，或修正来源数据后再写入。'
    );
  }
  return normalized;
};

export const serializeForeshadowingType = (value: unknown, where: string): string =>
  requireContractEnum(value, GENERATED_FORESHADOWING_TYPES, 'type', where);

export const serializeForeshadowingScope = (value: unknown, where: string): string =>
  requireContractEnum(value, GENERATED_FORESHADOWING_SCOPES, 'scope', where);

export const serializeForeshadowingRiskLevel = (value: unknown, where: string): string =>
  requireContractEnum(value, GENERATED_FORESHADOWING_RISK_LEVELS, 'riskLevel', where);

export const isRecoveryAction = (action: unknown): boolean =>
  String(action ?? '').trim().toLowerCase() === FORESHADOWING_RECOVERY_ACTION;

/**
 * 读取一章的伏笔数组：只做字段名归一（历史提示词用过复数），不做任何值兜底。
 * 返回空数组仍然只代表“本章确实没有伏笔”，不代表“读不到就算了”。
 */
export const readChapterForeshadowing = (chapter: any): any[] => {
  const canonical = chapter?.[CHAPTER_FORESHADOWING_FIELD];
  if (Array.isArray(canonical)) return canonical;
  const legacy = chapter?.[CHAPTER_FORESHADOWING_LEGACY_ALIAS];
  return Array.isArray(legacy) ? legacy : [];
};

/** 返回该条章级伏笔不符合契约的具体原因；合规返回 null。 */
export const describeForeshadowingDefect = (item: any): string | null => {
  if (!item?.content) return '缺 content';
  if (!item?.action) return '缺 action';
  if (!item?.evidenceText) return '缺 evidenceText（可验证的原文证据）';
  if (!isGeneratedRiskLevel(item?.riskLevel)) {
    return `riskLevel 非法（${JSON.stringify(item?.riskLevel ?? null)}），只能是 ${GENERATED_FORESHADOWING_RISK_LEVELS.join('/')}`;
  }
  if (!isGeneratedForeshadowingType(item?.type)) {
    return `type 非法（${JSON.stringify(item?.type ?? null)}），只能是 ${GENERATED_FORESHADOWING_TYPES.join('/')}`;
  }
  if (!isGeneratedForeshadowingScope(item?.scope)) {
    return `scope 非法（${JSON.stringify(item?.scope ?? null)}），只能是 ${GENERATED_FORESHADOWING_SCOPES.join('/')}`;
  }
  if (isRecoveryAction(item.action)) return null;
  const missing: string[] = [];
  if (!item?.recoveryWindowStart) missing.push('recoveryWindowStart');
  if (!item?.recoveryWindowEnd) missing.push('recoveryWindowEnd');
  if (!item?.recoveryCondition) missing.push('recoveryCondition');
  if (!item?.payoffDescription) missing.push('payoffDescription');
  return missing.length > 0 ? `非回收动作缺 ${missing.join('/')}` : null;
};

/** 返回该条跨卷伏笔不符合契约的具体原因；合规返回 null。 */
export const describeGlobalForeshadowingDefect = (item: any): string | null => {
  const missing: string[] = [];
  if (!item?.content) missing.push('content');
  if (!item?.setupChapter) missing.push('setupChapter');
  if (!item?.recoveryWindowStart) missing.push('recoveryWindowStart');
  if (!item?.recoveryWindowEnd) missing.push('recoveryWindowEnd');
  if (!item?.evidenceText) missing.push('evidenceText');
  if (!item?.recoveryCondition) missing.push('recoveryCondition');
  if (!item?.payoffDescription) missing.push('payoffDescription');
  if (missing.length > 0) return `缺 ${missing.join('/')}`;
  if (!isGeneratedRiskLevel(item?.riskLevel)) {
    return `riskLevel 非法（${JSON.stringify(item?.riskLevel ?? null)}），只能是 ${GENERATED_FORESHADOWING_RISK_LEVELS.join('/')}`;
  }
  if (!isGeneratedForeshadowingType(item?.type)) {
    return `type 非法（${JSON.stringify(item?.type ?? null)}），只能是 ${GENERATED_FORESHADOWING_TYPES.join('/')}`;
  }
  if (!isGeneratedForeshadowingScope(item?.scope) || String(item?.scope ?? '').trim().toLowerCase() === 'chapter') {
    return `scope 非法（${JSON.stringify(item?.scope ?? null)}）——跨卷伏笔只能是 volume/global`;
  }
  return null;
};

const ACTIONS_TEXT = FORESHADOWING_ACTIONS.map(action => `“${action}”`).join('、');
const RISK_TEXT = GENERATED_FORESHADOWING_RISK_LEVELS.join('、');
const TYPE_TEXT = GENERATED_FORESHADOWING_TYPES.join('、');
const SCOPE_TEXT = GENERATED_FORESHADOWING_SCOPES.join('、');

/** 章级伏笔契约原文：直接拼进章纲提示词，与 describeForeshadowingDefect 逐条对齐。 */
export const CHAPTER_FORESHADOWING_CONTRACT = [
  `伏笔字段 ${CHAPTER_FORESHADOWING_FIELD}（只在本章确有动作时填写，否则必须返回空数组 []）：`,
  `- 每项必填 content（伏笔本体：具体到物件、话语偏差、动作、地点或组织线索）、action（只能取 ${ACTIONS_TEXT} 之一）、evidenceText（本章可验证的原文证据）、riskLevel（只能取 ${RISK_TEXT} 之一，小写英文，不得写“高/中/低”等中文等级）、type（只能取 ${TYPE_TEXT} 之一）、scope（只能取 ${SCOPE_TEXT} 之一：本章内部的小场景伏笔用 chapter，跨多章但不出卷用 volume，贯穿全书用 global）；`,
  `- action 不是“回收”的每一项，必须同时给出 recoveryWindowStart、recoveryWindowEnd（回收窗口起止章号，整数）、recoveryCondition（满足什么条件才回收）、payoffDescription（回收时兑现什么效果）；这四项缺任意一项即为不合格，此时不要把该条写进 ${CHAPTER_FORESHADOWING_FIELD}，宁可为空数组；`,
  '- recoveryChapter（预期回收章号，整数）可选，有明确规划时填写。',
].join('\n');

/** 跨卷伏笔契约原文：与 describeGlobalForeshadowingDefect 逐条对齐。 */
export const GLOBAL_FORESHADOWING_CONTRACT = [
  `跨卷伏笔每项必须同时给出 content、setupChapter（埋设章号）、recoveryWindowStart、recoveryWindowEnd、evidenceText、riskLevel（只能取 ${RISK_TEXT} 之一，小写英文）、type（只能取 ${TYPE_TEXT} 之一）、scope（只能取 global/volume 之一，不得写 chapter）、recoveryCondition、payoffDescription；`,
  '缺任意一项即为不合格——若无法一次给全，请改成返回空数组，不要提交半条线索。',
].join('\n');
