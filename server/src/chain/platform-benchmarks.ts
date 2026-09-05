/**
 * platform-benchmarks.ts — 全平台唯一事实源（Single Source of Truth）
 *
 * 一个平台 = 一个对象，同时承载：
 *   A. 节奏/回报画像（pacing / hookStrength / payoffRange / burstGap / preferredPayoffs / titleStrategies / guide）
 *   B. 受众画像（audience：人群/年龄/性别/场景/耐心线）
 *   C. 长短篇分别的可量化文本基准（short / long：对话占比、段落厚度、开篇钩子、回报密度、章尾钩子、章节字数）
 *   D. 分发阈值（distribution）与原创红线（original）
 *
 * 历史教训：平台知识曾散在三处——novel-strategy.ts(节奏画像)、novel-strategy.service.ts(复制且未接线)、
 * chain.controller.buildPlatformStyleDirective(只覆盖6平台的定性文案)。现已全部合并到本文件并删除冗余：
 *   - 生成端：buildBenchmarkDirective() 注入全链路 prompt；resolveNovelStrategy() 供硬红线扫描选阈值。
 *   - 看板/质检：measureAgainstTarget() 做“当前值 vs 平台基准”的确定性对照（不调 LLM）。
 * 禁止再在别处硬编码第二套平台数值或文案。
 *
 * 数值来源：番茄官方作家专区/行业公开拆解（2025-2026）+ 平台读者调研，属【行业经验基线】；
 * module-standards 自归纳产出更贴合本平台数据的阈值时，在调用层覆盖，不改死这里。
 * 章节字数与系统口径一致（短篇 1500-8000、长篇 3200-4000，书级 settings.chapterWordRange 优先）。
 */

// ───────────────────────── 类型：平台枚举与节奏画像 ─────────────────────────

export type PlatformId =
  | 'zhihu' | 'fanqie' | 'qidian' | 'douyin' | 'qimao'
  | 'xiaohongshu' | 'jinjiang' | 'rules_horror' | 'generic';

export type ReaderPayoffKind =
  | 'victory' | 'reversal' | 'reveal' | 'emotional_release' | 'relationship_shift'
  | 'crisis_escalation' | 'foreshadow_payoff' | 'world_discovery'
  | 'competence_display' | 'expectation_hook';

export interface PayoffRange { min: number; max: number }

export interface StoryStrategyInput {
  platform?: string;
  storyType?: string;
  storyCategory?: string;
  storyTone?: string[];
  writingStyle?: string[];
  webNovelGenre?: string[];
}

// ───────────────────────── 类型：受众 / 量化基准 / 分发 ─────────────────────────

export interface AudienceProfile {
  core: string;   // 核心人群（人话）
  age: string;    // 年龄结构
  gender: string; // 性别倾向
  scene: string;  // 阅读场景
  patience: string;// 耐心/去留线
}

export interface DistributionProfile {
  first3FinishRate: number | null; // 进算法第一波推荐的前三章完读率经验阈值
  note: string;                    // 分发逻辑，人话
}

export interface TextMetricTarget {
  dialogueRatio: [number, number]; // 对话字数/叙事总字数 建议区间
  avgParaCharsMax: number;         // 平均段落字数上限
  longParaChars: number;           // 单段超过即“长段”
  longParaRatioMax: number;        // 长段占比上限
  openingHookChars: number;        // 开篇多少字内必须有钩子/冲突
  payoffGapChars: [number, number];// 多少字一次有效回报/反转
  endingHook: boolean;             // 章尾是否必须留钩
  shortParagraph: boolean;         // 是否倾向短句意群成段
  chapterWords: [number, number];  // 章节字数区间（系统口径）
}

export interface PlatformProfile {
  id: PlatformId;
  label: string;
  // A. 节奏/回报画像
  pacing: 'high' | 'very_high';
  hookStrength: 'medium' | 'high' | 'very_high';
  payoffRange: PayoffRange;
  burstGap: { min: number; max: number };
  allowSoftPayoff: boolean;
  preferredPayoffs: ReaderPayoffKind[];
  titleStrategies: string[];
  guide: string;
  // 平台定性风格红线（跨长短篇一致）：量化基准管不了的"该平台必须/不许"的写法倾向，
  // 例如番茄"爽点明面兑现、主角不憋屈"。统一从这里注入，禁止再在 controller 另写第二份平台文案。
  styleMust?: string[];
  // B/C/D
  audience: AudienceProfile;
  distribution: DistributionProfile;
  short: TextMetricTarget;
  long: TextMetricTarget;
  original: string;
}

export type ResolvedNovelStrategy = PlatformProfile & {
  version: 1;
  storyType: string;
  storyCategory: string;
  tags: string[];
};

const S = (
  dialogueRatio: [number, number],
  avgParaCharsMax: number,
  longParaChars: number,
  longParaRatioMax: number,
  openingHookChars: number,
  payoffGapChars: [number, number],
  endingHook: boolean,
  shortParagraph: boolean,
  chapterWords: [number, number],
): TextMetricTarget => ({
  dialogueRatio, avgParaCharsMax, longParaChars, longParaRatioMax,
  openingHookChars, payoffGapChars, endingHook, shortParagraph, chapterWords,
});

// ───────────────────────── 唯一平台表 ─────────────────────────

