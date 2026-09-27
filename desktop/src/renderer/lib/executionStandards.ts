/**
 * 执行标准的唯一前端来源。
 *
 * 平台 / 分类 / 基调 / 文风 / 流派 / 视角 是【执行前提】：创建项目时选定这六项，
 * 框架层（世界观、人物、组织、地点、大纲、伏笔）与正文层都必须按它们执行。
 *
 * 为什么必须只有一份：判据一旦分叉，就会出现「前端放行、后端阻断」或者反过来，
 * 用户就会在「我已经填了」和「未执行标准」之间来回打转。这里与后端
 * creative-constitution.ts 的 missingConstitutionStandards、platform-benchmarks.ts 的
 * PLATFORMS 保持同一口径（平台 id、平台显示名、判据三处一致）。
 *
 * 空值 = 这项标准不存在，不是「不适用」：不填默认值、不用平台推荐替代、不静默跳过。
 * 因此本文件不导出任何「平台列表」的副本：页面一律从这里取 PLATFORM_OPTIONS / platformLabel。
 */

import { platformDisplayName, platformCategoryOptionId, platformCategoryChannels, platformCreationFieldNames, platformSubmissionDimensions, platformCategoryDimensionBinding, resolveSubmissionCategory, platformStandardProblem as sharedPlatformStandardProblem, NARRATIVE_POV_SEED_LABELS, categoryWordScaleStanding, categoryWordScaleBlocked, categoryWordScaleLine } from '@novel/shared';
import type { CategoryWordScaleStatus, PlatformCategoryMetric, ResolvedPlatformCategory } from '@novel/shared';
export { PLATFORM_OPTIONS } from '@novel/shared';

export const CATEGORY_SEPARATOR = '/';

/** 通用平台不构成执行标准：generic 等价于「没选平台」，会被判未设置。 */
export const GENERIC_PLATFORM_VALUE = 'generic';

/** 自定义平台：系统没有它的节奏/回报/读者基准，标准只能来自用户说明，说明为空即未执行标准。 */
export const CUSTOM_PLATFORM_VALUE = 'custom';

/**
 * 平台清单（唯一一份视图）——直接从 shared 的平台注册表派生，本文件不再手写第二份。
 *
 * 为什么必须派生：手写这份清单时它同时充当三件事（下拉选项、显示名、与后端对齐的 id），
 * 任何一处改动都会漏掉另外两处——这里曾写成「番茄短篇」「起点脑洞」这种后端不认识的显示名，
 * 用户选中的平台和卡片上显示的标准就对不上。id / 显示名 / 顺序一律以 PLATFORM_REGISTRY 为准。
 * 不含 generic —— 「通用」不是可选平台，它是「没选平台」，出现在选项里只会诱导用户选到一个会被阻断的值。
 */
// 这里曾有过第二份 PLATFORM_OPTIONS 和 generic 显示名表，结果是卡片与注册表名称漂移。
// 选项直接重导出 shared，历史 generic 也由 shared 的 platformDisplayName 统一显示。

/**
 * 平台显示名的唯一取法。任何页面都不许再自建 label 表，否则同一个平台会出现
 * 「番茄」「番茄小说」两种写法，用户无法确认卡片上的标准和选项是不是同一件事。
 */
export function platformLabel(value: string | null | undefined): string {
  return platformDisplayName(value);
}

/**
 * 字典缺失时的兜底：视角是结构性执行标准，控件必须始终可用（后端 seedDefaults 也会补齐字典）。
 *
 * 这份兜底不是「另一套标准」，它就是字典种子的同一份：直接从 @novel/shared 的
 * NARRATIVE_POV_SEED_LABELS 派生。历史写法在这里内联过一份 4 项数组，与后端种子、
 * DiscoveryWizardPage 的下拉兜底各存一份 —— 改了一处，另外两处静默分叉。
 */
export const POV_FALLBACK: string[] = [...NARRATIVE_POV_SEED_LABELS];

