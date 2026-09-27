
/**
 * 可执行创作维度的唯一词表。投稿字段名由平台决定；创作六维仍是生成与质检前提。
 *
 * 用户在项目卡片上明确选定的维度是【执行前提】，不是展示字段：
 * 生成侧（creative-constitution / chain）、质检评分（stage-score）、质检报告与看板
 * （writing-quality / platform-analytics）、模块标准文案、前端表单与看板都必须由这一份派生。
 *
 * 为什么必须只有一份：历史实现里生成侧已按六维执行标准注入 prompt，质检与看板却硬编码了
 * 「平台/基调/风格/流派」四维 tagFit —— 分类与视角既不评分、也不进看板，用户设了等于没设。
 * 维度列表每多一份手写副本，就必然再分叉一次，所以这里不再允许任何地方重新字面量拼维度数组。
 *
 * 六维为空必须阻断；平台投稿字段与作者创作维度不能互相冒充。
 * 不得填默认值、不得用平台推荐补齐、不得静默缩小已选维度的分母。field 与 creative-constitution.ts 的
 * 创作宪法字段一一对应（targetPlatform / category / storyTone / writingStyle / webNovelGenre / pov）。
 */
export const EXECUTION_STANDARD_DIMENSIONS = [
  { dimension: 'platform', label: '平台', field: 'targetPlatform' },
  { dimension: 'category', label: '分类', field: 'category' },
  { dimension: 'tone', label: '基调', field: 'storyTone' },
  { dimension: 'style', label: '文风', field: 'writingStyle' },
  { dimension: 'genre', label: '流派', field: 'webNovelGenre' },
  { dimension: 'pov', label: '视角', field: 'pov' },
] as const;

export type ExecutionStandardDimensionKey = typeof EXECUTION_STANDARD_DIMENSIONS[number]['dimension'];

/** 维度键到中文显示名的唯一映射（前后端、prompt、模块标准文案共用，禁止再各写一份）。 */
export const EXECUTION_STANDARD_DIMENSION_LABELS: Record<ExecutionStandardDimensionKey, string> = {
  platform: '平台',
  category: '分类',
  tone: '基调',
  style: '文风',
  genre: '流派',
  pov: '视角',
};

/** 维度键序列：判定顺序、评分遍历顺序与展示顺序一致。 */
export const EXECUTION_STANDARD_DIMENSION_KEYS: ExecutionStandardDimensionKey[] =
  EXECUTION_STANDARD_DIMENSIONS.map(item => item.dimension);

/** 六维创作执行前提。平台投稿字段单独由 platformSubmissionDimensions 描述。 */
export function executionDimensionsForProject(value: {
  targetPlatform: string; projectType: string; category: string; targetAudience?: string;
  storyTone?: readonly string[]; writingStyle?: readonly string[] | string;
  webNovelGenre?: readonly string[]; pov?: string;
}): typeof EXECUTION_STANDARD_DIMENSIONS[number][] {
  return [...EXECUTION_STANDARD_DIMENSIONS];
}

/** 一句话口径（平台/分类/基调/文风/流派/视角），用于 prompt、模块标准与阻断文案。 */
export const EXECUTION_STANDARD_DIMENSION_TEXT =
  EXECUTION_STANDARD_DIMENSIONS.map(item => item.label).join('/');

/**
 * 叙事视角（视角维）取值的唯一事实源。
 *
 * 为什么必须只留一份：这份 4 项视角同时被三处需要 —— 后端字典种子（story_dict 的 narrative_pov）、
 * 前端两处视角下拉（ExecutionStandardsForm / DiscoveryWizardPage）在字典接口未就绪时的兜底。
 * 历史上它被抄成 3 份（种子 1 份 + 前端 2 份内联数组），改一处必漏另外两处，于是必然出现
 * 「字典里有这个视角、下拉里没有」这种前后端各走各的分叉 —— 用户选了落库、系统却不认。
 *
 * 语义边界：它只是【字典初始值】。用户可在字典页增删，运行时以字典接口返回为准；
 * 这里的兜底语义是「与种子一致」，不是另立一套标准，也不得被当成平台推荐去覆盖用户选择。
 */
export const NARRATIVE_POV_SEED_LABELS = [
  '第三人称限知',
  '第三人称全知',
  '第一人称',
  '多视角轮换',
] as const;