export const PLATFORMS: Record<PlatformId, PlatformProfile> = {
  fanqie: {
    id: 'fanqie', label: '番茄小说',
    pacing: 'very_high', hookStrength: 'very_high',
    payoffRange: { min: 2, max: 3 }, burstGap: { min: 2, max: 4 }, allowSoftPayoff: false,
    preferredPayoffs: ['victory', 'reversal', 'reveal', 'competence_display', 'expectation_hook'],
    titleStrategies: ['身份反差', '迫近代价', '结果前置', '利益冲突', '强悬念', '极端处境'],
    guide: '高节奏、高追读、高反馈。尽快进入核心事件，持续推进冲突与收益兑现；允许短蓄力，但不能连续多章只有铺垫。',
    audience: {
      core: '下沉市场为主，追求“爽感直给、秒懂、上头”，对慢热和复杂设定容忍度低',
      age: '以 28 岁以下年轻读者为主',
      gender: '女性约占六成，男频战神/神医/玄幻与女频婚恋逆袭并存',
      scene: '通勤、睡前等碎片时间，手机划屏快速阅读',
      patience: '约 3 秒、开篇约七行决定去留；前三章流失普遍过半',
    },
    distribution: { first3FinishRate: 0.45, note: '算法赛马：前三章完读率高（经验阈值约 45%）才进下一波推荐，开篇即生死' },
    short: S([0.35, 0.65], 45, 90, 0.15, 300, [400, 600], true, true, [1500, 8000]),
    long: S([0.30, 0.55], 55, 110, 0.20, 500, [600, 900], true, true, [3200, 4000]),
    styleMust: [
      '爽点必须写到明面：打脸/反转/身份反差/结果兑现用旁观者反应、对手变脸、结果落定直接呈现；本条优先级高于通用“白描/克制/去戏剧化”基准，禁止用留白把爽点写没',
      '前三章主角不许纯受气，每章至少一次主角的主动、反击、掌控或亮牌',
      '专业设定与术语用下沉读者秒懂的口语带出，不堆未解释名词',
    ],
    original: '只借鉴平台节奏与结构，禁止照搬任何在榜作品的人物、设定、桥段与原文；金手指/反差身份必须是原创组合。',
  },
  qimao: {
    id: 'qimao', label: '七猫小说',
    pacing: 'very_high', hookStrength: 'very_high',
    payoffRange: { min: 2, max: 3 }, burstGap: { min: 2, max: 4 }, allowSoftPayoff: false,
    preferredPayoffs: ['victory', 'relationship_shift', 'reversal', 'reveal', 'expectation_hook'],
    titleStrategies: ['利益冲突', '身份反差', '关系爆点', '迫近代价', '强悬念'],
    guide: '高推进、高反馈，免费短章节奏，尽快进入事件、章章有推进与钩子，重点保证冲突与人物目标不断发生变化，不得用重复打脸替代真正的剧情升级。',
    audience: {
      core: '免费阅读、下沉市场，偏好强冲突、快推进、情绪直给，拒绝重复水字数',
      age: '中青年为主，覆盖较广',
      gender: '女频婚恋/家长里短与男频爽文并重',
      scene: '碎片化免费阅读，靠广告分成，读完率重要',
      patience: '开篇几百字内要见冲突，连续铺垫极易划走',
    },
    distribution: { first3FinishRate: 0.45, note: '免费流量分发，完读与追更权重高，冲突升级不能靠重复打脸凑数' },
    short: S([0.35, 0.60], 45, 90, 0.15, 300, [450, 700], true, true, [1500, 8000]),
    long: S([0.30, 0.55], 55, 110, 0.20, 500, [650, 950], true, true, [3200, 4000]),
    styleMust: [
      '开篇前300字直接进冲突/反常/危机，背景后移并用动作对话带出',
      '主角不憋屈，每章至少一次主动掌控或反击；冲突升级靠新信息/新局面，不靠重复打脸',
    ],
    original: '冲突模型可参考类型规律，但人物关系链与事件必须原创，禁止洗稿/换皮在榜文。',
  },
  qidian: {
    id: 'qidian', label: '起点中文网',
    pacing: 'high', hookStrength: 'high',
    payoffRange: { min: 1, max: 3 }, burstGap: { min: 2, max: 5 }, allowSoftPayoff: true,
    preferredPayoffs: ['world_discovery', 'competence_display', 'reveal', 'victory', 'foreshadow_payoff'],
    titleStrategies: ['世界观奇点', '核心能力', '身份变化', '目标冲突', '强悬念', '成长承诺'],
    guide: '保持网文追读速度，同时允许世界观、成长线和长期伏笔蓄力；章节必须有有效推进或读者回报，但不要求每章都以同一种爽点兑现。',
    audience: {
      core: '核心网文读者，重世界观自洽、成长弧光、设定新颖与长线伏笔，能接受适度铺垫',
      age: '以男性读者为主，年龄层略高于番茄',
      gender: '男频为主（玄幻/仙侠/都市/科幻）',
      scene: '长时间沉浸式追更，愿意为设定与体系停留',
      patience: '可接受黄金三章内铺陈，但第一章仍要抛出核心奇点或目标',
    },
    distribution: { first3FinishRate: null, note: '长线精品，签约/推荐看设定新颖度与稳定更新，允许蓄力但不能停滞' },
    short: S([0.25, 0.50], 70, 150, 0.32, 600, [800, 1300], true, false, [1500, 8000]),
    long: S([0.25, 0.50], 75, 160, 0.35, 800, [900, 1500], true, false, [3200, 4000]),
    styleMust: [
      '以世界观纵深、成长弧光与伏笔回收兑现回报，允许蓄力但每章必须有可感知进展，不原地踏步',
    ],
    original: '世界观体系、金手指规则与力量阶梯必须原创自洽，严禁套用知名作品的专有设定与名场面。',
  },
  zhihu: {
    id: 'zhihu', label: '知乎盐选',
    pacing: 'high', hookStrength: 'very_high',
    payoffRange: { min: 1, max: 3 }, burstGap: { min: 2, max: 4 }, allowSoftPayoff: true,
    preferredPayoffs: ['reveal', 'reversal', 'relationship_shift', 'emotional_release', 'expectation_hook'],
    titleStrategies: ['秘密悬念', '关系反差', '结果前置', '身份反差', '迫近代价', '纪实疑问'],
    guide: '强调现实感、代入感、关系冲突和信息差。尽快建立核心问题，持续给出新信息、关系变化或反转，避免空转。',
    audience: {
      core: '偏好现实感、复杂人性、信息差与“第一人称亲历”，反转必须建立在事实线索上',
      age: '一二线城市、认知门槛较高',
      gender: '女性略多，悬疑/情感/现实题材为主',
      scene: '被一个问题/钩子吸引后沉浸式读完，重“可信”与“后劲”',
      patience: '开头三句就要定调立悬念，但能接受成段心理与推理',
    },
    distribution: { first3FinishRate: null, note: '盐选专栏靠开篇钩子与完读付费，去戏剧化、重逻辑闭环' },
    short: S([0.20, 0.45], 70, 140, 0.30, 200, [700, 1100], true, false, [1500, 8000]),
    long: S([0.20, 0.45], 75, 150, 0.32, 300, [900, 1400], true, false, [3200, 4000]),
    styleMust: [
      '坚持第一人称纪实感与白描克制，去戏剧化、重信息差与逻辑闭环，不靠强行打脸制造爽感',
    ],
    original: '现实题材也要人物与案件原创，禁止编造“真实经历”影射真人、禁止套用盐选爆款模板换皮。',
  },
  douyin: {
    id: 'douyin', label: '抖音故事',
    pacing: 'very_high', hookStrength: 'very_high',
    payoffRange: { min: 2, max: 4 }, burstGap: { min: 1, max: 3 }, allowSoftPayoff: false,
    preferredPayoffs: ['reversal', 'victory', 'reveal', 'crisis_escalation', 'expectation_hook'],
    titleStrategies: ['结果前置', '极端处境', '迫近代价', '强反差', '规则危机', '关系爆点'],
    guide: '极高信息密度和情绪密度，快速进入冲突，短周期兑现，结尾持续制造下一步观看理由。',
    audience: {
      core: '短视频用户外溢，强情绪、快反转、可口播，前 200 字定生死',
      age: '覆盖广、偏年轻',
      gender: '情感/逆袭/悬疑短剧向，男女均有',
      scene: '信息流里被动刷到，必须瞬间抓住',
      patience: '约 200 字、甚至第一屏就要有冲突或反常',
    },
    distribution: { first3FinishRate: 0.5, note: '信息流赛马，完播/读完率极关键，信息与情绪密度要高' },
    short: S([0.40, 0.70], 35, 70, 0.10, 200, [300, 500], true, true, [1500, 8000]),
    long: S([0.35, 0.65], 40, 80, 0.12, 300, [450, 700], true, true, [3200, 4000]),
    styleMust: [
      '前200字定生死，冲突直给、情绪外放、适合口播；约每500字一个小反转或新信息，结尾持续制造下一步观看理由',
    ],
    original: '短剧化节奏可学，故事核与反转链必须原创，禁止搬运短剧/网文剧情。',
  },
  xiaohongshu: {
    id: 'xiaohongshu', label: '小红书故事',
    pacing: 'very_high', hookStrength: 'very_high',
    payoffRange: { min: 1, max: 3 }, burstGap: { min: 1, max: 3 }, allowSoftPayoff: true,
    preferredPayoffs: ['emotional_release', 'relationship_shift', 'reversal', 'reveal', 'expectation_hook'],
    titleStrategies: ['身份反差', '关系爆点', '情绪承诺', '结果前置', '强悬念', '极端处境'],
    guide: '第一人称生活化代入、强情绪共鸣、口语化短章；开篇即抛冲突或反常，段落短、对话多，靠情绪起伏和关系变化推动，结尾留共鸣或反转钩子。',
    audience: {
      core: '女性为主，第一人称生活化代入、强情绪共鸣、真实细节与“我也是这样”',
      age: '年轻女性、都市白领与学生',
      gender: '女性占绝大多数',
      scene: '刷笔记式轻阅读，重情绪价值与金句',
      patience: '开头即抛冲突或反常，短段口语，情绪要快起',
    },
    distribution: { first3FinishRate: null, note: '靠共鸣、收藏与评论扩散，真实感与情绪浓度优先' },
    short: S([0.30, 0.55], 40, 80, 0.12, 300, [400, 700], true, true, [1500, 8000]),
    long: S([0.28, 0.52], 48, 95, 0.16, 400, [600, 900], true, true, [3200, 4000]),
    styleMust: [
      '生活化第一人称、真实细节密、情绪共鸣强，段落收尾可用一句有共鸣的金句，但不堆辞藻',
    ],
    original: '情绪母题可共鸣，经历与细节必须原创，禁止伪造素人经历、禁止照搬热帖。',
  },
  jinjiang: {
    id: 'jinjiang', label: '晋江文学城',
    pacing: 'high', hookStrength: 'high',
    payoffRange: { min: 1, max: 3 }, burstGap: { min: 2, max: 5 }, allowSoftPayoff: true,
    preferredPayoffs: ['relationship_shift', 'emotional_release', 'reveal', 'foreshadow_payoff', 'expectation_hook'],
    titleStrategies: ['关系张力', '身份错位', '情绪承诺', '秘密悬念', '人物目标', '世界观奇点'],
    guide: '保持较强追读，同时把人物关系、情绪推进和角色弧作为主要回报来源，不强迫每章都用战力或打脸式爽点。',
    audience: {
      core: '女性向，重人物关系、情绪拉扯、潜台词与角色弧，允许细腻但不许原地踏步',
      age: '以年轻女性为主，黏性高',
      gender: '女性占绝大多数',
      scene: '追文/养文，重感情线与人物魅力',
      patience: '比番茄能容细腻描写，但关系与情绪必须持续推进',
    },
    distribution: { first3FinishRate: null, note: '看人物魅力与感情线推进，文笔与潜台词加分，但拒绝拖沓' },
    short: S([0.30, 0.55], 65, 130, 0.28, 500, [700, 1200], true, false, [1500, 8000]),
    long: S([0.30, 0.55], 68, 135, 0.30, 600, [800, 1300], true, false, [3200, 4000]),
    styleMust: [
      '以人物关系拉扯、情绪推进与人设魅力为主要回报，台词留潜台词，不套战力/打脸式爽点',
    ],
    original: '人设与感情线模式可类型化，具体人物、关系与桥段必须原创，严禁融梗/撞梗知名作品。',
  },
  rules_horror: {
    id: 'rules_horror', label: '规则怪谈',
    pacing: 'very_high', hookStrength: 'very_high',
    payoffRange: { min: 1, max: 3 }, burstGap: { min: 2, max: 4 }, allowSoftPayoff: false,
    preferredPayoffs: ['reveal', 'reversal', 'crisis_escalation', 'foreshadow_payoff', 'expectation_hook'],
    titleStrategies: ['危险规则', '异常现象', '倒计时代价', '身份谜团', '场景禁忌', '未解悬念'],
    guide: '高悬念、高信息差。持续通过规则验证、异常升级和真相揭露推进，不把所有回报都写成传统爽点。',
    audience: {
      core: '悬疑惊悚爱好者，重规则推演、信息差、异常升级与真相揭露',
      age: '年轻读者为主',
      gender: '男女均有',
      scene: '沉浸式解谜阅读，享受“发现不对劲”',
      patience: '开篇就要抛异常或规则，但允许中低对话、靠叙述制造不安',
    },
    distribution: { first3FinishRate: null, note: '靠悬念与规则自洽留人，漏洞会被读者立刻指出' },
    short: S([0.15, 0.40], 60, 120, 0.25, 300, [500, 900], true, false, [1500, 8000]),
    long: S([0.15, 0.40], 62, 125, 0.27, 400, [700, 1100], true, false, [3200, 4000]),
    styleMust: [
      '规则必须具体、可验证、有代价，逐条推进并暴露规则间的矛盾漏洞；克制感叹号与煽情，靠“不对劲”的冷静细节累积压迫',
    ],
    original: '规则条目与怪谈体系必须原创自洽，禁止套用知名规则怪谈（如动物园/公寓系列）的规则与设定。',
  },
  generic: {
    id: 'generic', label: '通用网文',
    pacing: 'high', hookStrength: 'high',
    payoffRange: { min: 1, max: 3 }, burstGap: { min: 2, max: 5 }, allowSoftPayoff: true,
    preferredPayoffs: ['reveal', 'victory', 'relationship_shift', 'crisis_escalation', 'expectation_hook'],
    titleStrategies: ['身份反差', '目标冲突', '秘密悬念', '世界观奇点', '迫近代价', '结果前置', '关系爆点'],
    guide: '遵循商业网文的高推进和强追读原则，但根据题材、章节职责和读者预期动态调整回报形式与爆发间隔。',
    audience: {
      core: '一般网文读者，要持续推进与追读动力',
      age: '不限', gender: '不限',
      scene: '碎片化+沉浸混合',
      patience: '开篇尽快立目标或问题，拒绝长段背景说明',
    },
    distribution: { first3FinishRate: null, note: '遵循商业网文普遍规律，按题材动态调整' },
    short: S([0.25, 0.55], 60, 120, 0.28, 400, [600, 1000], true, false, [1500, 8000]),
    long: S([0.25, 0.55], 68, 140, 0.32, 600, [800, 1300], true, false, [3200, 4000]),
    original: '结构可类型化，人物、设定、情节与文字必须原创。',
  },
};