/**
 * 目标读者（投稿频道）候选 —— 从所选平台的投稿分类树派生，不再是手写清单。
 *
 * 独立判断：targetAudience 不是第六个执行标准维度（六维是 平台/分类/基调/文风/流派/视角），
 * 它的唯一职责是分类归位的频道提示：番茄有 3 个分类名（科幻末世 / 悬疑脑洞 / 游戏体育）
 * 同时在男频与女频，只有它能解出用户点的是哪一个（见 platformCategoryOptionId 与
 * resolvePlatformCategory 的 channelHint）。因此候选只能来自平台树。
 *
 * 旧实现写死 ['男频','女频','通用读者','青少年']：其中「通用读者」「青少年」在平台侧根本不是频道，
 * 而起点/晋江等平台的 纯爱/百合/无CP/女性向/言情/衍生 被整批漏掉 —— 用户选了平台不存在的频道，
 * 归位必然失败，界面却显示成已填好。未建模分类树的平台返回空数组（该平台没有频道概念）。
 */
export function audienceChannelOptions(platform: string | null | undefined): string[] {
  return platformCategoryChannels(platform);
}

export interface ExecutionStandardsValue {
  targetPlatform: string;
  /** 自定义平台说明：targetPlatform === custom 时它就是「平台」这一维的执行值本身。 */
  customPlatformNote: string;
  /**
   * 本书目标总字数（正文总字数，不是单章）。
   *
   * 它是「分类」维的平台侧判据输入：该平台分类的头部实测体量区间来自 shared 的
   * PLATFORM_CATEGORY_METRICS，验收链的确定性判据 platform.category_word_scale 会逐值比对 ——
   * 落区间外或根本未设定，都直接判该维未执行。用字符串保存：空串 = 未设定，
   * 绝不用 0 或平台推荐兜底（0 会被后端的 @Min(1) 当成非法值拒收，那是另一种假装填了）。
   */
  targetWords: string;
  /**
   * 成稿单元（long_novel / short_story），来自项目类型。
   *
   * 它不是第七个维度，而是「分类」维体量判据的适用前提：平台的头部实测体量是按成稿单元采集的
   * （番茄那份来自连载长篇榜单）。不知道本项目是什么单元，就无从判断这份实测适不适用 ——
   * 空值按「未知即从严」处理（继续用该口径判定），所以每个入口都必须把它带上，
   * 否则合规短篇会被当成长篇对照区间，前端先替后端把用户拦下。
   */
  projectType: string;
  category: string;
  storyTone: string[];
  writingStyle: string[];
  webNovelGenre: string[];
  submissionTags: string[];
  plotTags: string[];
  genreFitNote: string;
  pov: string;
  targetAudience: string;
  /**
   * 分类体量的取舍依据 —— 执行标准自己给出的合规路径（「确有取舍必须写在项目卡片上」）。
   * 目标总字数落在该平台分类头部实测区间之外、又不想改字数时，写在这里即可满足判据。
   * 少于 CATEGORY_WORD_SCALE_DEVIATION_MIN_CHARS 字不算说明，判据仍不满足。
   */
  categoryWordScaleDeviation: string;
}

export const EMPTY_EXECUTION_STANDARDS: ExecutionStandardsValue = {
  targetPlatform: '',
  customPlatformNote: '',
  targetWords: '',
  projectType: '',
  category: '',
  storyTone: [],
  writingStyle: [],
  webNovelGenre: [],
  submissionTags: [],
  plotTags: [],
  genreFitNote: '',
  pov: '',
  targetAudience: '',
  categoryWordScaleDeviation: '',
};

export interface CategoryOption {
  /**
   * 选项唯一身份（后端 platformCategoryOptionId）：有频道时是「频道·分类名」。
   *
   * 为什么选项必须自带频道：番茄有 3 个投稿分类名在男频与女频各有一项
   * （科幻末世 / 悬疑脑洞 / 游戏体育）。只按名字做选项身份时，下拉的 key 会重复、
   * 按名字建的频道映射会被后写覆盖（男频那一项显示成女频），落库后也只能靠目标读者
   * 猜频道——目标读者是可选填的，没填就静默换了频道。
   * 全局题材字典没有频道，id 缺省时退回 name。
   */
  id?: string;
  /** 归属频道（男频/女频/通用…）；全局题材字典没有频道，为空。 */
  channel?: string;
  name: string;
  children: string[];
  /** 该平台分类对应的全局大类（历史数据「全局大类/子类」靠它回显），没有则为空。 */
  globalCategory?: string | null;
  /**
   * 平台侧到这一层就是投稿分类（扁平平台的 children 只有它自己）。
   * flat 为 true 时前端不得再让用户选第二遍——否则同一个名字会被选两次，
   * 落库成「都市高武/都市高武」这种平台侧根本不存在的位置。
   */
  flat?: boolean;
}