/**
 * 文风（style 维）取值的唯一事实源。
 *
 * 为什么必须只有一份：这 8 项同时被三处需要 —— 后端字典种子（story_dict 的 writing_style）、
 * 「文风」这一维的操作定义（STYLE_GUIDES）、以及硬线扫描器「白描/朴素类按执行标准放宽检测窗口」的判定。
 * 历史上它被抄成多份（种子 1 份、写作页描述文案 1 份、硬线扫描器正则 1 份），改一处必漏其余，
 * 于是出现「字典里选得到这个文风、操作定义里却没有它」——用户选了「白描/朴素」，生成侧只收到一个词，
 * 收不到任何具体约束。标签名不是标准，可执行的定义才是。
 *
 * 语义边界：它只是【字典初始值】。用户可在字典页增删，运行时以字典接口返回为准；
 * 这里的语义是「与种子一致」，不是另立一套标准。
 */
export const WRITING_STYLE_SEED_LABELS = [
  '白描/朴素',
  '情感',
  '宏大叙事',
  '群像叙事',
  '倒叙',
  '多线叙事',
  '日记体',
  '对话体',
] as const;

/** 基调（tone 维）取值的唯一事实源。语义边界同 WRITING_STYLE_SEED_LABELS（字典初始值，不是硬编码白名单）。 */
export const STORY_TONE_SEED_LABELS = [
  '热血',
  '搞笑',
  '悬疑',
  '甜宠',
  '虐恋',
  '爆笑',
  '烧脑',
  '治愈',
  '轻松',
  '压抑',
] as const;

/** 情节取向是作者创作设定，不冒称任何平台的投稿字段。两处创建表单共用候选。 */
export const PLOT_TAG_SEED_LABELS = [
  '成长', '逆袭', '复仇', '救赎', '探案', '冒险', '权谋', '情感拉扯',
  '群像', '商战', '生存', '争霸', '悬念反转', '日常经营',
  '打脸回报', '人物牺牲', '女性成长',
] as const;

/**
 * 「文风」与「基调」两维的操作定义（唯一事实源）。
 *
 * 为什么必须有操作定义：执行标准注入 prompt 时如果只写「文风：白描/朴素」，模型拿到的是一个词、
 * 不是一个做法 —— 它可以照着写，也可以完全无视，质检也无从判定。操作定义把标签翻译成
 * 「句式/密度/取舍/禁止项」层面的可执行条款，才谈得上「设置了就生效」。
 *
 * 为什么放代码而不是字典表：story_dict 只有 dict_type/label 这类身份列，没有描述列，
 * 用户自建标签也不该被强制填写定义。所以两者分工明确、且都不重复：
 *   - 字典（story_dict）决定「能选什么」；
 *   - 这里决定「选了之后必须怎么写」。
 * 用户自建标签不在本表内 = 只有值、没有定义，如实留空即可：不得编造定义，也不得静默套用别的标签。
 *
 * 内容口径：只写机制（句式、密度、取舍、禁止项），不点名具体作品或作者 ——
 * 点名作者会诱导模型复刻特定文本（书籍污染），与「写作规则收敛到执行标准唯一来源」是同一条红线。
 */
export const STYLE_GUIDES: Record<string, string> = {
  '白描/朴素': '动词与名词为主，少用形容词和副词；情绪藏在动作与物件里，不直接说出；句子偏短，节奏克制，不铺排环境',
  '情感': '细腻的心理描写，关系拉扯有来有回；对白带潜台词，情绪共鸣必须落在具体细节上，不空喊',
  '宏大叙事': '世界观交代完整，群像与阵营并进，伏笔分层交叉；允许铺垫，但每次铺垫都必须在后续被兑现',
  '群像叙事': '多个角色各有独立目标与行动逻辑，靠人物之间的碰撞推进；不得把配角写成只为衬托主角的工具人',
  '倒叙': '从结果回溯过程，先给既定事实再逐层揭开成因；每次回溯都要新增信息，不得重复读者已知的结论',
  '多线叙事': '多条故事线并行推进并在关键节点交汇；每条线都要有自己的推进目标，切换线索必须有明确落点',
  '日记体': '以日记/笔记的时限与主观视角推进，条目之间有明确的时间跨度与状态变化；不得写成无事发生的流水账',
  '对话体': '由对白承担主要信息与冲突推进，旁白只做必要交代；不同人物的说话方式必须能区分开',
};