// ───────────────────────── 平台解析 / 题材微调（原 resolveNovelStrategy） ─────────────────────────

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function normalizePlatformId(value?: string | null): PlatformId {
  const raw = String(value || '').trim().toLowerCase();
  if (raw in PLATFORMS) return raw as PlatformId;
  if (raw.includes('番茄')) return 'fanqie';
  if (raw.includes('七猫')) return 'qimao';
  if (raw.includes('起点')) return 'qidian';
  if (raw.includes('知乎') || raw.includes('盐选')) return 'zhihu';
  if (raw.includes('抖音')) return 'douyin';
  if (raw.includes('小红书')) return 'xiaohongshu';
  if (raw.includes('晋江')) return 'jinjiang';
  if (raw.includes('规则') || raw.includes('怪谈')) return 'rules_horror';
  return 'generic';
}

export function getPlatform(platform?: string | null): PlatformProfile {
  return PLATFORMS[normalizePlatformId(platform ?? undefined)];
}
/** 旧名兼容：部分调用处使用 getPlatformBenchmark */
export const getPlatformBenchmark = getPlatform;

/** 按平台 + 题材标签微调节奏/回报，返回带 tags 的解析结果（硬红线扫描与节奏规划共用） */
export function resolveNovelStrategy(input: StoryStrategyInput): ResolvedNovelStrategy {
  const base = getPlatform(input.platform);
  const tags = [
    input.storyCategory,
    ...(input.storyTone || []),
    ...(input.writingStyle || []),
    ...(input.webNovelGenre || []),
  ].map(item => String(item || '').trim()).filter(Boolean);
  const text = tags.join('、');

  let minPayoff = base.payoffRange.min;
  let maxPayoff = base.payoffRange.max;
  let minGap = base.burstGap.min;
  let maxGap = base.burstGap.max;
  let allowSoftPayoff = base.allowSoftPayoff;
  const preferred = [...base.preferredPayoffs];

  if (/(爽文|无敌流|系统流|逆袭|热血|战神|升级)/.test(text)) {
    minPayoff += 1; maxPayoff += 1; maxGap -= 1; allowSoftPayoff = false;
  }
  if (/(悬疑|推理|怪谈|灵异|谜|侦探)/.test(text)) {
    preferred.unshift('reveal', 'reversal', 'foreshadow_payoff');
    minGap = Math.max(1, minGap - 1);
  }
  if (/(言情|情感|甜宠|虐恋|先婚后爱|群像|治愈)/.test(text)) {
    preferred.unshift('relationship_shift', 'emotional_release');
    allowSoftPayoff = true;
  }
  if (/(白描|朴素|现实|日常|群像叙事)/.test(text)) {
    maxGap += 1; minPayoff = Math.max(1, minPayoff - 1); allowSoftPayoff = true;
  }

  return {
    ...base,
    version: 1,
    storyType: String(input.storyType || 'short_story'),
    storyCategory: String(input.storyCategory || ''),
    tags,
    payoffRange: { min: clamp(minPayoff, 1, 3), max: clamp(Math.max(minPayoff, maxPayoff), 2, 4) },
    burstGap: { min: clamp(minGap, 1, 4), max: clamp(Math.max(minGap + 1, maxGap), 2, 6) },
    allowSoftPayoff,
    preferredPayoffs: Array.from(new Set(preferred)).slice(0, 7),
  };
}