/** 选项唯一身份：有 id 用 id，没有（全局题材字典）退回分类名。 */
export function categoryOptionId(option: CategoryOption): string {
  return option.id || option.name;
}

/**
 * 把一个分类写法归到某个选项上。三种写法都认：
 *   1) 选项身份「频道·分类名」（下拉里点的那一项，永远唯一）；
 *   2) 裸分类名（历史数据），只在唯一命中时算数；
 *   3) 全局大类名（平台树里 globalCategory 指向它）。
 * 频道提示只在跨频道同名时参与消歧；跨频道且没有频道依据时返回 undefined
 * ——不猜，由调用方把「哪一项」摆到用户面前重选。
 */
export function matchCategoryOption(
  options: CategoryOption[],
  value: string,
  channelHint?: string | null,
): CategoryOption | undefined {
  const raw = String(value ?? '').trim();
  if (!raw) return undefined;
  const channel = String(channelHint ?? '').trim();
  const byId = options.find((item) => categoryOptionId(item) === raw);
  if (byId) return byId;
  const narrow = (hits: CategoryOption[]): CategoryOption[] => (
    hits.length > 1 && channel ? hits.filter((item) => item.channel === channel) : hits
  );
  const byName = narrow(options.filter((item) => item.name === raw));
  if (byName.length === 1) return byName[0];
  const byGlobal = narrow(options.filter((item) => item.globalCategory === raw));
  return byGlobal.length === 1 ? byGlobal[0] : undefined;
}

/**
 * 「平台」这一维的缺项原因；返回 null 表示这一维已执行标准。
 *
 * 为什么要有这个函数：平台是唯一一个「缺项」有不止一种形态的维度——没选、选了通用、
 * 选了自定义却没写说明，三者都等于没有平台标准，但给用户的提示必须不同
 * （「请选择平台」和「你选了自定义平台，但没写它的标准」是两件事）。
 * 所有入口（创建向导、想法孵化、执行标准页）都从这里取原因，不再各写一套 if。
 */
export function platformStandardProblem(
  value: Pick<ExecutionStandardsValue, 'targetPlatform' | 'customPlatformNote'>,
): ReturnType<typeof sharedPlatformStandardProblem> {
  // 这里曾有过第二份平台有效性判据，前端会把题材值当成可发布平台；只保留适配表单形状的包装。
  return sharedPlatformStandardProblem(value.targetPlatform, value.customPlatformNote);
}

/** 选了自定义平台却没写说明：这是「平台」这一维缺值，不是「平台已选」。 */
export function isCustomPlatformNoteMissing(
  value: Pick<ExecutionStandardsValue, 'targetPlatform' | 'customPlatformNote'>,
): boolean {
  return platformStandardProblem(value) === 'custom_note_missing';
}

/**
 * 与后端 missingConstitutionStandards 同一份判据，返回空数组即六维齐备。
 * 维度名用界面上的说法（平台/分类/基调/文风/流派/视角），便于直接展示给用户。
 */