/** 基调操作定义（唯一事实源）。与 STYLE_GUIDES 同一分工：字典定「可选值」，这里定「选了之后怎么写」。 */
export const TONE_GUIDES: Record<string, string> = {
  // 这里曾把爽文、权谋、无敌、逆袭、刀人、女强同时当作情绪基调候选，后果是与情节/流派重叠。
  // 旧项目可能仍保存这些值，保留其操作定义以维持既有作品质量门；新候选只取 STORY_TONE_SEED_LABELS。
  '热血': '靠「立目标—受挫—突破」推进，情绪高点必须由角色的主动选择与代价堆出来，不靠喊口号和形容词',
  '爽文': '打脸与反超必须有前置铺垫和可量化的落差，回报节奏稳定可预期；禁止无代价碾压，禁止同型桥段连续重复',
  '搞笑': '笑点来自情境反差、错位与人物性格碰撞；不得用谐音和无意义插科打诨消解冲突的紧张感',
  '悬疑': '每章抛出一个读者会追问的疑问并延迟解答，线索先给后收、可回溯；禁止靠隐瞒必要信息硬造悬念',
  '甜宠': '关系推进靠具体的照顾细节与专属待遇；冲突必须有限度且能修复，不得用恶意误会砍断关系',
  '虐恋': '痛感来自人物的两难与代价，情感撕裂要有因果链；不得为虐而虐，不得用失忆式反转强行解释',
  '权谋': '交锋靠信息差、筹码与交换，胜负必须可复盘；禁止角色为了推进剧情集体降智',
  '爆笑': '笑点密度高于常规搞笑，靠情境连续升级推进；但主线的严肃冲突不能被消解成段子',
  '烧脑': '规则必须自洽且可推演，线索给足以支撑读者自行推理；禁止用不可验证的力量强行解释关键谜题',
  '无敌': '压制关系全程稳定兑现，看点从「能不能赢」转到「怎么赢、代价是什么」；不得无前置地突然被压制而破坏基调',
  '逆袭': '起点必须有可量化的低谷与落差，反转靠主角自身积累的能力与信息；不得靠天降外挂一步跨越',
  '刀人': '情绪冲击来自「已投入的关系」被切断，前文必须有足够的情感投资（日常、付出、伏笔）；不得靠一次性惨剧堆眼泪',
  '治愈': '情绪落点回到安稳与被接纳，冲突温和、可修复；不得把创伤与惨剧当成主要卖点',
  '女强': '女主的判断与决策是主要推动力，他人的帮助只做助力；不得在关键节点让女主退位由他人解题',
  '轻松': '语言与情节密度放缓，冲突轻量且快速化解；但人物目标仍要推进，不得变成无事发生的流水账',
  '压抑': '氛围持续收紧、希望被反复延后；必须留最小呼吸口（细节微光、片刻暖意），不得全程无差别地黑',
};

/**
 * 「白描/朴素」这类天然克制标点的文风，在文笔硬线里用的是【加长检测窗口】而不是豁免：
 * 规则照常生效、照常阻断保存，只是窗口长度按执行标准分化。关键词表放这里，
 * 是为了让 hardline-scanner 不再内联一份正则字面量 —— 它本来就是执行标准的分支，必须与标准同源。
 * 命中方式是子串匹配（用户自建标签如「现实」「日常」也要一并放宽），不是精确等于标签。
 */
export const STYLE_PUNCTUATION_RELAX_KEYWORDS = ['白描', '朴素', '现实', '日常', '群像叙事'] as const;

/**
 * 取某一维某个标签的操作定义。查不到 = 该标签没有操作定义（用户自建标签），如实返回空串。
 * 不得为查不到的标签编造定义，也不得回退到别的标签。
 */
export function dimensionGuide(dimension: string, label: string): string {
  const key = String(label ?? '').trim();
  if (!key) return '';
  if (dimension === 'style') return STYLE_GUIDES[key] ?? '';
  if (dimension === 'tone') return TONE_GUIDES[key] ?? '';
  return '';
}

/**
 * 把一维的多个标签渲染成「操作定义」条款，供 prompt 拼接。
 * 全部标签都没有定义时返回空串 —— 不产生空壳文案，也不编造定义。
 */
export function dimensionGuidesText(dimension: string, labels: readonly string[]): string {
  const lines = (labels || [])
    .map(label => ({ label: String(label ?? '').trim(), guide: dimensionGuide(dimension, label) }))
    .filter(item => item.label && item.guide)
    .map(item => item.label + '：' + item.guide);
  return lines.length ? '；操作定义（必须逐条落到语句层）——' + lines.join('；') : '';
}