export function targetForLength(p: PlatformProfile, length?: string | null): TextMetricTarget {
  return length === 'long_novel' ? p.long : p.short;
}

// ───────────────────────── 确定性文本度量（不调 LLM，质检与看板共用） ─────────────────────────

export interface NarrativeMetrics {
  words: number;
  paragraphCount: number;
  avgParaChars: number;
  longParaRatio: number;
  dialogueRatio: number;
  openingHasHook: boolean;
  endingHasHook: boolean;
}

const CN_QUOTES = /[“「『]([\s\S]*?)[”」』]/g;
const HOOK_WORDS = /(突然|忽然|死|杀|血|逃|跑|证据|录音|秘密|真相|不对|不对劲|诡异|异常|规则|倒计时|威胁|离婚|背叛|陷害|重生|穿越|系统|？|！|\?|!)/;
const END_HOOK = /(？|\?|……|\.\.\.|吗|呢|谁|到底|究竟|竟然|原来|没想到|下一秒|就在此时|话音未落)/;

function splitParagraphs(content: string): string[] {
  return content.split(/\n+/).map(p => p.trim()).filter(Boolean);
}

/** 与全局口径一致的叙事字数：汉字 + 英文词 */
export function narrativeWords(text: string): number {
  if (!text) return 0;
  const cjk = /[一-鿿㐀-䶿]/g;
  const chinese = (text.match(cjk) || []).length;
  const english = text.replace(/[一-鿿㐀-䶿]/g, ' ').split(/\s+/).filter(t => /[a-zA-Z]/.test(t)).length;
  return chinese + english;
}

