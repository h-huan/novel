import { BadRequestException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { DatabaseSync } from 'node:sqlite';
import { buildBenchmarkDirective, getPlatform, normalizePlatformId, targetForLength } from '../../chain/platform-benchmarks';
import { scorePolicy } from '../writing-quality/score-policy';
import { CHAPTER_WORD_RANGE, describeCategoryPlacement, dimensionGuidesText, EXECUTION_STANDARD_DIMENSIONS, platformCreationFieldNames, platformSubmissionDimensions, platformCategoryBenchmarkNote, platformCategoryDimensionBinding, platformCategoryTreeVerification, platformCategoryWritingBrief, platformCategoryWritingNote, platformHasOwnCategoryTree, platformStandardProblem, resolveSubmissionCategory, CATEGORY_WORD_SCALE_DEVIATION_MIN_CHARS, audienceChannelHint, categoryWordScaleBlocked, categoryWordScaleLine, categoryWordScaleMessage, categoryWordScaleStanding, type CategoryWordScaleInput, type CategoryWordScaleStanding, type CategoryWordScaleStatus, type ExecutionStandardDimensionKey } from '../../../shared/src';
export { platformStandardProblem } from '../../../shared/src';
import type { PlatformBoundDimension } from '../../../shared/src';

export interface CreativeConstitution {
  qualityPolicy?: import('../writing-quality/score-policy').ScorePolicy;
  schemaVersion: 1;
  revision: number;
  projectType: string;
  targetPlatform: string;
  targetWords: number;
  platformRules: ReturnType<typeof targetForLength>;
  category: string;
  storyTone: string[];
  writingStyle: unknown;
  webNovelGenre: string[];
  submissionTags: string[];
  plotTags: string[];
  genreFitNote: string;
  pov: string;
  targetAudience: unknown;
  /** 灵感发现确认后的唯一故事事实。 */
  confirmedStory?: Record<string, unknown>;
  /**
   * 自定义平台（TargetPlatform.CUSTOM）的说明，由用户在执行标准里填写。
   * 它本身就是「平台」这一维的执行值：为空 = 用户选了自定义平台却没给标准，
   * 属于未执行标准，必须暴露并阻断，不得静默落回通用网文基准。
   */
  customPlatformNote?: string;
  /**
   * 「分类」维的「刻意偏离」取舍依据，由用户在项目卡片/创建向导填写。
   *
   * 执行标准对「分类」维的体量判据是：目标总字数必须落在该平台分类的头部实测区间内，
   * 或在项目卡片上写明与该分类体量分布不符的取舍依据。后者此前只有文案承诺、没有任何字段承载，
   * 于是「按标准写明了取舍」这条路在系统里根本不存在：生成→评审→精修→复评必然回滚
   * （platform.category_word_scale 是项目卡片级问题，正文精修永远改不动它），每章白烧一次 LLM 调用。
   * 这里把出口补齐：字段非空 = 作者明确取舍，判据按「已声明偏离」放行；为空 = 判据未满足，仍然硬阻断。
   * 不得用默认值或模板文案兜底，也不得在正文层伪造这个声明。
   */
  categoryWordScaleDeviation?: string;
  chapterWordRange: { min: number; max: number };
}

export function settingsObject(value: unknown): Record<string, any> {
  if (value === undefined || value === null || value === '') return {};
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { throw new BadRequestException('项目配置不是有效 JSON'); }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('项目配置必须为对象');
  return value as Record<string, any>;
}

function style(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? [];
  try { return JSON.parse(value); } catch { return value; }
}

function tags(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : typeof value === 'string' && value ? [value] : [];
}

/** 首个非空字符串胜出。空串按“缺失”处理，否则一个残缺的旧设置会掩盖别处仍然存在的真实值。 */
function firstString(...values: unknown[]): string {
  for (const value of values) if (typeof value === 'string' && value.trim()) return value;
  return '';
}

function firstTags(...values: unknown[]): string[] {
  for (const value of values) { const list = tags(value); if (list.length) return list; }
  return [];
}

function firstStyle(...values: unknown[]): unknown {
  for (const value of values) {
    const parsed = style(value);
    if (Array.isArray(parsed) ? parsed.length > 0 : !!parsed) return parsed;
  }
  return [];
}

/**
 * 表达层标准缺项。用户在创建项目时选定的平台/分类/基调/文风/流派/视角是【执行前提】，
 * 任一为空都属“未执行标准”：必须显式暴露并阻断，不得静默降级为 not_applicable，
 * 也不得用默认值或平台推荐补齐——否则等于“看起来检查过、其实从未检查”。
 */
export const MISSING_STANDARD_DIMENSIONS = EXECUTION_STANDARD_DIMENSIONS;

export type MissingStandardDimension = ExecutionStandardDimensionKey;

/** 缺失的单个执行标准维度：dimension 是判定/评分的键，label 是界面说法，field 是创作宪法字段名。 */
export interface MissingStandard {
  dimension: MissingStandardDimension;
  label: string;
  field: string;
}

/**
 * 平台维度的「已执行」判据。与前端 desktop/src/renderer/lib/executionStandards.ts 同源。
 *
 * generic = 没选平台（通用网文不是执行标准，是被判未设置的中性回落）。
 * custom  = 选了「自定义平台」，此时平台标准只能来自用户填写的说明；
 *           说明为空说明用户既没选具体平台、也没定义自己的平台 → 同样是「没有这项标准」。
 * 这两种情况都必须判未执行并阻断，绝不能静默套用通用网文基准生成。
 */
export function isPlatformStandardPresent(
  c: Pick<CreativeConstitution, 'targetPlatform' | 'customPlatformNote'>,
): boolean {
  return platformStandardProblem(c.targetPlatform, c.customPlatformNote) === null;
}

export function missingConstitutionStandards(c: CreativeConstitution): MissingStandard[] {
  // 这里曾把创作维度误当成投稿字段并从必填集合删掉，后果是空基调/文风/视角仍可生成。
  // 投稿字段的名称可以随平台变；六维创作前提仍必须有值。
  const missing: MissingStandard[] = MISSING_STANDARD_DIMENSIONS.filter(entry => (
    entry.dimension === 'platform' ? !isPlatformStandardPresent(c)
    : entry.dimension === 'category' ? !String(c.category ?? '').trim()
    : entry.dimension === 'tone' ? !c.storyTone.length
    : entry.dimension === 'style' ? !(Array.isArray(c.writingStyle) ? c.writingStyle.length : String(c.writingStyle ?? '').trim())
    : entry.dimension === 'genre' ? !c.webNovelGenre.length
    : !String(c.pov ?? '').trim()
  ));
  const requiredSubmission = platformSubmissionDimensions(c.targetPlatform, c.projectType, c.category, audienceChannelHint(c.targetAudience));
  if (requiredSubmission.includes('genre') && !(c.submissionTags ?? []).length) {
    missing.push({ dimension: 'genre', label: '作品标签', field: 'submissionTags' });
  }
  return missing.map(({ dimension, label, field }) => ({
    dimension,
    label: field === 'submissionTags' ? platformCreationFieldNames(c.targetPlatform, c.projectType, true).genre || '作品标签'
      : dimension === 'category' ? platformCreationFieldNames(c.targetPlatform, c.projectType, false).category : label,
    field,
  }));
}

/** 头部样本不是投稿标签全集。未命中样本时要求作者说明契合点，质量门仍逐章验收。 */
export function genreFitProblem(c: CreativeConstitution): string | null {
  const placement = resolveSubmissionCategory(c.targetPlatform, c.category, c.projectType, audienceChannelHint(c.targetAudience));
  if (placement.status !== 'resolved' || !(c.submissionTags ?? []).length) return null;
  const gap = platformCategoryDimensionBinding(c.targetPlatform, placement.value, 'genre', (c.submissionTags ?? []).join('、'), c.projectType).gap;
  return gap && String(c.genreFitNote ?? '').trim().length < 10
    ? `${gap}；请填写至少 10 字的标签与分类契合依据` : null;
}

/**
 * 「分类」维度的平台归属判据 —— 「按平台分类执行」的阻断口径。
 *
 * 分类不是孤立的题材标签，而是「这本书投到该平台的哪个分类」。填入的分类若不落在该平台的
 * 投稿分类内，模型只能按系统内部 taxonomy 写、投稿时对不上位 —— 这正是「执行标准写了却
 * 没生效」的根因。因此本函数返回非 null 时必须阻断，不得静默放行、不得自动改写成别的分类。
 *
 * 平台没有独立投稿分类树（custom / 未建模平台）时返回 null：这不是「检查通过」，而是
 * 「该平台没有可核验的投稿分类」，由 buildExecutionStandard 在分类要求里显式写明未核验。
 * 分类为空属于 missingConstitutionStandards 的 missing_standard，这里不重复判。
 */
export interface CategoryPlacementProblem { reason: string; availableGroups: string[] }

/**
 * 目标读者兼作频道提示（男频/女频）——实现已上移到 shared 的 category-word-scale，
 * 本文件只做转发：前端与后端必须跑同一个函数，否则「前端放行、后端阻断」会再次出现。
 */
export { audienceChannelHint };

export function categoryPlacementProblem(c: CreativeConstitution): CategoryPlacementProblem | null {
  if (!String(c.category ?? '').trim()) return null;
  const resolution = resolveSubmissionCategory(c.targetPlatform, c.category, c.projectType, audienceChannelHint(c.targetAudience));
  if (resolution.status === 'no_tree') return null;
  if (resolution.status === 'resolved') return null;
  return {
    reason: resolution.status === 'unmapped' ? resolution.reason : c.targetPlatform + ' 未建模投稿分类树',
    availableGroups: resolution.status === 'unmapped' ? resolution.availableGroups : [],
  };
}

/**
 * 分类未在平台归位时的统一阻断文案。
 *
 * 为什么单独成函数：创建入口（chain 的 create-project-async）、项目创建/更新（project.service）、
 * 生成入口（assertExecutionStandardsComplete）三处都要拦同一件事。各写一遍措辞必然分叉，
 * 用户就会在两套说法之间来回猜「到底哪里没填对」。三处共用这一句，判据仍是 categoryPlacementProblem。
 */
export function categoryPlacementMessage(
  c: CreativeConstitution,
  problem: CategoryPlacementProblem,
  platformDisplay: string,
): string {
  const available = problem.availableGroups.length > 0
    ? '；该平台可选的投稿大类：' + problem.availableGroups.join('、')
    : '';
  return '分类「' + String(c.category ?? '').trim() + '」未在' + platformDisplay + '的投稿分类中归位（' + problem.reason + '）' + available
    + '；属未执行标准，必须改选该平台的投稿分类后才能继续（不得静默接受对不上位的分类，也不得自动改写成别的分类）。';
}

/**
 * 「分类」维的体量判据（目标总字数 vs 该平台分类的头部实测区间）——实现已上移到
 * shared 的 category-word-scale，本文件只做转发。
 *
 * 为什么必须只有一份：这条判据此前有四个各自为政的落点（后端质量 Gate、执行标准提示词、
 * 创建/生成入口的字数检查、前端 targetWordsVerdict），四处口径各写一遍，后果是作者在项目
 * 卡片上写明了取舍依据、前端提示认识它、后端判据不认识它，于是「已按标准声明偏离」的书照样
 * 在生成末尾被 Gate 拦下并回滚精修（platform.category_word_scale 是项目卡片级问题，正文精修
 * 永远改不动它），每章白烧一次 LLM 调用。现在前端、创建入口、生成入口、质量 Gate 共用同一份。
 *
 * 不得降级：within / deviation_declared 判据满足；unset / out_of_range 必须阻断；
 * no_metric（该平台该分类未采集到实测体量）不产出判据，也不得拿别的平台/分类的区间顶上。
 */
export {
  CATEGORY_WORD_SCALE_DEVIATION_MIN_CHARS,
  categoryWordScaleStanding,
  categoryWordScaleBlocked,
  categoryWordScaleLine,
  categoryWordScaleMessage,
};
export type { CategoryWordScaleInput, CategoryWordScaleStatus, CategoryWordScaleStanding };


/**
 * 执行标准的维度键。`styleTags` / `audience` 不是创作宪法顶层字段（题材标签来自已确认题材卡），
 * 但与六个宪法维度同级参与执行，因此共用同一份构建器而不是各拼一套。
 */
export type ExecutionStandardKey = MissingStandardDimension | 'styleTags' | 'audience';

/**
 * 执行标准的单条可验收维度。用户在项目卡片上选定的 平台/分类/基调/文风/流派/视角 不是装饰性标签，
 * 而是「框架层（世界观/大纲/人物/伏笔）与正文层都必须执行」的验收前提；所以每一维都要同时给出
 * **可验收要求**——只有值没有要求时，模型与评审都无法据此判定"这一章是否符合标准"。
 */
export interface ExecutionStandardDimension {
  dimension: ExecutionStandardKey;
  label: string;
  value: string;
  /** 该维必须被执行的验收口径：写进 prompt，同时作为对应质量维度的验收依据 */
  requirement: string;
}

export interface ExecutionStandard {
  dimensions: ExecutionStandardDimension[];
  /** 空值维度（= 标准未执行）。必须显式暴露并阻断，不得静默省略、不得填默认值 */
  missing: MissingStandard[];
  /** 逐条可验收维度的摘要，供局部精修等紧凑场景使用 */
  summary: string;
  /** 完整区块：框架层与正文层共用同一份口径 */
  directive: string;
}

/**
 * 唯一执行标准构建器。
 *
 * 为什么必须唯一：框架层此前只拼「基调/文风/流派/题材标签」，正文层才补上「分类/视角/目标读者」
 * （见 chain.controller 框架层与正文层两处 styleDirective/toneDirective），
 * 两处口径不一致 = 用户在项目卡片上设置好的标准，框架层根本没执行。
 * 这里统一成一份，框架层与正文层共用，不再各写一套。
 */
export function buildExecutionStandard(
  c: CreativeConstitution,
  extras: { styleTags?: string[] } = {},
): ExecutionStandard {
  // 自定义平台：平台维度的执行值必须来自用户填写的说明，不得用 getPlatform().label 冒充当标准；
  // 也不得把通用网文的节奏/回报基准当成「该平台的标准」静默套用（系统不掌握该平台基准，这一点要写明）。
  const isCustomPlatform = String(c.targetPlatform ?? '').trim() === 'custom';
  const customPlatformNote = String(c.customPlatformNote ?? '').trim();
  const platformLabel = isCustomPlatform ? customPlatformNote : getPlatform(c.targetPlatform).label;
  const styleList = Array.isArray(c.writingStyle)
    ? c.writingStyle.map(v => String(v)).filter(Boolean)
    : (c.writingStyle ? [String(c.writingStyle)] : []);
  const audienceText = c.targetAudience
    ? (typeof c.targetAudience === 'string' ? c.targetAudience : JSON.stringify(c.targetAudience))
    : '';
  const styleTags = (extras.styleTags || []).map(t => String(t).trim()).filter(Boolean);

  const dimensions: ExecutionStandardDimension[] = [];
  const push = (dimension: ExecutionStandardKey, label: string, value: string, requirement: string) => {
    const text = String(value || '').trim();
    if (!text) return;
    dimensions.push({ dimension, label, value: text, requirement });
  };

  push('platform', '平台', platformLabel, isCustomPlatform
    ? '节奏、回报类型、段落与对话区间一律以上述「自定义平台说明」为唯一事实源；系统不掌握该平台的既定基准，禁止把通用网文或其他平台的基准当成它的标准套用'
    : '节奏、回报类型、段落与对话区间一律以 platform-benchmarks 为唯一事实源，不得套用其他平台写法；该区间是平台级口径（平台实测或建模），系统尚未采集按投稿分类细分的段落与对话阈值——分类级可读性口径未核验，不得把平台级区间说成该分类的实测口径');
  // 「按平台分类执行」：分类不是孤立的题材标签，而是【这本书在该平台的投稿分类】。
  // 同一个「都市」在番茄是男频都市下的子分类，在晋江可能根本不存在；只写全局分类，
  // 模型就只能按系统内部 taxonomy 写，投到平台对不上位 —— 执行标准写了却不生效。
  const categoryResolution = resolveSubmissionCategory(c.targetPlatform, c.category, c.projectType, audienceChannelHint(c.targetAudience));
  // 「按平台分类执行」的证据层：平台给这个投稿分类写的官方定义 + 该分类头部作品实际挂的平台官方标签。
  // 基调/文风/流派/视角不是脱离平台的自由填——每一维都要回到这份平台口径上验收。
  // 没采集到口径的分类如实写「未核验」，绝不编造、绝不套用别的分类（缺失即缺失）。
  const resolvedCategory = categoryResolution.status === 'resolved' ? categoryResolution.value : null;
  const writingBrief = resolvedCategory ? platformCategoryWritingBrief(c.targetPlatform, resolvedCategory, c.projectType) : '';
  /**
   * 「基调/文风/流派/视角」四维各自的「按平台分类执行」验收口径。
   *
   * 为什么四维不能共用一句话：平台对这四维的约束强度并不相同 ——
   * 流派可以逐值核对该分类头部的平台官方标签（measured）；基调只能判是否与该分类官方定义相悖（definition）；
   * 文风与视角平台不公开口径（author_only，判据是作者设定，但仍必须执行，不是「不适用」）。
   * 四维套同一段 = 假严谨：「选了流派却和该分类头部官方标签对不上」这件事从来没被报出来。
   * 平台侧证据（官方定义原文 + 头部官方标签）在「分类」维已给全，这里不重复四遍，避免提示词膨胀拖慢生成。
   * 未采集到该分类口径时（evidence 为空）如实写「未核验」，并保留该维通用规则 —— 不得编造平台口径，也不得因此放宽该维。
   */
  const dimensionRequirement = (dimension: PlatformBoundDimension, value: string, genericRule: string): string => {
    if (!resolvedCategory) {
      return '该分类在' + platformLabel + '的写作口径未核验（系统尚未采集该平台该分类的官方分类定义与头部官方标签；不得编造平台口径，也不得套用其他分类）；' + genericRule;
    }
    const binding = platformCategoryDimensionBinding(c.targetPlatform, resolvedCategory, dimension, value, c.projectType);
    // 平台给了判据不等于该维自身的执行口径可以丢：两者都必须留在标准里。
    const parts = [binding.requirement];
    if (binding.gap) parts.push('头部样本落差（必答项，必须核验作者依据，不得默认通过）：' + binding.gap + '；作者依据：' + (c.genreFitNote || '未填写'));
    parts.push(genericRule);
    return parts.join('；');
  };
  const categoryRequirement = (() => {
    const base = '事件类型、场景与冲突必须落在「' + c.category + '」范围内，不得混入该分类之外的题材机制';
    if (categoryResolution.status === 'no_tree') {
      return base + '；「' + c.category + '」的投稿后台分类归属未核验（不得臆造平台分类，也不得套用其他平台的分类）；该分类实际体量分布未核验，不得编造数字，也不得套用其他分类的区间';
    }
    if (categoryResolution.status === 'unmapped') {
      return base + '；警告：该分类未在' + platformLabel + '的投稿分类中归位（' + categoryResolution.reason + '）';
    }
    const v = categoryResolution.value;
    // 只归位到大类时不得写出「大类 · 子类」的假精确：平台侧没有同名子分类就如实说明。
    const placement = describeCategoryPlacement(platformLabel, v);
    // 分类树的核实状态必须跟着落位一起进标准：8 个已建模平台里只有番茄是官网实测，
    // 其余是公开投稿口径建模。只给落位不给核实状态 = 让作者把建模结果当成平台官方分类。
    const treeVerification = platformCategoryTreeVerification(c.targetPlatform, c.projectType);
    const placementLine = treeVerification ? '；该平台投稿分类树的核实状态：' + treeVerification.note : '';
    const mapped = v.matched === 'global' && v.globalCategory
      ? '；用户填写的全局分类已在平台侧归位到「' + v.platformGroup + '」，平台落位以它为准'
      : '';
    const benchmark = platformCategoryBenchmarkNote(c.targetPlatform, v, c.projectType);
    // 「确有取舍必须写在项目卡片上」这条出口必须真的存在：判据与文案都取自同一份 standing，
    // 而不是在提示词里承诺一个系统并不认识的字段（此前就是这个缺口：模型被要求写取舍，系统无处接收）。
    const benchmarkLine = benchmark
      ? '；' + benchmark
      + '；本项目目标总字数必须落在该区间内：验收链的确定性判据 platform.category_word_scale 会逐值比对本项目目标总字数与该区间，落在区间外、或根本未设定目标总字数，都直接判「分类」维未执行（硬判定，不是提示）——确有取舍必须写在项目卡片上'
      + categoryWordScaleLine(categoryWordScaleStanding(c))
      : '；该分类在' + platformLabel + '的实际体量分布未核验（系统尚未采集该平台该分类的头部数据），不得编造数字，也不得套用其他分类的区间；本项目体量维度没有确定性判据，不得声称已按该分类核验过体量';
    const writing = platformCategoryWritingNote(c.targetPlatform, v, c.projectType);
    const writingLine = writing
      ? '；' + writing
      : '；该分类在' + platformLabel + '的写作口径未核验（系统尚未采集该平台该分类的官方分类定义与头部标签），不得编造平台口径，也不得套用其他分类';
    return base + '；平台落位：' + placement + '（该平台投稿分类，写作时必须满足该分类的读者预期）' + placementLine + mapped + benchmarkLine + writingLine;
  })();
  push('category', '分类', c.category, categoryRequirement);
  // 基调与文风：字典（story_dict）只决定「能选什么」，操作定义（选了之后怎么落笔）来自
  // shared 的唯一事实源。历史实现只把标签名拼进 prompt —— 模型收到的是一个词而不是一个做法，
  // 用户设了「白描/朴素」生成侧却没有任何具体约束，质检也无从判定，等于「设置了不生效」。
  // 因此这里把两维的操作定义一并注入；用户自建标签没有定义时如实留空，不编造、不套用别的标签。
  push('tone', '基调', c.storyTone.join('、'),
    dimensionRequirement('tone', c.storyTone.join('、'),
      `全篇情绪走向按「${c.storyTone.join('、')}」执行，情绪转折须有铺垫与代价，不得中途改调性`
      + dimensionGuidesText('tone', c.storyTone)));
  push('style', '文风', styleList.join('、'),
    dimensionRequirement('style', styleList.join('、'),
      `叙述语言按「${styleList.join('、')}」执行：句式、比喻密度、描写分寸与信息给法都以该风格为准`
      + dimensionGuidesText('style', styleList)));
  const plotTags = c.plotTags ?? [];
  const submissionTags = c.submissionTags ?? [];
  const plotLine = plotTags.length ? `；情节取向「${plotTags.join('、')}」必须落实到人物行动、冲突与回报，不得只写在标签里` : '';
  push('genre', '流派与作品标签', [...c.webNovelGenre, ...submissionTags, ...plotTags].join('、'),
    dimensionRequirement('genre', submissionTags.join('、'),
      `创作流派按「${c.webNovelGenre.join('、')}」执行；平台作品标签按「${submissionTags.join('、')}」兑现到可见的人物、关系与事件中；该流派读者的核心预期必须在本章被兑现${plotLine}`));
  push('pov', '视角', c.pov,
    dimensionRequirement('pov', c.pov,
      `叙事视角固定为「${c.pov}」：全篇保持一致，除选择"多视角轮换"外不得切换，每次切换都要有段落级标记`));
  push('styleTags', '题材标签', styleTags.join('、'),
    writingBrief
      ? '创建前已确认的题材标签必须落到具体设定与剧情点，不得只出现在标签里；' + writingBrief + '；标签契合以该分类头部官方标签为基准——所选标签若不在其中，必须写明它如何服务该分类的读者预期（不得默认通过）'
      : '创建前已确认的题材标签必须落到具体设定与剧情点，不得只出现在标签里；该分类在' + platformLabel + '的官方标签口径未核验（系统尚未采集），不得编造平台标签基准，也不得套用其他分类的标签');
  push('audience', '目标读者', audienceText,
    `语言密度、代入方式与情绪落点按「${audienceText}」这群读者执行`);

  const missing = missingConstitutionStandards(c);
  const summary = dimensions.map(d => `${d.label}：${d.value}`).join('；');
  const missingLine = missing.length
    ? `未执行标准（创建项目时未确认，必须补齐后才能继续；禁止用默认值或平台推荐补齐，禁止静默跳过）：${missing.map(m => m.label).join('、')}`
    : '';
  const body = [
    ...dimensions.map(d => `- ${d.label}：${d.value} —— 必须执行：${d.requirement}`),
    missingLine,
  ].filter(Boolean).join('\n');
  const directive = body
    ? `【项目执行标准 · 最高优先级】框架层（世界观/人物/组织/地点/大纲/伏笔）与正文层共用同一份，逐条必须执行：
${body}`
    : '';

  return { dimensions, missing, summary, directive };
}

/** Read the persisted authority. The migration/create boundary supplies it before normal reads. */
export function readConstitution(row: Record<string, any>): CreativeConstitution {
  const s = settingsObject(row.settings);
  const saved = s.creativeConstitution;
  if (saved !== undefined) {
    if (!saved || saved.schemaVersion !== 1 || !Number.isInteger(saved.revision) || saved.revision < 1
      || !['projectType', 'targetPlatform', 'category', 'pov'].every(k => typeof saved[k] === 'string')
      || !['storyTone', 'webNovelGenre'].every(k => Array.isArray(saved[k]) && saved[k].every((v: unknown) => typeof v === 'string'))
      || !Number.isFinite(saved.targetWords) || saved.targetWords < 0
      || !saved.platformRules || typeof saved.platformRules !== 'object'
      || !Number.isInteger(saved.chapterWordRange?.min) || !Number.isInteger(saved.chapterWordRange?.max)
      || saved.chapterWordRange.min <= 0 || saved.chapterWordRange.max < saved.chapterWordRange.min) {
      throw new BadRequestException('创作宪法版本无效，需修复配置');
    }
    // 已落库的创作宪法同样可能带着空的创作字段（旧版本写入时这些字段还不是必填）。这里必须回收
    // 仍然存在的别名，而不是原样返回空值：空的分类/视角会让对应质量维度静默变成 not_applicable，
    // 读起来像“检查过没问题”，实际是“从未检查”。
    const clone = structuredClone(saved);
    // 最后一项 row.platform_style 与 row.story_category / row.story_tone 同类：历史别名兜底，
    // 只在宪法与 target_platform 都为空时回收旧行里用户当年选的平台。它排在最末，
    // 永远不会覆盖有值的 target_platform 或宪法 —— 别名只补空，不做第二判据。
    const targetPlatform = firstString(clone.targetPlatform, s.targetPlatform, s.platform, s.recommendedPlatform,
      row.target_platform, row.platform_style) || 'generic';
    return {
      ...clone,
      targetPlatform,
      category: firstString(clone.category, s.category, s.storyCategory, s.genre, row.story_category),
      storyTone: firstTags(clone.storyTone, s.storyTone, row.story_tone),
      writingStyle: firstStyle(clone.writingStyle, s.writingStyle, s.style, row.writing_style),
      webNovelGenre: firstTags(clone.webNovelGenre, s.webNovelGenre, row.web_novel_genre),
      submissionTags: tags(clone.submissionTags ?? s.submissionTags),
      plotTags: tags(clone.plotTags ?? s.plotTags),
      genreFitNote: String(clone.genreFitNote ?? s.genreFitNote ?? ''),
      pov: firstString(clone.pov, s.pov, s.pointOfView, row.pov, row.point_of_view),
      customPlatformNote: firstString(clone.customPlatformNote, s.customPlatformNote),
      categoryWordScaleDeviation: firstString(clone.categoryWordScaleDeviation, s.categoryWordScaleDeviation),
      targetAudience: clone.targetAudience ?? s.targetAudience ?? s.targetReaders ?? row.target_audience ?? null,
      chapterWordRange: { ...CHAPTER_WORD_RANGE },
      platformRules: targetPlatform === clone.targetPlatform
        ? { ...clone.platformRules, chapterWords: [CHAPTER_WORD_RANGE.min, CHAPTER_WORD_RANGE.max] }
        : { ...targetForLength(getPlatform(targetPlatform), clone.projectType), chapterWords: [CHAPTER_WORD_RANGE.min, CHAPTER_WORD_RANGE.max] },
    };
  }
  const projectType = row.type || 'long_novel';
  const targetPlatform = typeof row.target_platform === 'string' && row.target_platform
    ? row.target_platform
    : 'generic';
  return {
    schemaVersion: 1, revision: 1, projectType, targetPlatform,
    targetWords: Number(row.target_words) || 0,
    platformRules: targetForLength(getPlatform(targetPlatform), projectType),
    // Legacy rows predate the constitution. Recover every alias that still exists instead of
    // silently writing empty values: an empty category/pov makes the matching quality
    // dimensions "not_applicable", which looks like "checked and fine" but means "never checked".
    category: firstString(s.category, s.storyCategory, s.genre, row.story_category),
    storyTone: firstTags(s.storyTone, row.story_tone),
    writingStyle: firstStyle(row.writing_style, s.writingStyle, s.style),
    webNovelGenre: firstTags(s.webNovelGenre, row.web_novel_genre),
    submissionTags: tags(s.submissionTags),
    plotTags: tags(s.plotTags),
    genreFitNote: String(s.genreFitNote ?? ''),
    pov: firstString(s.pov, s.pointOfView, row.pov, row.point_of_view),
    customPlatformNote: firstString(s.customPlatformNote),
    categoryWordScaleDeviation: firstString(s.categoryWordScaleDeviation),
    targetAudience: s.targetAudience ?? s.targetReaders ?? row.target_audience ?? null,
    chapterWordRange: { ...CHAPTER_WORD_RANGE },
  };
}

/** Accept legacy request fields at the boundary, reject ambiguous changes. */
export function updateConstitution(row: Record<string, any>, dto: Record<string, any>): CreativeConstitution {
  const current = readConstitution(row);
  const next = structuredClone(current);
  const s = settingsObject(dto.settings);
  if (dto.chapterWordRange !== undefined && (
    dto.chapterWordRange?.min !== CHAPTER_WORD_RANGE.min
    || dto.chapterWordRange?.max !== CHAPTER_WORD_RANGE.max
  )) {
    throw new BadRequestException(`单章字数范围固定为${CHAPTER_WORD_RANGE.min}-${CHAPTER_WORD_RANGE.max}字`);
  }
  const forbidden = ['creativeConstitution', 'targetPlatform', 'platform', 'recommendedPlatform', 'storyCategory', 'category', 'genre', 'storyTone', 'writingStyle', 'style', 'webNovelGenre', 'submissionTags', 'plotTags', 'genreFitNote', 'pov', 'pointOfView', 'targetAudience', 'targetReaders', 'customPlatformNote', 'chapterWordRange', 'categoryWordScaleDeviation'];
  const duplicate = forbidden.find(key => s[key] !== undefined);
  if (duplicate) throw new BadRequestException(`项目配置 ${duplicate} 必须使用创作宪法字段，不能写入 settings`);
  const fields: [keyof CreativeConstitution, unknown][] = [
    ['projectType', dto.type],
    ['targetPlatform', dto.targetPlatform],
    ['targetWords', dto.targetWords],
    ['category', dto.category],
    ['storyTone', dto.storyTone === undefined ? undefined : tags(dto.storyTone)],
    ['writingStyle', dto.writingStyle === undefined ? undefined : style(dto.writingStyle)],
    ['webNovelGenre', dto.webNovelGenre === undefined ? undefined : tags(dto.webNovelGenre)],
    ['submissionTags', dto.submissionTags === undefined ? undefined : tags(dto.submissionTags)],
    ['plotTags', dto.plotTags === undefined ? undefined : tags(dto.plotTags)],
    ['genreFitNote', dto.genreFitNote],
    ['pov', dto.pov],
    ['targetAudience', dto.targetAudience],
    ['customPlatformNote', dto.customPlatformNote],
    ['categoryWordScaleDeviation', dto.categoryWordScaleDeviation],
    ['chapterWordRange', dto.chapterWordRange],
  ];
  for (const [key, value] of fields) if (value !== undefined) (next as any)[key] = value;
  if (dto.qualityPolicy !== undefined) {
    try { next.qualityPolicy = scorePolicy(next, dto.qualityPolicy); }
    catch { throw new BadRequestException('评分权重或最低阈值无效'); }
  }
  next.chapterWordRange = { ...CHAPTER_WORD_RANGE };
  const r = next.chapterWordRange;
  next.platformRules = { ...targetForLength(getPlatform(next.targetPlatform), next.projectType), chapterWords: [next.chapterWordRange.min, next.chapterWordRange.max] };
  if (!Number.isFinite(next.targetWords) || next.targetWords < 0) throw new BadRequestException('目标字数无效');
  if (JSON.stringify(next) !== JSON.stringify(current)) next.revision++;
  return next;
}

/** Compatibility fields are projections, never independent authorities. */
export function constitutionSettings(settings: Record<string, any>, c: CreativeConstitution): Record<string, any> {
  const result = { ...settings };
  for (const key of ['targetPlatform', 'platform', 'recommendedPlatform', 'storyCategory', 'category', 'genre', 'storyTone', 'writingStyle', 'style', 'webNovelGenre', 'submissionTags', 'plotTags', 'genreFitNote', 'pov', 'pointOfView', 'targetAudience', 'targetReaders', 'customPlatformNote', 'categoryWordScaleDeviation', 'chapterWordRange']) delete result[key];
  return { ...result, creativeConstitution: c };
}

const CREATIVE_SETTING_KEYS = [
  'targetPlatform', 'platform', 'recommendedPlatform', 'storyCategory', 'category', 'genre',
  'storyTone', 'writingStyle', 'style', 'webNovelGenre', 'submissionTags', 'plotTags', 'genreFitNote', 'pov', 'pointOfView',
  'targetAudience', 'targetReaders', 'customPlatformNote', 'categoryWordScaleDeviation', 'chapterWordRange',
];

/** Consolidate existing aliases into the same persisted constitution used by new projects. */
export function normalizeStoredConstitutions(db: DatabaseSync): void {
  const rows = db.prepare(
    'SELECT id,type,target_platform,platform_style,target_words,writing_style,settings FROM projects',
  ).all() as any[];
  // UPDATE 里保留 platform_style 是有意为之：它只被写、永不参与判读（口径见 constitutionColumns 上方注释）。
  // 顺手删掉这个占位参数，旧列只能拿到 DEFAULT（第 180 轮已把旧默认 'fantasy' 收敛为与 target_platform
  // 同值的 'generic'）；不分叉了，但只认旧列的旧导出包会丢掉真实平台 —— 所以这里必须显式写。
  const update = db.prepare(`UPDATE projects
    SET type=?,target_platform=?,platform_style=?,target_words=?,writing_style=?,settings=? WHERE id=?`);

  for (const row of rows) {
    let settings: Record<string, any>;
    try {
      const parsed = JSON.parse(row.settings || '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
      settings = parsed;
    } catch {
      continue;
    }

    const saved = settings.creativeConstitution && typeof settings.creativeConstitution === 'object'
      ? settings.creativeConstitution as Record<string, any>
      : null;
    const projectType = String(saved?.projectType || row.type || 'long_novel');
    // 【本文件是 platform_style 唯一的读取点，且只此一次】这是存量修复的别名回收：历史行可能
    // 只写了旧列 platform_style（target_platform 还是空/未迁移），直接忽略它会把用户当年选的平台
    // 丢成 generic —— 那是降级。所以这里按「宪法 → 新列 → 旧列 → 旧 settings 别名」的顺序回收一次，
    // 回收完立刻把新旧两列写成同值；此后任何运行期读路径（readConstitution）都不再看旧列。
    const targetPlatform = String(saved?.targetPlatform || row.target_platform || row.platform_style
      || settings.targetPlatform || settings.platform || settings.recommendedPlatform || 'generic');
    const targetWords = Math.max(0, Number(saved?.targetWords ?? row.target_words) || 0);
    const chapterWordRange = { ...CHAPTER_WORD_RANGE };
    const savedRevision = Number(saved?.revision);
    const baseRevision = Number.isInteger(savedRevision) && savedRevision > 0 ? savedRevision : 1;
    const constitution: CreativeConstitution = {
      schemaVersion: 1,
      revision: baseRevision,
      projectType,
      targetPlatform,
      targetWords,
      platformRules: {
        ...targetForLength(getPlatform(targetPlatform), projectType),
        chapterWords: [chapterWordRange.min, chapterWordRange.max],
      },
      category: String(saved?.category ?? settings.category ?? settings.storyCategory ?? settings.genre ?? ''),
      storyTone: tags(saved?.storyTone ?? settings.storyTone),
      writingStyle: style(saved?.writingStyle ?? settings.writingStyle ?? settings.style ?? row.writing_style),
      webNovelGenre: tags(saved?.webNovelGenre ?? settings.webNovelGenre),
      submissionTags: tags(saved?.submissionTags ?? settings.submissionTags),
      plotTags: tags(saved?.plotTags ?? settings.plotTags),
      genreFitNote: String(saved?.genreFitNote ?? settings.genreFitNote ?? ''),
      pov: String(saved?.pov ?? settings.pov ?? settings.pointOfView ?? ''),
      customPlatformNote: String(saved?.customPlatformNote ?? settings.customPlatformNote ?? ''),
      categoryWordScaleDeviation: String(saved?.categoryWordScaleDeviation ?? settings.categoryWordScaleDeviation ?? ''),
      targetAudience: saved?.targetAudience ?? settings.targetAudience ?? settings.targetReaders ?? null,
      chapterWordRange,
    };
    if (saved && JSON.stringify({ ...constitution, revision: saved.revision }) !== JSON.stringify(saved)) {
      constitution.revision = baseRevision + 1;
    }
    for (const key of CREATIVE_SETTING_KEYS) delete settings[key];
    settings.creativeConstitution = constitution;
    update.run(projectType, targetPlatform, targetPlatform, targetWords,
      JSON.stringify(constitution.writingStyle), JSON.stringify(settings), row.id);
  }
}

/**
 * 创作宪法 → projects 表列投影。
 *
 * 【历史列 platform_style 的处理口径】它是 platform 维的旧列名，已由 `target_platform` 取代。
 * 允许的用法只有两种，别的一律禁止：
 *   ① 写入：这里与 normalizeStoredConstitutions、项目 INSERT 都同步写它，让「只认旧列」的外部
 *      读者（旧导出包、旧脚本）看到的平台仍然正确。不写的话旧列只会拿到 DEFAULT 值：第 180 轮已把
 *      旧默认 'fantasy' 收敛为与 target_platform 同值的 'generic'，不再分叉，但真实平台仍然丢了。
 *   ② 读取：仅作为【最后一位的历史别名】补空，顺序在宪法与 target_platform 之后，永不覆盖有值的标准。
 * 明确禁止的：新增任何 SQL 的 SELECT 里带上它（已删掉 chain.controller ×3、outline、state-item、
 * writing-quality ×2、generation-metrics 的 7 处死读）、把它排在 target_platform 之前、
 * 用它做「或」判据参与硬线/评分/看板。平台这一维的判据只有 `readConstitution().targetPlatform`。
 * 不物理 DROP COLUMN 的原因：SQLite 删列要重建表，对既有库有数据风险，而收益只是少一列。
 */
export function constitutionColumns(settings: Record<string, any>, c: CreativeConstitution) {
  return { type: c.projectType, target_platform: c.targetPlatform, platform_style: c.targetPlatform,
    target_words: c.targetWords, writing_style: JSON.stringify(c.writingStyle),
    settings: JSON.stringify(constitutionSettings(settings, c)) };
}

/**
 * 「平台」这一维的缺项原因；返回 null 表示这一维已执行标准。
 *
 * 判据与前端 desktop/src/renderer/lib/executionStandards.ts 的 platformStandardProblem 同源。
 * 之所以必须集中一处：平台标准的判据一旦分叉，就会出现「前端放行、后端阻断」，
 * 或者更糟——被静默当作「通用网文」继续生成。
 * 主生成链（chain.controller）与各精修入口（refinement）共用这一份，不得再各写一份。
 */
// 这里曾有过第二份 platformStandardProblem，前端与服务端能对同一平台给出不同结论；
// 判据已收敛到 shared/enums/platform.ts，此处仅重导出供既有调用者使用。

/**
 * 平台维度的全链路风格指令（唯一一份）。
 *
 * 一处定义，注入世界观/大纲/角色/标题/正文以及所有二次加工（开头强化、逐段精修、逐句精修、
 * 降AI改写）环节，确保各平台各风格。平台定性风格红线统一来自唯一源 platform-benchmarks 的
 * styleMust（由 buildBenchmarkDirective 输出），全链路共用这一份，不再保留第二份手写平台文案。
 *
 * 平台这一维没有标准时【抛错阻断】，不再返回空串或通用网文基准静默继续：
 * 自定义平台的唯一事实源是用户填写的「自定义平台说明」，缺失即未执行标准；
 * generic 等于没选平台，同样不得按通用网文基准冒充该平台标准。
 */
export function buildPlatformStyleDirective(platformKey: string, length?: string, customPlatformNote?: string): string {
  const problem = platformStandardProblem(platformKey, customPlatformNote);
  if (problem === 'custom_note_missing') {
    throw new UnprocessableEntityException(
      '平台执行标准缺失：项目选择「自定义平台」但未填写「自定义平台说明」。系统不掌握该平台基准，标准只能来自这份说明，不能用通用网文基准兜底生成。',
    );
  }
  if (problem === 'unsupported') {
    throw new UnprocessableEntityException('目标平台不是可投稿平台：请选择真实发布平台；规则怪谈属于题材标签，不能充当平台执行标准。');
  }
  if (problem !== null) {
    throw new UnprocessableEntityException(
      '平台执行标准缺失：未选择具体目标平台（generic 等于没选）。平台决定章节字数、节奏与回报基准，不能用通用网文基准兜底生成。',
    );
  }
  if (normalizePlatformId(platformKey) === 'custom') {
    // 中性兜底仅作为手机阅读的通用可读性下限附加，且首行标题必须明说它不是该平台既定基准，
    // 防止它被当成该平台的真实基准（系统并不掌握该平台基准）。
    const neutralFloor = buildBenchmarkDirective('custom', length).split('\n');
    neutralFloor[0] = '【通用可读性底线（不是该平台的既定基准，只是手机阅读通用下限，不得据此推断该平台节奏）】';
    return [
      '【目标平台·自定义平台｜用户声明的平台标准（最高优先级，必须遵守）】',
      '用户填写的「自定义平台说明」是该平台节奏、回报类型、段落与对话区间的唯一事实源：',
      String(customPlatformNote ?? '').trim(),
      ...neutralFloor,
    ].join('\n');
  }
  // 其余平台统一取自 platform-benchmarks 唯一事实源（受众画像 + 长短篇量化基准 + 分发阈值 + 原创红线）。
  return buildBenchmarkDirective(platformKey, length);
}

function plainJsonObject(value: unknown): Record<string, any> {
  try {
    const parsed = JSON.parse(String(value ?? ''));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, any> : {};
  } catch {
    return {};
  }
}

/**
 * 「文风」维内部的定向强化手法（唯一来源）。
 *
 * 这些 key 不是独立的风格维度，也不构成第二套执行标准：平台/分类/基调/文风/流派/视角六维
 * 始终由 resolveProjectStandardDirective 注入。本表只回答一个问题——在【已确认文风之内】，
 * 允许往哪个方向做定向强化，以及这个方向不许越界到哪里。
 *
 * 为什么必须唯一：逐段精修（chain.controller）与逐句精修（describe-polish.service）此前各有一份
 * 词表——一份带边界条款，一份是「诗意/直白/隐喻/感官/情绪」的固定正则替换。后者与项目标准无关，
 * 会把「都市·现实 + 白描/朴素」的正文改成另一种文风。现在两处共用这一份。
 */
export interface StyleIntensityAxis {
  id: string;
  label: string;
  /** 给作者看的一句话说明 */
  description: string;
  /** 注入 prompt 的方向条款：必须显式声明不得越出已确认文风 */
  guide: string;
}

export const STYLE_INTENSITY_AXES: StyleIntensityAxis[] = [
  {
    id: 'standard',
    label: '严格按执行标准',
    description: '不额外定向强化，只按已确认的平台/分类/基调/文风/流派/视角重写这一句',
    guide: '不额外添加任何风格手法：严格按执行标准的「文风」维执行。',
  },
  {
    id: 'poetic',
    label: '诗意',
    description: '加入比喻/拟人/意象，提升文学性',
    guide: '在已确认文风允许的范围内，用更凝练的意象与节奏提升表达；不得把通篇改成诗化文体',
  },
  {
    id: 'direct',
    label: '直白',
    description: '更简洁有力的表达，去掉冗余修饰',
    guide: '在已确认文风允许的范围内，更简洁有力、去掉冗余修饰；不得把文风改成通篇白描',
  },
  {
    id: 'metaphorical',
    label: '隐喻',
    description: '潜台词+暗示，增加深度',
    guide: '在已确认文风允许的范围内，用潜台词与暗示增加层次；不得堆砌比喻或写成玄虚腔',
  },
  {
    id: 'sensory',
    label: '感官增强',
    description: '增加视觉/听觉/触觉/味觉/嗅觉五感描写',
    guide: '在已确认文风允许的范围内，补足与当下动作/心理直接相关的五感细节；不得堆砌无关环境描写',
  },
  {
    id: 'emotional',
    label: '情绪渲染',
    description: '强化角色内心情感波动',
    guide: '在已确认文风允许的范围内，强化情绪落点；不得改变基调或煽情化',
  },
  {
    id: 'suspense',
    label: '悬念',
    description: '增强悬念与信息的延后释放',
    guide: '在已确认文风允许的范围内，增强悬念与信息的延后释放；不得改变事实或新增情节',
  },
];

export function styleIntensityAxis(id: string): StyleIntensityAxis | null {
  return STYLE_INTENSITY_AXES.find((axis) => axis.id === id) ?? null;
}

/** 逐段精修等场景使用的 id → guide 映射，由上面的唯一来源派生，不再在控制器里另列一份。 */
export function styleIntensityGuides(): Record<string, string> {
  return Object.fromEntries(STYLE_INTENSITY_AXES.map((axis) => [axis.id, axis.guide]));
}

/**
 * 把解析好的执行标准压成「可直接放在 prompt 顶部」的标准块。
 * 二次加工入口（降AI改写、逐句精修、模板批量改写）共用这一份拼装，不得各自再拼一套，
 * 否则同一个项目在不同按钮下会得到口径不同的「执行标准」。
 */
export function projectStandardBlock(standard: ProjectStandardDirective): string {
  return [
    standard.directive,
    standard.categoryPlacement ? `【平台分类落位】${standard.categoryPlacement}` : '',
    standard.categoryBrief ? `【平台分类口径】${standard.categoryBrief}` : '',
    `【本次改写依据】平台=${standard.platformLabel}｜题材标签=${standard.styleTags.join('、') || '(未标注)'}｜篇幅=${standard.isLong ? '长篇' : '短篇'}`,
  ].filter(Boolean).join('\n') + '\n\n';
}

export interface ProjectStandardDirective {
  /** 项目 id：二次加工入口必须回传它，用于把结果标注回同一份执行标准来源 */
  projectId: string;
  /** 可直接插入 prompt 顶部：目标平台与风格定位 + 六维执行标准 + 长短篇差异 + 创作宪法 */
  directive: string;
  constitution: CreativeConstitution;
  /** 长篇 / 短篇：平台基准与节奏差异按它选，避免长短篇合并区间 */
  isLong: boolean;
  /** 平台显示名；自定义平台取用户填写的说明，不得用通用平台 label 冒充 */
  platformLabel: string;
  /** 创建前确认的题材标签（confirmed_story.styleTags），不在宪法 schema 里，单独带回 */
  styleTags: string[];
  /** 平台投稿分类落位的一句话口径；平台未建模分类树时为 '' */
  categoryPlacement: string;
  /** 该平台分类的官方定义与头部标签口径；未采集时为 ''（不得编造） */
  categoryBrief: string;
}

/**
 * 执行标准唯一解析入口（服务端）。
 *
 * 所有会产出或改写正文的入口——主生成链、开头强化、反转强化、逐段精修、逐句精修、
 * 降AI改写、精修模板批量改写——都必须经此解析，不得各自读一遍项目再拼一套口径。
 * 只有这样，「项目卡片上选定的 平台/分类/基调/文风/流派/视角」才是同一条执行标准，
 * 而不是每个按钮一套自己的风格词表。
 *
 * 三种失败一律抛出、绝不静默回落：缺 projectId → 400，项目不存在 → 404，六维未齐备 → 422。
 */
export function resolveProjectStandardDirective(db: DatabaseSync, projectId: string): ProjectStandardDirective {
  const id = String(projectId ?? '').trim();
  // 没有 projectId 就解析不出执行标准：这不是「无平台配置」，是前提缺失，必须暴露。
  if (!id) {
    throw new BadRequestException('执行标准解析失败：缺少 projectId，无法解析平台/分类/基调/文风/流派/视角标准');
  }
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
  // 项目不存在时不得返回空标准：空标准会让正文在没有任何平台/基调约束下继续生成。
  if (!row) throw new NotFoundException(`执行标准解析失败：项目不存在 ${id}`);
  const constitution = readConstitution(row);
  const missing = missingConstitutionStandards(constitution);
  if (missing.length > 0) {
    throw new UnprocessableEntityException(
      `执行标准未齐备：${missing.map(item => item.label).join('、')}缺失（项目 ${id}）。框架层与正文层都必须按这六维执行，不能用默认值或平台推荐静默补齐。`,
    );
  }
  // 创建前确认的「题材标签」（confirmed_story.styleTags）不在创作宪法 schema 里，
  // 此前完全丢失：模型只拿到基调/文风/流派，却看不到用户选定并被确认过的具体题材标签，
  // 于是文章容易偏离创建时选定的平台/标签定位。这里补注入。
  const confirmedStory = plainJsonObject(row.confirmed_story);
  const styleTags = Array.isArray(confirmedStory.styleTags)
    ? confirmedStory.styleTags.map((t: any) => String(t).trim()).filter(Boolean)
    : [];
  const isLong = constitution.projectType === 'long_novel';
  const isCustomPlatform = String(constitution.targetPlatform ?? '').trim() === 'custom';
  const platformLabel = isCustomPlatform
    ? String(constitution.customPlatformNote ?? '').trim()
    : getPlatform(constitution.targetPlatform).label;
  // 长短篇在解析平台基准时即精确传入，让正文拿到对应体量的对话/段落/字数区间，而非长短篇合并区间。
  const platformDirective = buildPlatformStyleDirective(
    constitution.targetPlatform,
    isLong ? 'long_novel' : 'short_story',
    constitution.customPlatformNote,
  );
  // 执行标准唯一来源：正文层、框架层与二次加工层共用 buildExecutionStandard，不再各自另拼一份。
  const bodyStandard = buildExecutionStandard(constitution, { styleTags });
  const toneDirective = `${bodyStandard.directive}以下内容的节奏、人物动机、冲突设计、语言风格都必须体现这一定位。`;
  const lengthNote = isLong
    ? '【本作为长篇】平台风格需体现世界观纵深、分卷节奏、长线伏笔与人物弧光；爽点可持续累积，不必每章密集打脸。'
    : '【本作为短篇】平台风格需体现在有限篇幅内的高密度冲突、即时反转与情绪闭环；每1000字必须有钩子或爽点，结尾必须兑现开篇问题。';
  const directive = '【目标平台与风格定位 · 最高优先级，必须贯穿本次全部生成内容】\n'
    + (platformDirective ? platformDirective + '\n' : '')
    + (toneDirective ? toneDirective + '\n' : '')
    + lengthNote + '\n【项目创作宪法】\n' + JSON.stringify(constitution) + '\n\n';

  // 分类落位与平台口径一并带回：作者必须能看见「这次改写是在哪个平台分类下执行的」，
  // 否则按钮给出的结果与项目卡片上的标准对不上，用户无从判断。
  const categoryResolution = resolveSubmissionCategory(
    constitution.targetPlatform,
    constitution.category,
    constitution.projectType,
    audienceChannelHint(constitution.targetAudience),
  );
  const resolvedCategory = categoryResolution.status === 'resolved' ? categoryResolution.value : null;

  return {
    projectId: id,
    directive,
    constitution,
    isLong,
    platformLabel,
    styleTags,
    categoryPlacement: resolvedCategory ? describeCategoryPlacement(platformLabel, resolvedCategory) : '',
    categoryBrief: resolvedCategory ? platformCategoryWritingBrief(constitution.targetPlatform, resolvedCategory, constitution.projectType) : '',
  };
}