export function missingExecutionStandards(value: ExecutionStandardsValue): string[] {
  const missing: string[] = [];
  const required = platformSubmissionDimensions(value.targetPlatform, value.projectType, value.category, value.targetAudience);
  // 「没选」「选了通用」「选了自定义但没写说明」三种都算平台这一维没值。
  if (platformStandardProblem(value) !== null) missing.push('平台');
  if (!String(value.category ?? '').trim()) missing.push(platformCreationFieldNames(value.targetPlatform, value.projectType, false).category);
  // 这里曾把创作六维误删成投稿字段，后果是基调、文风和视角不显示，也不会进生成请求。
  // 投稿名称由平台定义，创作前提仍逐维硬验收。
  if (!value.storyTone.length) missing.push('基调');
  if (!value.writingStyle.length) missing.push('文风');
  if (!value.webNovelGenre.length) missing.push('流派');
  if (required.includes('genre') && !value.submissionTags.length) missing.push('作品标签');
  if (!value.pov.trim()) missing.push('视角');
  const placement = resolveSubmissionCategory(value.targetPlatform, value.category, value.projectType, value.targetAudience);
  if (placement.status === 'resolved' && value.submissionTags.length
    && platformCategoryDimensionBinding(value.targetPlatform, placement.value, 'genre', value.submissionTags.join('、'), value.projectType).gap
    && value.genreFitNote.trim().length < 10) missing.push('标签与分类契合依据');
  return missing;
}

/** 字典值的归一化：历史数据里 writingStyle 既可能是数组，也可能是单个字符串。 */
export function toStandardsTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

/** 已选值可能不在字典里（自定义/旧数据），必须一并列出，否则用户无法取消已有选项。 */
export function unionOptions(dictionary: string[], selected: string[]): string[] {
  const merged = [...dictionary];
  for (const item of selected) if (!merged.includes(item)) merged.push(item);
  return merged;
}