export function measureNarrative(content: string): NarrativeMetrics {
  const text = String(content || '');
  const paras = splitParagraphs(text);
  const words = narrativeWords(text);
  const paraLens = paras.map(p => narrativeWords(p));
  const paragraphCount = paras.length;
  const avgParaChars = paragraphCount ? Math.round(paraLens.reduce((a, b) => a + b, 0) / paragraphCount) : 0;
  const quoted = (text.match(CN_QUOTES) || []).map(q => narrativeWords(q)).reduce((a, b) => a + b, 0);
  const dialogueRatio = words ? Number((quoted / words).toFixed(3)) : 0;
  return {
    words, paragraphCount, avgParaChars,
    longParaRatio: 0, dialogueRatio,
    openingHasHook: false, endingHasHook: false,
  };
}

export type MetricStatus = 'ok' | 'warn' | 'bad';
export interface BenchmarkMetricRow {
  key: string;
  label: string;
  value: string;
  target: string;
  status: MetricStatus;
  advice: string;
}

/** 对照某平台某体量基准，输出人话的逐项达标情况（章节质检与看板共用） */
export function measureAgainstTarget(content: string, t: TextMetricTarget): { metrics: NarrativeMetrics; rows: BenchmarkMetricRow[] } {
  const m = measureNarrative(content);
  const paras = splitParagraphs(content);
  const paraLens = paras.map(p => narrativeWords(p));
  const longCount = paraLens.filter(n => n > t.longParaChars).length;
  m.longParaRatio = paras.length ? Number((longCount / paras.length).toFixed(3)) : 0;
  m.openingHasHook = HOOK_WORDS.test(content.slice(0, t.openingHookChars));
  const last = paras[paras.length - 1] || '';
  m.endingHasHook = t.endingHook ? END_HOOK.test(last) : true;

  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const rows: BenchmarkMetricRow[] = [];

  const dOk = m.dialogueRatio >= t.dialogueRatio[0] && m.dialogueRatio <= t.dialogueRatio[1];
  rows.push({
    key: 'dialogueRatio', label: '对话占比',
    value: pct(m.dialogueRatio), target: `${pct(t.dialogueRatio[0])}–${pct(t.dialogueRatio[1])}`,
    status: dOk ? 'ok' : (m.dialogueRatio < t.dialogueRatio[0] ? 'bad' : 'warn'),
    advice: dOk ? '' : m.dialogueRatio < t.dialogueRatio[0]
      ? '对话偏少，关键信息/冲突尽量放进人物对话，减少大段独白与环境描写'
      : '对话偏多，注意用动作与信息推进替代无意义斗嘴',
  });

  const pOk = m.avgParaChars <= t.avgParaCharsMax;
  rows.push({
    key: 'avgParaChars', label: '平均段落字数',
    value: `${m.avgParaChars} 字`, target: `≤ ${t.avgParaCharsMax} 字`,
    status: pOk ? 'ok' : 'bad',
    advice: pOk ? '' : '段落偏厚，拆成更短意群、一句动作/一句对话独立，适配手机划屏',
  });

  const lrOk = m.longParaRatio <= t.longParaRatioMax;
  rows.push({
    key: 'longParaRatio', label: '超长段落占比',
    value: pct(m.longParaRatio), target: `≤ ${pct(t.longParaRatioMax)}`,
    status: lrOk ? 'ok' : 'warn',
    advice: lrOk ? '' : '存在过多“大墙”段落，读者易跳读，优先拆分超过阈值的段落',
  });

  rows.push({
    key: 'openingHook', label: `开篇 ${t.openingHookChars} 字内钩子`,
    value: m.openingHasHook ? '有' : '未检测到', target: '必须有冲突/异常/对话/强标点',
    status: m.openingHasHook ? 'ok' : 'bad',
    advice: m.openingHasHook ? '' : `前 ${t.openingHookChars} 字未见冲突信号，把危机/反常/悬念提到第一屏`,
  });

  rows.push({
    key: 'endingHook', label: '章尾留钩',
    value: m.endingHasHook ? '有' : '未检测到', target: t.endingHook ? '必须留悬念' : '不强制',
    status: m.endingHasHook ? 'ok' : 'warn',
    advice: m.endingHasHook ? '' : '结尾偏平，用未解问题、反转或危机临门一脚留住读者',
  });

  return { metrics: m, rows };
}

