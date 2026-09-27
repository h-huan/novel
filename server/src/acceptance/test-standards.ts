/**
 * 验收 fixture 的【执行前提】：平台/分类/基调/文风/流派/视角 六维（唯一维度清单见
 * shared/src/execution-standard-dimensions.ts，这里不再手写第二份维度名单）。
 *
 * 这些字段是用户在项目卡片上选定的执行标准。缺任一项，质量 Gate 都会以
 * “创作宪法未设置X：属未执行标准，必须补齐后才能继续”直接阻断
 * （见 creative-constitution.ts 的 MISSING_STANDARD_DIMENSIONS）。
 *
 * 验收用例各自验证的是别的行为，所以必须显式给出完整前提：不能让缺项把用例
 * 拦在 Gate 之前，那会掩盖用例真正要断言的东西。
 * 取值一律来自 story-dict 的字典标签，与真实项目保持一致。
 */
import { platformCategoryMetric } from '../../shared/src';

export interface StandardPreconditions {
  targetPlatform: string;
  category: string;
  storyTone: string[];
  writingStyle: string[];
  webNovelGenre: string[];
  submissionTags: string[];
  genreFitNote: string;
  pov: string;
  /**
   * 目标总字数 —— 它不是七维之外的新维度，而是「分类」维的体量判据输入：
   * 执行标准要求目标总字数落在该平台分类的头部实测区间内，否则判「分类」维未执行。
   * 不在这里给出，用例就会以 platform.category_word_scale_unset 被拦在 Gate 之前，
   * 掩盖用例真正要断言的东西 —— 与本文件开头写的「必须显式给出完整前提」同一条道理。
   */
  targetWords: number;
}

// 唯一数据源直取：以前这里手抄了一份 PLATFORM_CATEGORY_METRICS 的 min=461658，
// 于是 shared 一更新、验收前提就悄悄漂移，而用例还在“通过”。同一种“第二份数字”的坑。
// 取不到就抛错而不是回退常量——回退会让验收用错误前提继续跑。
const fanqieUrbanDaily = platformCategoryMetric('fanqie', '男频', '都市日常');
if (!fanqieUrbanDaily) {
  throw new Error('验收前提缺少 shared 的 PLATFORM_CATEGORY_METRICS.fanqie 男频·都市日常 实测体量');
}

export const STANDARD_PRECONDITIONS: StandardPreconditions = {
  targetPlatform: 'fanqie',
  category: '都市·现实',
  storyTone: ['热血'],
  writingStyle: ['白描/朴素'],
  webNovelGenre: ['系统流'],
  submissionTags: ['都市'],
  genreFitNote: '系统机制服务都市日常中的职业选择与人物关系，逐章兑现',
  pov: '第三人称限知',
  // 番茄 男频·都市日常（「都市·现实」归位到它）头部实测区间的下限，直取 shared 唯一数据源。
  // 取下限而非中位数：只要判据是「落在区间内」，下限就是离任何取舍最近的那个合规值。
  targetWords: fanqieUrbanDaily.min,
};
