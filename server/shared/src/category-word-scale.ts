/**
 * 分类体量判据（目标总字数 vs 该平台分类的头部实测区间）—— 前后端唯一一份。
 *
 * 执行标准对「分类」维的体量判据是：目标总字数必须落在该平台分类的头部实测区间内，
 * 或在项目卡片上写明与该分类体量分布不符的取舍依据（标准原文：「确有取舍必须写在项目卡片上」）。
 *
 * 为什么必须只有一份：这条判据此前有四个各自为政的落点 ——
 *   1) 后端质量 Gate（platform-quality-rules 的 platform.category_word_scale*）
 *   2) 执行标准提示词（buildExecutionStandard 的 category 维）
 *   3) 创建入口 / 生成入口的字数检查（只认一个裸区间，没有分类锚点）
 *   4) 前端 targetWordsVerdict / targetWordsBlockingReason
 * 四处措辞与口径各写一遍，后果是：作者在项目卡片上写了取舍依据，前端提示认识它、
 * 后端判据不认识它，于是「按标准声明了偏离」的书照样在生成末尾被 Gate 拦下并回滚精修
 * （platform.category_word_scale 是项目卡片级问题，正文精修永远改不动它），每章白烧一次 LLM 调用。
 * 现在统一到这一份：前端、创建入口、生成入口、质量 Gate 都调它，阈值也只有这一个。
 *
 * 状态一律不得降级：
 *   - within              目标总字数落在实测区间内 -> 判据满足。
 *   - deviation_declared  落在区间外，但项目卡片写明了取舍依据 -> 这是执行标准自己给出的合规路径，
 *                         判据满足。语义化阈值兜底，禁止用一个字或空话绕过。
 *   - unset / out_of_range -> 判据未满足，必须阻断。
 *   - no_metric           该平台该分类未采集实测体量 -> 不产出判据（缺失即缺失），
 *                         不得拿别的平台/别的分类的区间顶上，也不得声称已核验。
 *   - 成稿单元不符        同样不产出判据，但必须如实写明原因：番茄的实测来自【连载长篇】榜单，
 *                         短篇（短故事）是另一条产品线、尚未采集。把长篇区间套到短篇上，
 *                         本质上就是「拿别的口径顶上」，会让每一本合规短篇在生成末尾被判未达标准。
 */
import { formatCategoryWordScale, platformCategoryMetric, platformCategoryMetricTable, resolvePlatformCategory } from './platform-categories';
import type { PlatformCategoryMetric, PlatformCategoryMetricUnit, ResolvedPlatformCategory } from './platform-categories';

/** 取舍依据的最少字数：低于它就不是「说明」，是占位符。前后端共用这一个阈值，不得各写一份。 */
export const CATEGORY_WORD_SCALE_DEVIATION_MIN_CHARS = 10;

export type CategoryWordScaleStatus = 'no_metric' | 'unset' | 'within' | 'deviation_declared' | 'out_of_range';

export interface CategoryWordScaleStanding {
  status: CategoryWordScaleStatus;
  /** 该平台该分类的头部实测区间；null = 未核验（不得编造，也不得套用别的分类）。 */
  metric: PlatformCategoryMetric | null;
  /** 归位到的平台投稿分类；null = 未归位（未归位时没有分类级体量判据）。 */
  resolved: ResolvedPlatformCategory | null;
  targetWords: number;
  /** 作者写在项目卡片上的取舍依据（原样返回，未加工）。 */
  deviation: string;
  /** 口径实测的成稿单元（连载长篇 / 短篇）；null = 本项目没有适用口径（未归位 / 未采集 / 单元不符）。 */
  measureUnit: PlatformCategoryMetricUnit | null;
  /**
   * 口径与本项目成稿单元不符时的如实说明（如：本项目是短篇，而实测来自连载长篇榜单）。
   * null = 不存在不符。非 null 时判据不产出，但必须显式告知，不得静默通过。
   */
  unitMismatch: string | null;
}