// ───────────────────────── 生成端 prompt 注入 ─────────────────────────

/** 把基准压成可直接注入 prompt 的硬性要求（替代散落的定性文案，覆盖全部 9 平台） */
export function buildBenchmarkDirective(platform?: string | null, length?: string | null): string {
  const b = getPlatform(platform);
  const a = b.audience;
  const headLine = `【目标平台·${b.label}｜受众与硬性基准（必须遵守）】
读者：${a.core}；${a.age}，${a.gender}；典型场景：${a.scene}；耐心线：${a.patience}。`;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  let body: string;
  if (length === 'long_novel' || length === 'short_story') {
    const t = targetForLength(b, length);
    const lenLabel = length === 'long_novel' ? '长篇' : '短篇';
    body = `（${lenLabel}）对话占比约 ${pct(t.dialogueRatio[0])}–${pct(t.dialogueRatio[1])}；平均段落不超过 ${t.avgParaCharsMax} 字，${t.shortParagraph ? '一句/短句意群成段' : '允许成段但不写大墙'}；` +
      `开篇 ${t.openingHookChars} 字内出现钩子/冲突/异常；每 ${t.payoffGapChars[0]}–${t.payoffGapChars[1]} 字一次有效推进或反转${t.endingHook ? '；章尾必须留钩子' : ''}；本章 ${t.chapterWords[0]}–${t.chapterWords[1]} 字。`;
  } else {
    const dLo = Math.min(b.short.dialogueRatio[0], b.long.dialogueRatio[0]);
    const dHi = Math.max(b.short.dialogueRatio[1], b.long.dialogueRatio[1]);
    const paraMax = Math.max(b.short.avgParaCharsMax, b.long.avgParaCharsMax);
    body = `对话占比约 ${pct(dLo)}–${pct(dHi)}；平均段落不超过 ${paraMax} 字、拒绝大段厚段落；` +
      `短篇开篇 ${b.short.openingHookChars} 字内、长篇开篇 ${b.long.openingHookChars} 字内必须出现钩子/冲突/异常；` +
      `短篇每 ${b.short.payoffGapChars[0]}–${b.short.payoffGapChars[1]} 字、长篇每 ${b.long.payoffGapChars[0]}–${b.long.payoffGapChars[1]} 字一次有效推进或反转；章尾留钩子；` +
      `章节字数：短篇 ${b.short.chapterWords[0]}–${b.short.chapterWords[1]}、长篇 ${b.long.chapterWords[0]}–${b.long.chapterWords[1]}。`;
  }
  const styleMustLine = b.styleMust && b.styleMust.length
    ? `本平台风格红线（优先级高于通用“白描/克制/去戏剧化”基准）：${b.styleMust.map((x, i) => `${i + 1}) ${x}`).join('；')}`
    : '';
  return [headLine, body, `分发逻辑：${b.distribution.note}。`, `平台节奏：${b.guide}`, styleMustLine, `原创红线：${b.original}`, '行文底线：短段是为手机阅读服务，但严禁“X了，Y了”式两字残句链（如“退了账，走了”“两下，灭了”），连贯动作要连成完整句子、补足成分；句末语气词克制；同一环境意象（车/灯/夜色/烟/雨等）不做近距离重复铺陈，过渡描写只承担转场；严禁相同动词/前缀的同构排比（“带了A、带了B、带了C、带了D”“想到了A，想到了B，想到了C”——只保留最有力的一项，其余写成有差异、有结果的具体句）；量词必须与名词正确搭配（“束”只用于花/光/发丝等成束细长物，蛋糕用“个”、文件用“份”、戒指用“枚”，不许把甲物量词套给乙物）。'].filter(Boolean).join('\n');
}

