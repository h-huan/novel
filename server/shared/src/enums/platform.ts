/**
 * 平台注册表 —— 全系统唯一一份平台清单（id + 显示名 + 投稿体系归属）。
 *
 * 为什么必须只有一份：此前平台清单散在四处且互不一致——
 *   server/shared/src/enums/platform-style.ts  7 个（缺 qimao/xiaohongshu/custom）
 *   server/src/chain/platform-benchmarks.ts   10 个
 *   server/src/modules/platform-analytics/labels.ts  12 个（混入 manual/未标注 这类非平台值）
 *   desktop/src/renderer/lib/executionStandards.ts   9 个
 * 同一个平台出现「番茄」「番茄小说」两种写法，用户在卡片上看到的标准和选项对不上，
 * 也让「按平台分类执行」无从谈起。这里收敛成唯一一份，其余三处改为从这里派生。
 *
 * 判据约定（与 creative-constitution.isPlatformStandardPresent 同源）：
 *   - generic = 没选平台，等价于「未设置」，不可被选中；
 *   - custom  = 用户自定义平台，平台标准只能来自用户填写的说明，说明为空即未执行标准；
 *   - 其余    = 真实投放平台，各自有独立的投稿分类体系。
 */

import { TargetPlatform, type TargetPlatform as TargetPlatformId } from './project';

export interface PlatformDefinition {
  /** 平台 id，与 shared TargetPlatform 枚举逐一对应 */
  id: TargetPlatformId;
  /** 展示名：看板、项目卡片、执行标准页、prompt 一律从这里取，禁止各处自建 label 表 */
  label: string;
  /** 是否可在「执行标准」里被用户选中（generic=没选平台，不构成可选项） */
  selectable: boolean;
  /** 该平台是否有独立的投稿分类体系（决定「按平台分类执行」走平台树还是全局树） */
  hasOwnCategoryTree: boolean;
  /** 平台标准必须由用户填写的说明提供（仅 custom）；说明为空 = 未执行标准，必须阻断 */
  requiresUserDirective?: boolean;
}

export const PLATFORM_REGISTRY: readonly PlatformDefinition[] = [
  { id: TargetPlatform.ZHIHU, label: '知乎盐选', selectable: true, hasOwnCategoryTree: true },
  { id: TargetPlatform.FANQIE, label: '番茄小说', selectable: true, hasOwnCategoryTree: true },
  { id: TargetPlatform.QIDIAN, label: '起点中文网', selectable: true, hasOwnCategoryTree: true },
  { id: TargetPlatform.DOUYIN, label: '抖音故事', selectable: true, hasOwnCategoryTree: true },
  { id: TargetPlatform.JINJIANG, label: '晋江文学城', selectable: true, hasOwnCategoryTree: true },
  { id: TargetPlatform.QIMAO, label: '七猫小说', selectable: true, hasOwnCategoryTree: true },
  { id: TargetPlatform.XIAOHONGSHU, label: '小红书故事', selectable: true, hasOwnCategoryTree: true },
  // 这里曾把「规则怪谈」题材列为投放平台，后果是选题材时误用一套虚构的投稿分类和平台质量基准。
  // 保留旧 id 以读取历史项目，但不再允许把它作为新项目的目标平台。
  { id: TargetPlatform.RULES_HORROR, label: '规则怪谈（旧题材值）', selectable: false, hasOwnCategoryTree: false },
  { id: TargetPlatform.CUSTOM, label: '自定义平台', selectable: true, hasOwnCategoryTree: false, requiresUserDirective: true },
  { id: TargetPlatform.GENERIC, label: '通用网文（未设置）', selectable: false, hasOwnCategoryTree: false },
] as const;

/** 可被用户选中的平台（不含 generic —— 通用等于没选平台）。 */
export const SELECTABLE_PLATFORMS: readonly PlatformDefinition[] =
  PLATFORM_REGISTRY.filter(item => item.selectable);

/**
 * 前端下拉选项直接从注册表派生。这里曾有过第二份 PLATFORM_OPTIONS，
 * 后果是前端平台名称与后端执行标准漂移，用户选到的值无法按同一平台验收。
 */
export const PLATFORM_OPTIONS: ReadonlyArray<{ value: TargetPlatformId; label: string }> =
  SELECTABLE_PLATFORMS.map(({ id, label }) => ({ value: id, label }));

/**
 * 平台 id 清单（含 generic）—— 所有 DTO 校验的唯一来源。
 *
 * 为什么必须留这一份：此前 create-project / update-project / create-idea-draft / convert-to-project
 * 四个 DTO 各自手写同一串 ['zhihu','fanqie','qimao','qidian','douyin','xiaohongshu','jinjiang',
 * 'rules_horror','custom','generic']，而 AdaptPlatformDto 又抄成只有 5 个平台，
 * 于是 jinjiang / qimao / xiaohongshu 在类型层就点不通（前端能选、后端收不到）。
 * 这与「平台清单散在四处」是同一类坏味道，一律从这里派生，禁止再手写副本。
 */
export const PLATFORM_IDS: readonly TargetPlatformId[] =
  PLATFORM_REGISTRY.map(item => item.id);

const BY_ID: Record<string, PlatformDefinition> = Object.fromEntries(
  PLATFORM_REGISTRY.map(item => [item.id, item]),
);

/**
 * 取平台定义。未登记的 id（历史脏数据）返回 undefined —— 调用方必须显式处理，
 * 不得回退成「通用网文」冒充该平台的标准。
 */
export function platformDefinition(id: string | null | undefined): PlatformDefinition | undefined {
  return BY_ID[String(id ?? '').trim()];
}

/** 平台维度的唯一有效性判据；前端预检、服务端创建和生成共用。 */
export type PlatformStandardProblem = 'unset' | 'generic' | 'custom_note_missing' | 'unsupported' | null;

export function platformStandardProblem(platformKey: string | null | undefined, customPlatformNote?: string | null): PlatformStandardProblem {
  const key = String(platformKey ?? '').trim();
  if (!key) return 'unset';
  if (key === TargetPlatform.GENERIC) return 'generic';
  const platform = platformDefinition(key);
  if (!platform || !platform.selectable) return 'unsupported';
  if (platform.requiresUserDirective && !String(customPlatformNote ?? '').trim()) return 'custom_note_missing';
  return null;
}

/**
 * 平台显示名的唯一取法。未登记的 id 原样返回（例如历史数据里的 manual），
 * 绝不伪造出一个不存在的平台名。
 */
export function platformDisplayName(id: string | null | undefined): string {
  const raw = String(id ?? '').trim();
  if (!raw) return '';
  const hit = BY_ID[raw];
  return hit ? hit.label : raw;
}

/** 该平台是否有独立投稿分类体系。未登记 id 一律 false（走全局分类树 + 暴露来源）。 */
export function platformHasOwnCategoryTree(id: string | null | undefined): boolean {
  return platformDefinition(id)?.hasOwnCategoryTree === true;
}