/**
 * 判据入参：刻意只收这几个字段，前端 ExecutionStandardsValue 与后端 CreativeConstitution
 * 都能原样传进来。targetWords 允许字符串：前端用空串表示「未设定」，Number('') = 0 会被判 unset，
 * 与后端未设定同解 —— 不用 0、不用平台推荐兜底。
 */
export interface CategoryWordScaleInput {
  targetPlatform?: unknown;
  category?: unknown;
  targetAudience?: unknown;
  /**
   * 成稿单元（projectType：long_novel / short_story）。判据据此确认「这份实测适不适用」——
   * 番茄实测来自连载长篇榜单，套到短篇上就是拿别的口径顶上。空值按「未知即从严」处理：
   * 不放开判据，避免调用方漏传字段时静默通过。
   */
  projectType?: unknown;
  targetWords?: unknown;
  categoryWordScaleDeviation?: unknown;
}

/**
 * 目标读者兼作频道提示（男频/女频）。
 * targetAudience 在创作宪法里是 unknown（历史数据有 string 也有 array），必须先收敛成字符串
 * 再交给分类归位：同一个分类名横跨男频/女频时，靠它选中正确的那个频道。收敛不到就返回 null，
 * 归位退回平台展示顺序 —— 不得由这里编造一个频道。
 */
export function audienceChannelHint(value: unknown): string | null {
  const raw = Array.isArray(value) ? value.map((v) => String(v)).join('、') : (typeof value === 'string' ? value : '');
  const text = raw.trim();
  return text ? text : null;
}

export function categoryWordScaleStanding(input: CategoryWordScaleInput): CategoryWordScaleStanding {
  const platform = String(input.targetPlatform ?? '');
  const projectType = String(input.projectType ?? '').trim();
  const targetWords = Number(input.targetWords);
  const deviation = String(input.categoryWordScaleDeviation ?? '').trim();
  const base = { metric: null, resolved: null, targetWords, deviation, measureUnit: null, unitMismatch: null } as CategoryWordScaleStanding;
  const category = String(input.category ?? '').trim();
  if (!category) return { ...base, status: 'no_metric' };
  const resolution = resolvePlatformCategory(platform, category, audienceChannelHint(input.targetAudience));
  if (resolution.status !== 'resolved') return { ...base, status: 'no_metric' };
  const table = platformCategoryMetricTable(platform);
  const measureUnit = table ? table.measureUnit : null;
  const metric = platformCategoryMetric(platform, resolution.value.channel, resolution.value.platformGroup);
  if (!metric) return { ...base, resolved: resolution.value, measureUnit, status: 'no_metric' };
  // 成稿单元不符：本项实测不适适用于本项目。不产出判据，但把原因写明（缺失即缺失，不得顶替）。
  // projectType 为空按「未知即从严」——继续用本表口径判定，避免漏传字段静默通过。
  if (measureUnit && projectType && measureUnit !== projectType) {
    const unitLabel = measureUnit === 'long_novel' ? '连载长篇' : '短篇';
    const selfLabel = projectType === 'long_novel' ? '连载长篇' : '短篇';
    return {
      ...base,
      resolved: resolution.value,
      measureUnit,
      status: 'no_metric',
      unitMismatch: '本项目是' + selfLabel + '，而「' + resolution.value.channel + '·' + resolution.value.platformGroup
        + '」的实测体量来自' + unitLabel + '榜单（' + (table ? table.source + '，采集于 ' + table.capturedAt : '来源见口径表')
        + '），' + selfLabel + '的分类体量基准尚未采集 —— 分类体量判据在本项目上没有适用口径，'
        + '不得拿' + unitLabel + '的区间当' + selfLabel + '的标准，也不得据此判定本项目未达标准',
    };
  }
  const withMetric: CategoryWordScaleStanding = { ...base, metric, resolved: resolution.value, measureUnit };
  if (!Number.isFinite(targetWords) || targetWords <= 0) return { ...withMetric, status: 'unset' };
  if (targetWords >= metric.min && targetWords <= metric.max) return { ...withMetric, status: 'within' };
  if (deviation.length >= CATEGORY_WORD_SCALE_DEVIATION_MIN_CHARS) return { ...withMetric, status: 'deviation_declared' };
  return { ...withMetric, status: 'out_of_range' };
}