// ───────────────────────── 生成链：对照优秀线的自动收敛（不止过红线） ─────────────────────────

/**
 * 挑出当前正文相对该平台基准仍需提升的项：bad 项必改；若该平台要求章尾留钩（endingHook=true）
 * 却没检测到，也一并纳入（该项在 measureAgainstTarget 里仅标 warn，这里按平台要求升级为待修）。
 */
export function benchmarkRefineIssues(
  t: TextMetricTarget,
  m: NarrativeMetrics,
  rows: BenchmarkMetricRow[],
): BenchmarkMetricRow[] {
  const out = rows.filter(r => r.status === 'bad');
  if (t.endingHook && !m.endingHasHook && !out.some(r => r.key === 'endingHook')) {
    const end = rows.find(r => r.key === 'endingHook');
    if (end) out.push(end);
  }
  return out;
}

/**
 * 把基准差距转成"在原文上定向精修"的真实指令（生成链 1–2 轮收敛用）。
 *
 * 历史事故根因修复：精修【必须携带待精修原文 + 本章大纲契约 + 人物白名单】。
 * 旧版只给平台名和短板、不给原文与人物，模型在真空中凭空虚构了另一部小说，
 * 并整体覆盖了前面已通过大纲验收的正确正文（都市离婚文被精修成乡村悬疑）。
 * 因此 previousContent 缺失时直接抛错，绝不允许"无原文精修/无原文重写"。
 */