/** 目标总字数的解析：只认有限正数；空串 / 非数字 / 0 / 负数一律返回 null（= 未设定，不是 0）。 */
export function parseTargetWords(raw: string | null | undefined): number | null {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

export interface TargetWordsVerdict {
  /**
   * 判据结论 —— 就是 shared categoryWordScaleStanding 的状态机，前端不再自算一份。
   * within / deviation_declared / no_metric 满足判据；unset / out_of_range 未满足。
   */
  status: CategoryWordScaleStatus;
  /** 该平台分类已核实到的体量分布；null = 未核验（不得编造区间，也不得套用别的分类）。 */
  metric: PlatformCategoryMetric | null;
  /** 判据原文，直接展示给作者 —— 与后端 platform-quality-rules 的判据共用同一份数据。 */
  note: string;
  /** true = 已确定性违反「分类」维判据（未设定 / 落区间外），是硬判定，不是提示。 */
  error: boolean;
  /** true = 该状态要求在项目卡片上写明「分类体量取舍依据」（落区间外时的唯一合规路径）。 */
  deviationRequired: boolean;
}

/**
 * 「分类」维目标总字数的确定性判据 —— 判据本体只有一份：shared 的 categoryWordScaleStanding，
 * 与后端质量 Gate、创建入口、生成入口、执行标准提示词同源。前端只把同一份结论译成界面文案。
 *
 * 为什么必须委托而不是自算：这里自算过一次「区间内 / 区间外」，于是同一本书出现两套口径 ——
 * 前端按通用区间放行、后端按平台分类区间阻断（或反过来），作者就在「我已经填了」和
 * 「未执行标准」之间来回打转。自算还漏了成稿单元：平台的实测体量是按单元采集的，
 * 前端不认单元，就会拿长篇区间拦下合规短篇。
 *
 * 为什么必须在前端可见、可拦：对「有适用口径的平台分类」这是硬判定。作者看不到它，就只能等
 * 正文全部生成之后（实测约十分钟、十余次 LLM 调用）被质量 Gate 告知 —— 那是成本最高的一步。
 * 空值 = 未设定，绝不用 0 或平台推荐兜底。
 */
export function targetWordsVerdict(value: ExecutionStandardsValue): TargetWordsVerdict {
  if (value.targetPlatform === CUSTOM_PLATFORM_VALUE) {
    return { status: 'no_metric', metric: null, note: '自定义平台没有系统预置的分类体量基准：目标总字数按「平台」维的自定义说明执行。', error: false, deviationRequired: false };
  }
  if (!String(value.targetPlatform ?? '').trim()) {
    return { status: 'no_metric', metric: null, note: '先选平台与分类：分类级体量口径要等分类在该平台归位后才能对照。', error: false, deviationRequired: false };
  }
  const standing = categoryWordScaleStanding({
    targetPlatform: value.targetPlatform,
    category: value.category,
    targetAudience: value.targetAudience,
    projectType: value.projectType,
    targetWords: parseTargetWords(value.targetWords) ?? undefined,
    categoryWordScaleDeviation: value.categoryWordScaleDeviation,
  });
  const error = categoryWordScaleBlocked(standing);
  const base = {
    status: standing.status,
    metric: standing.metric,
    error,
    // 只有「落区间外」才需要写取舍依据：未设定要先填数字（填了才谈得上取舍），
    // 无适用口径时本就无判据可满足。
    deviationRequired: standing.status === 'out_of_range',
  };
  if (standing.status === 'no_metric') {
    // 成稿单元不符必须原样说明（缺失即缺失），不得含糊成「未核验」。
    if (standing.unitMismatch) return { ...base, note: standing.unitMismatch + '。' };
    if (!String(value.category ?? '').trim()) {
      return { ...base, note: '先在项目卡片选定分类：分类级体量口径要等分类在该平台归位后才能对照。' };
    }
    if (!standing.resolved) {
      return { ...base, note: '分类尚未在该平台的投稿分类中归位：分类级体量口径未核验，无法对照目标总字数。' };
    }
    return {
      ...base,
      note: '该分类在' + platformLabel(value.targetPlatform) + '的实际体量分布未核验（系统尚未采集该分类头部数据）：没有确定性判据，不得编造数字，也不得套用其他分类的区间。',
    };
  }
  const line = categoryWordScaleLine(standing).replace(/^；/, '');
  return { ...base, note: error ? line + ' —— 验收链会直接判「分类」维未执行（硬判定，不是提示）。' : line };
}

/** 阻断判据：返回非 null 即「分类」维的目标总字数未执行，必须在保存/创建之前补齐。 */
export function targetWordsBlockingReason(value: ExecutionStandardsValue): string | null {
  const verdict = targetWordsVerdict(value);
  return verdict.error ? verdict.note : null;
}

/**
 * 分类落库格式是「大类/子类」的单一字符串（与创建向导一致），这里只做往返解析，不改写原值。
 *
 * 解析出的 major 是选项身份（categoryOptionId，可能带「频道·」前缀），minor 是裸子类名
 * ——频道属于「哪一项投稿分类」，不属于子类，写进子类只会让落库值更难解析。
 * channelHint 只在分类名横跨男女频时用来消歧；选项身份（带频道的写法）优先，不参与猜测。
 */
export function parseCategory(
  raw: string,
  categories: CategoryOption[],
  channelHint?: string | null,
): { major: string; minor: string } {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return { major: '', minor: '' };
  // 扁平平台：投稿分类只有一层，落库就是单个分类名（没有分隔符）。命中即忠实还原成 major，
  // minor 必须留空——不能因为「大类命中」就把同一个名字再当成子类选一遍。
  const flatHit = matchCategoryOption(categories.filter((item) => item.flat === true), trimmed, channelHint);
  if (flatHit) return { major: categoryOptionId(flatHit), minor: '' };
  const index = trimmed.indexOf(CATEGORY_SEPARATOR);
  const head = index >= 0 ? trimmed.slice(0, index) : trimmed;
  const tail = index >= 0 ? trimmed.slice(index + 1) : '';
  const headOption = matchCategoryOption(categories, head, channelHint);
  if (headOption) {
    const id = categoryOptionId(headOption);
    // 历史脏数据「扁平分类/同名子类」还原成单层，避免把它当成有效落位继续展示。
    if (headOption.flat && (tail === headOption.name || tail === id)) return { major: id, minor: '' };
    return { major: id, minor: tail };
  }
  // 只给了子类名：找出「谁拥有这个子类」。这里必须和上面一样走「唯一命中才算数」，
  // 不能用 find 取第一个——番茄的「科幻末世/悬疑脑洞/游戏体育」在男频与女频各有一项，
  // 取第一个等于在用户没表达频道时替用户选了男频，正是本文件要消灭的静默换频道。
  const owners = categories.filter((item) => item.children.includes(trimmed));
  const channel = String(channelHint ?? '').trim();
  const narrowed = owners.length > 1 && channel ? owners.filter((item) => item.channel === channel) : owners;
  if (narrowed.length === 1) {
    return { major: categoryOptionId(narrowed[0]), minor: narrowed[0].flat ? '' : trimmed };
  }
  return { major: '', minor: trimmed };
}

/**
 * 分类下拉要显示的选项身份 —— 与后端执行标准共用同一份归位判据。
 *
 * 为什么必须有它：后端归位 resolvePlatformCategory 对历史写法「全局大类/子类」有明确口径
 * （归位到该平台的投稿大类，并如实标记 leafExact=false），而 parseCategory 只认「选项身份唯一命中」。
 * 同一个落库值，一个归得了位、一个归不了位，于是出现「平台落位已写明 番茄小说 · 男频 · 都市日常，
 * 下拉却还是空」——用户看到的是「这一维没配」，系统执行的却是另一个分类。
 *
 * 显示必须和执行同源，否则两个入口（创建向导 / 执行标准页）会各说各话：
 *   1) 解析得出选项身份：原样使用，归位只做兜底，不改写用户的明确选择；
 *   2) 解析不出但已归位：显示归位后的那一项（含 leafExact 时的真实子分类）；
 *   3) 解析不出且未归位：留空，由调用方要求用户重选（不猜、不静默套一个分类）。
 */
export function categoryDisplayValue(
  parsed: { major: string; minor: string },
  placement: ResolvedPlatformCategory | null | undefined,
): { major: string; minor: string } {
  if (parsed.major) return { major: parsed.major, minor: parsed.minor };
  if (!placement) return { major: '', minor: '' };
  return {
    major: platformCategoryOptionId(placement.channel, placement.platformGroup),
    minor: placement.leafExact && placement.platformLeaf !== placement.platformGroup ? placement.platformLeaf : '',
  };
}

/**
 * 拼接落库值。major 是选项身份（`频道·分类名`，来自 categoryOptionId），
 * minor 是裸子类名（不带频道：频道属于「哪一项投稿分类」，不属于子类）。
 */
export function joinCategory(major: string, minor: string): string {
  if (!major) return minor;
  // 扁平平台只有一层：minor 为空、或用户/历史数据把同一个名字又填了一遍，
  // 都必须落库成单个分类名，不能写成「都市高武/都市高武」。
  if (!minor || minor === major) return major;
  return major + CATEGORY_SEPARATOR + minor;
}

/** 六维标准的提交载荷：创建入口与执行标准页共用同一份形状，避免两处各拼一套字段。 */
export interface ExecutionStandardsPayload {
  targetPlatform: string;
  customPlatformNote: string;
  /** 未设定时缺省（不发 0）：后端据此判该维未执行，而不是被一个假值蒙混过关。 */
  targetWords?: number;
  category: string;
  storyTone: string[];
  writingStyle: string[];
  webNovelGenre: string[];
  submissionTags: string[];
  plotTags: string[];
  genreFitNote: string;
  pov: string;
  targetAudience: string;
  /** 分类体量取舍依据：写在项目卡片上的合规路径，必须随执行标准一起提交，不能只留在前端。 */
  categoryWordScaleDeviation: string;
}

export function toExecutionStandardsPayload(value: ExecutionStandardsValue): ExecutionStandardsPayload {
  const platform = value.targetPlatform;
  return {
    targetPlatform: platform,
    // 只有自定义平台才带说明，避免给其他平台写入一段会被后端当成基准的文本。
    customPlatformNote: platform === CUSTOM_PLATFORM_VALUE ? value.customPlatformNote.trim() : '',
    // 未设定时不发 0：让后端按「未设定」判该维未执行，而不是被一个假值蒙混过关。
    targetWords: parseTargetWords(value.targetWords) ?? undefined,
    category: value.category.trim(),
    storyTone: value.storyTone,
    writingStyle: value.writingStyle,
    webNovelGenre: value.webNovelGenre,
    submissionTags: value.submissionTags,
    plotTags: value.plotTags,
    genreFitNote: value.genreFitNote.trim(),
    pov: value.pov.trim(),
    targetAudience: value.targetAudience,
    categoryWordScaleDeviation: value.categoryWordScaleDeviation.trim(),
  };
}