/** 判据是否未满足（必须阻断）。within / deviation_declared / no_metric 都不阻断。 */
export function categoryWordScaleBlocked(standing: CategoryWordScaleStanding): boolean {
  return standing.status === 'unset' || standing.status === 'out_of_range';
}

function categoryWordScalePlace(standing: CategoryWordScaleStanding): string {
  return standing.resolved ? '「' + standing.resolved.channel + '·' + standing.resolved.platformGroup + '」' : '该平台分类';
}

/** 执行标准「分类」维里的体量现状一句话，随状态如实描述，不含糊其辞。 */
export function categoryWordScaleLine(standing: CategoryWordScaleStanding): string {
  if (!standing.metric) return standing.unitMismatch ? '；' + standing.unitMismatch : '';
  const scale = formatCategoryWordScale(standing.metric);
  const place = categoryWordScalePlace(standing);
  const targetWan = (standing.targetWords / 10000).toFixed(1) + ' 万';
  if (standing.status === 'unset') {
    return '；本项目体量判据当前未满足：尚未设定目标总字数，无法对照' + place + '的头部实测区间（' + scale + '），必须填写目标总字数，或在项目卡片「分类体量取舍依据」写明刻意偏离的取舍依据';
  }
  if (standing.status === 'within') {
    return '；本项目目标总字数 ' + standing.targetWords + ' 字（' + targetWan + '）落在' + place + '的头部实测区间（' + scale + '）内，体量判据已满足';
  }
  if (standing.status === 'deviation_declared') {
    return '；本项目目标总字数 ' + standing.targetWords + ' 字（' + targetWan + '）刻意偏离' + place + '的头部实测区间（' + scale + '）；作者已在项目卡片写明取舍依据：' + standing.deviation
      + ' —— 判据按「已声明偏离」放行，但框架层与正文层的体量安排必须与该取舍依据一致，不得写完声明又按别的体量写';
  }
  const where = standing.targetWords < standing.metric.min ? '低于' : '高于';
  return '；本项目目标总字数 ' + standing.targetWords + ' 字（' + targetWan + '）' + where + place + '的头部实测区间（' + scale + '），且项目卡片未写明取舍依据 —— 体量判据未满足，必须调整目标总字数，或补齐「分类体量取舍依据」';
}

/**
 * 体量判据未满足时的统一阻断文案。
 * 创建入口、生成入口、质量 Gate、前端提示四处共用这一句：同一件事各写一套措辞，
 * 作者就会在两套说法之间来回猜「到底哪里没填对」。
 * 判据本体只收 standing，不再收创作宪法 —— 它本来就没用到那个参数，收着只会让人以为还有第二份口径。
 */
export function categoryWordScaleMessage(
  standing: CategoryWordScaleStanding,
  platformDisplay: string,
): string {
  const scale = standing.metric ? formatCategoryWordScale(standing.metric) : '（未核验）';
  const place = platformDisplay + categoryWordScalePlace(standing);
  const fallback = '；属未执行标准，必须把目标总字数调整到该区间内，或在项目卡片「分类体量取舍依据」写明与该分类体量分布不符的取舍依据（不少于 ' + CATEGORY_WORD_SCALE_DEVIATION_MIN_CHARS + ' 字，不得用空话或默认值兜底）。';
  if (standing.status === 'unset') {
    return '本书未设定目标总字数，无法对照' + place + '的头部实测区间（' + scale + '）' + fallback;
  }
  const where = standing.targetWords < (standing.metric?.min ?? 0) ? '低于' : '高于';
  return '本书目标总字数 ' + standing.targetWords + ' 字（' + (standing.targetWords / 10000).toFixed(1) + ' 万）' + where
    + place + '的头部实测区间（' + scale + '）' + fallback;
}