export function buildBenchmarkRefinePrompt(input: {
  platformLabel: string;
  storyType: string;
  issues: BenchmarkMetricRow[];
  round: number;
  maxRound: number;
  /** 待精修的上一版正文（精修对象，必传，缺失即抛错） */
  previousContent: string;
  /** 本章大纲契约（关键事件/场景/结尾钩，不可偏离） */
  outlineContract?: string;
  /** 故事锚点：书名/本章标题/视角人称/人物白名单/平台标签 */
  storyAnchors?: {
    bookTitle?: string;
    chapterTitle?: string;
    person?: string;
    characterNames?: string[];
    tagText?: string;
  };
  /** 跨章节避坑经验（可选） */
  lessons?: string;
  /** 本稿当前命中的确定性语言硬伤（人话+原文片段），要求逐处改写，与质检同口径 */
  hardlineIssues?: string[];
}): string {
  const { platformLabel, storyType, issues, round, maxRound, previousContent } = input;
  const lenLabel = storyType === 'long_novel' ? '长篇' : '短篇';
  if (!previousContent || !previousContent.trim()) {
    throw new Error('buildBenchmarkRefinePrompt 缺少待精修原文：禁止在没有原文的情况下“精修/重写”整章');
  }
  const lines = issues.map(r => `· ${r.label}：当前 ${r.value}，${platformLabel}${lenLabel}基准 ${r.target}。${r.advice}`);
  const a = input.storyAnchors || {};
  const nameList = (a.characterNames || []).map(s => String(s || '').trim()).filter(Boolean);
  const anchorBlock = [
    a.bookTitle ? `作品：${a.bookTitle}` : '',
    a.chapterTitle ? `本章：${a.chapterTitle}` : '',
    a.person ? `叙事人称/视角：${a.person}（不得切换）` : '',
    nameList.length ? `人物白名单（正文只能出现这些人物姓名，严禁新增主角、严禁改名换人）：${nameList.join('、')}` : '',
    a.tagText ? `平台/基调/风格/流派标签：${a.tagText}` : '',
  ].filter(Boolean).join('\n');
  const contractBlock = input.outlineContract
    ? `【本章大纲契约（必须兑现、不可偏离）】\n${input.outlineContract.slice(0, 1800)}`
    : '';
  const lessonBlock = input.lessons
    ? `【本作品历史避坑经验（同样错误不得再犯）】\n${input.lessons.slice(0, 1200)}`
    : '';
  return [
    `你在对一章【已通过大纲验收】的网文正文做「平台爆款基准」定向精修，目标平台=${platformLabel}（${lenLabel}），第 ${round}/${maxRound} 轮基准提升。`,
    '这是“在已有正文上精修”，不是新写一章：下面给你的【待精修原文】就是唯一底本，你必须逐段在它基础上改写提升，输出仍是同一个故事、同一批人物。',
    anchorBlock ? `【不可违背的作品锚点】\n${anchorBlock}` : '',
    contractBlock,
    '硬性边界（违反即失败）：',
    nameList.length
      ? '0) 人物姓名、身份、关系只能来自上面的人物白名单；主角必须仍是白名单人物，严禁把故事换成别的人物/题材/场景，严禁出现白名单之外的新主角名；'
      : '0) 不得更换主角、题材与故事场景；',
    '1) 不改变故事线、事件顺序、人物关系、视角人称、已确认事实与本章大纲功能，不新增也不删除情节；',
    '2) 不得缩短篇幅：保持原有字数并落在目标区间，只能等量改写或适当扩写，严禁删场景凑结构；',
    '3) 只针对下面列出的短板提升，已达标部分原样保留，不要通篇重写造成风格断裂；',
    '4) 段落长短错落、适配手机划屏，但严禁把每一句话都单独换行，更严禁“X了，Y了”式两字残句链（如“退了账，走了。”“闪了两下，灭了。”——一个连贯动作要连成完整句子或补足成分，不许用句号切成两字碎片）；全部使用中文标点；',
    '5) 句末语气词（嗯/啊/呀/吧/呢/呗/喽/嘛/哦）克制，不靠语气词凑对话；同一环境意象（车/灯/夜色/烟/雨等）不在相邻段落重复铺陈，过渡环境描写只承担转场、不重复渲染；',
    '6) 拆掉相同动词/前缀的同构排比（“带了A、带了B、带了C、带了D”只留最有力一项，其余改成有差异、有结果的具体句）；逐处核对量词与名词搭配（“束”只配花/光/发丝等成束细长物，蛋糕用个、文件用份、戒指用枚，不得把甲物量词套给乙物）；',
    '7) 去 AI 腔/影视套话：删掉“像……一样/仿佛/宛如”的套路比喻，删掉“冷光、惨白、空气仿佛凝固、眼底闪过一丝、嘴角勾起一抹”这类程式化渲染，环境只留一处与当下动作或心理直接相关的具体细节；对话要像真人——允许口语化的停顿、省略、打断、答非所问，不要每一句都工整地推进剧情，不要让所有人说话都一个腔调；',
    '本轮必须逐项补齐的短板：',
    ...lines,
    (input.hardlineIssues && input.hardlineIssues.length)
      ? '本轮必须逐处消除的确定性语言硬伤（已给出原句，就在原句上改写，不许整段删除、不许改动情节）：\n' + input.hardlineIssues.slice(0, 8).map(x => '· ' + x).join('\n')
      : '',
    '具体手法：',
    '· 对话占比不足：把内心独白、推理、信息交代、人物交锋改成一来一回的对话（搭话/电话/追问/争辩/自言自语），用对话推进剧情，连续叙述不超过两段就用对话打断；',
    '· 章尾留钩：把最后一段落在一个未解问题、反转、新威胁、关键动作或一句对话上，让读者非看下一章不可；禁止“他不知道的是……”这类作者旁白式假钩；',
    '· 段落偏厚/超长段过多：把超过阈值的大段按动作、对话、信息拆成更短意群，但不要逐句碎切；',
    '· 开篇缺钩：把危机/反常/冲突/强悬念提到第一屏，删掉平铺直叙的环境与履历铺垫。',
    lessonBlock,
    `【待精修原文（唯一底本，逐段在它上面改，输出必须仍是这个故事、这些人物）】\n${previousContent.slice(0, 12000)}`,
    '直接输出精修后的完整正文（仍是上面这个故事与人物），不要输出任何说明、标记、标题或 JSON。',
  ].filter(Boolean).join('\n\n');
}

/**
 * 确定性“故事身份守护”（零 LLM、纯文本、可复算、可单测）。
 * 任何二次生成（大纲对齐修复 / 平台基准精修）都只能在【上一版正文】上改写：
 *   1) 篇幅守护：新稿相对上一版异常缩水（默认 <85%）→ 判劣化，调用方丢弃新稿、保留上一版；
 *   2) 人物守护：上一版出现过的本书人物（characters 白名单）在新稿零命中 / 丢失过半 → 判“换故事”。
 * 历史事故：平台精修 prompt 不带原文，模型在真空中凭空写出另一部乡村悬疑，整体覆盖了正确的都市正文。
 * 返回 { ok:true } 放行；{ ok:false, reason } 由调用方记录并保留上一版。
 */
export function refineKeepsStory(
  prev: string,
  next: string,
  characterNames: string[],
  opts?: { minKeepRatio?: number },
): { ok: boolean; reason?: string } {
  const norm = (s: string) => String(s || '').replace(/\s+/g, '');
  const p = norm(prev);
  const n = norm(next);
  if (!n) return { ok: false, reason: '新稿为空' };
  const ratio = n.length / Math.max(1, p.length);
  if (ratio < (opts?.minKeepRatio ?? 0.85)) {
    return { ok: false, reason: `篇幅异常缩水（保留率 ${(ratio * 100).toFixed(0)}%）` };
  }
  const names = (characterNames || []).map(x => String(x || '').trim()).filter(x => x.length >= 2);
  if (names.length) {
    const prevHits = names.filter(nm => p.includes(nm));
    const nextHits = names.filter(nm => n.includes(nm));
    if (prevHits.length > 0 && nextHits.length === 0) {
      return { ok: false, reason: '新稿丢失全部本书人物（人物白名单零命中），疑似替换成别的故事' };
    }
    if (prevHits.length >= 2 && nextHits.length < Math.ceil(prevHits.length / 2)) {
      return { ok: false, reason: `本书人物大量消失（上一版 ${prevHits.length} 人→新稿 ${nextHits.length} 人），疑似改写跑偏` };
    }
  }
  return { ok: true };
}
