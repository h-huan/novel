export type PlatformId =
  | 'zhihu'
  | 'fanqie'
  | 'qidian'
  | 'douyin'
  | 'jinjiang'
  | 'rules_horror'
  | 'generic';

export type OutlineChapterFunction =
  | 'opening'
  | 'exposition'
  | 'rising_action'
  | 'conflict'
  | 'climax'
  | 'breathing'
  | 'charging'
  | 'explosion'
  | 'paving'
  | 'transition'
  | 'cliffhanger'
  | 'resolution'
  | 'closing';

export type RhythmRole = 'build' | 'pressure' | 'burst' | 'breathing' | 'resolution';

export type ReaderPayoffKind =
  | 'victory'
  | 'reversal'
  | 'reveal'
  | 'emotional_release'
  | 'relationship_shift'
  | 'crisis_escalation'
  | 'foreshadow_payoff'
  | 'world_discovery'
  | 'competence_display'
  | 'expectation_hook';

export interface PayoffRange {
  min: number;
  max: number;
}

export interface PlatformStrategyProfile {
  id: PlatformId;
  label: string;
  pacing: 'high' | 'very_high';
  hookStrength: 'medium' | 'high' | 'very_high';
  payoffRange: PayoffRange;
  burstGap: { min: number; max: number };
  allowSoftPayoff: boolean;
  preferredPayoffs: ReaderPayoffKind[];
  titleStrategies: string[];
  guide: string;
}

export interface StoryStrategyInput {
  platform?: string;
  storyType?: string;
  storyCategory?: string;
  storyTone?: string[];
  writingStyle?: string[];
  webNovelGenre?: string[];
}

export interface ResolvedNovelStrategy extends PlatformStrategyProfile {
  version: 1;
  storyType: string;
  storyCategory: string;
  tags: string[];
}

export interface RhythmSourceChapter {
  order?: number;
  title?: string;
  func?: string;
  brief?: string;
}

export interface ChapterRhythmDecision {
  index: number;
  chapter: number;
  role: RhythmRole;
  reason: string;
  payoffRange: PayoffRange;
  preferredPayoffs: ReaderPayoffKind[];
}

const DEFAULT_PLATFORM_PROFILES: Record<PlatformId, PlatformStrategyProfile> = {
  fanqie: {
    id: 'fanqie',
    label: '番茄小说',
    pacing: 'very_high',
    hookStrength: 'very_high',
    payoffRange: { min: 2, max: 3 },
    burstGap: { min: 2, max: 4 },
    allowSoftPayoff: false,
    preferredPayoffs: ['victory', 'reversal', 'reveal', 'competence_display', 'expectation_hook'],
    titleStrategies: ['身份反差', '迫近代价', '结果前置', '利益冲突', '强悬念', '极端处境'],
    guide: '高节奏、高追读、高反馈。尽快进入核心事件，持续推进冲突与收益兑现；允许短蓄力，但不能连续多章只有铺垫。',
  },
  qidian: {
    id: 'qidian',
    label: '起点中文网',
    pacing: 'high',
    hookStrength: 'high',
    payoffRange: { min: 1, max: 3 },
    burstGap: { min: 2, max: 5 },
    allowSoftPayoff: true,
    preferredPayoffs: ['world_discovery', 'competence_display', 'reveal', 'victory', 'foreshadow_payoff'],
    titleStrategies: ['世界观奇点', '核心能力', '身份变化', '目标冲突', '强悬念', '成长承诺'],
    guide: '保持网文追读速度，同时允许世界观、成长线和长期伏笔蓄力；章节必须有有效推进或读者回报，但不要求每章都以同一种爽点兑现。',
  },
  zhihu: {
    id: 'zhihu',
    label: '知乎盐选',
    pacing: 'high',
    hookStrength: 'very_high',
    payoffRange: { min: 1, max: 3 },
    burstGap: { min: 2, max: 4 },
    allowSoftPayoff: true,
    preferredPayoffs: ['reveal', 'reversal', 'relationship_shift', 'emotional_release', 'expectation_hook'],
    titleStrategies: ['秘密悬念', '关系反差', '结果前置', '身份反差', '迫近代价', '纪实疑问'],
    guide: '强调现实感、代入感、关系冲突和信息差。尽快建立核心问题，持续给出新信息、关系变化或反转，避免空转。',
  },
  douyin: {
    id: 'douyin',
    label: '抖音故事',
    pacing: 'very_high',
    hookStrength: 'very_high',
    payoffRange: { min: 2, max: 4 },
    burstGap: { min: 1, max: 3 },
    allowSoftPayoff: false,
    preferredPayoffs: ['reversal', 'victory', 'reveal', 'crisis_escalation', 'expectation_hook'],
    titleStrategies: ['结果前置', '极端处境', '迫近代价', '强反差', '规则危机', '关系爆点'],
    guide: '极高信息密度和情绪密度，快速进入冲突，短周期兑现，结尾持续制造下一步观看理由。',
  },
  jinjiang: {
    id: 'jinjiang',
    label: '晋江文学城',
    pacing: 'high',
    hookStrength: 'high',
    payoffRange: { min: 1, max: 3 },
    burstGap: { min: 2, max: 5 },
    allowSoftPayoff: true,
    preferredPayoffs: ['relationship_shift', 'emotional_release', 'reveal', 'foreshadow_payoff', 'expectation_hook'],
    titleStrategies: ['关系张力', '身份错位', '情绪承诺', '秘密悬念', '人物目标', '世界观奇点'],
    guide: '保持较强追读，同时把人物关系、情绪推进和角色弧作为主要回报来源，不强迫每章都用战力或打脸式爽点。',
  },
  rules_horror: {
    id: 'rules_horror',
    label: '规则怪谈',
    pacing: 'very_high',
    hookStrength: 'very_high',
    payoffRange: { min: 1, max: 3 },
    burstGap: { min: 2, max: 4 },
    allowSoftPayoff: false,
    preferredPayoffs: ['reveal', 'reversal', 'crisis_escalation', 'foreshadow_payoff', 'expectation_hook'],
    titleStrategies: ['危险规则', '异常现象', '倒计时代价', '身份谜团', '场景禁忌', '未解悬念'],
    guide: '高悬念、高信息差。持续通过规则验证、异常升级和真相揭露推进，不把所有回报都写成传统爽点。',
  },
  generic: {
    id: 'generic',
    label: '通用网文',
    pacing: 'high',
    hookStrength: 'high',
    payoffRange: { min: 1, max: 3 },
    burstGap: { min: 2, max: 5 },
    allowSoftPayoff: true,
    preferredPayoffs: ['reveal', 'victory', 'relationship_shift', 'crisis_escalation', 'expectation_hook'],
    titleStrategies: ['身份反差', '目标冲突', '秘密悬念', '世界观奇点', '迫近代价', '结果前置', '关系爆点'],
    guide: '遵循商业网文的高推进和强追读原则，但根据题材、章节职责和读者预期动态调整回报形式与爆发间隔。',
  },
};

const FUNCTION_MAP: Record<string, OutlineChapterFunction> = {
  open: 'opening',
  opening: 'opening',
  hook: 'opening',
  start: 'opening',
  exposition: 'exposition',
  setup: 'exposition',
  development: 'rising_action',
  rising: 'rising_action',
  rising_action: 'rising_action',
  conflict: 'conflict',
  crisis: 'conflict',
  climax: 'climax',
  explosion: 'explosion',
  payoff: 'explosion',
  resolution: 'resolution',
  ending: 'resolution',
  breathing: 'breathing',
  charging: 'charging',
  paving: 'paving',
  transition: 'transition',
  cliffhanger: 'cliffhanger',
  closing: 'closing',
};

const PAYOFF_LABELS: Record<ReaderPayoffKind, string> = {
  victory: '阶段胜利/打脸/逆袭兑现',
  reversal: '反转或胜负条件改变',
  reveal: '关键新信息/真相推进',
  emotional_release: '情绪释放/情感兑现',
  relationship_shift: '人物关系实质变化',
  crisis_escalation: '危机升级/代价扩大',
  foreshadow_payoff: '伏笔验证或回收',
  world_discovery: '世界观/能力边界新发现',
  competence_display: '能力、判断或成长的有效展示',
  expectation_hook: '建立强烈下一步期待',
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const normalizePlatformId = (value?: string): PlatformId => {
  const raw = String(value || '').trim().toLowerCase();
  return raw in DEFAULT_PLATFORM_PROFILES ? raw as PlatformId : 'generic';
};

export const resolveNovelStrategy = (input: StoryStrategyInput): ResolvedNovelStrategy => {
  const platform = normalizePlatformId(input.platform);
  const base = DEFAULT_PLATFORM_PROFILES[platform];
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
    minPayoff += 1;
    maxPayoff += 1;
    maxGap -= 1;
    allowSoftPayoff = false;
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
    maxGap += 1;
    minPayoff = Math.max(1, minPayoff - 1);
    allowSoftPayoff = true;
  }

  return {
    ...base,
    version: 1,
    storyType: String(input.storyType || 'short_story'),
    storyCategory: String(input.storyCategory || ''),
    tags,
    payoffRange: {
      min: clamp(minPayoff, 1, 3),
      max: clamp(Math.max(minPayoff, maxPayoff), 2, 4),
    },
    burstGap: {
      min: clamp(minGap, 1, 4),
      max: clamp(Math.max(minGap + 1, maxGap), 2, 6),
    },
    allowSoftPayoff,
    preferredPayoffs: Array.from(new Set(preferred)).slice(0, 7),
  };
};

export const normalizeOutlineChapterFunction = (
  value: unknown,
  order = 0,
  isShort = true,
  title = '',
  brief = '',
): OutlineChapterFunction => {
  const raw = String(value || '').trim().toLowerCase();
  if (FUNCTION_MAP[raw]) return FUNCTION_MAP[raw];

  const text = `${title}\n${brief}`;
  if (order <= 0) return 'opening';
  if (/(结局|收束|落幕|终章|尾声|解决)/.test(text)) return isShort ? 'resolution' : 'closing';
  if (/(高潮|决战|爆发|翻盘|反杀|终极对抗|兑现)/.test(text)) return 'climax';
  if (/(冲突|对峙|危机|追杀|争夺|围堵|逼迫)/.test(text)) return 'conflict';
  if (/(过渡|转场|休整|缓冲|整理线索|疗伤)/.test(text)) return 'transition';
  if (/(铺垫|建立|介绍|初识|进入|发现规则)/.test(text)) return 'exposition';
  if (/(蓄力|准备|集结|部署|试探)/.test(text)) return 'charging';
  return 'rising_action';
};

export const inferOutlineGoalArc = (
  _order = 0,
  _isShort = true,
  chapterFunction: OutlineChapterFunction = 'rising_action',
): string => {
  const map: Record<OutlineChapterFunction, string> = {
    opening: 'mist_truth',
    exposition: 'mist_truth',
    rising_action: 'accumulate_burst',
    conflict: 'crisis_resolve',
    climax: 'suppress_counter',
    breathing: 'foreshadow_recover',
    charging: 'pave_climax',
    explosion: 'suppress_counter',
    paving: 'accumulate_burst',
    transition: 'foreshadow_recover',
    cliffhanger: 'probe_showdown',
    resolution: 'foreshadow_recover',
    closing: 'foreshadow_recover',
  };
  return map[chapterFunction];
};

const functionIntensityScore = (fn: OutlineChapterFunction): number => {
  const scores: Record<OutlineChapterFunction, number> = {
    opening: 2,
    exposition: 1,
    rising_action: 2,
    conflict: 4,
    climax: 6,
    breathing: -2,
    charging: 2,
    explosion: 6,
    paving: 1,
    transition: -2,
    cliffhanger: 4,
    resolution: 4,
    closing: 3,
  };
  return scores[fn];
};

const textIntensityScore = (text: string): number => {
  let score = 0;
  if (/(高潮|决战|爆发|翻盘|反杀|逆袭|揭露真相|身份揭晓|突破|兑现)/.test(text)) score += 4;
  if (/(冲突|危机|对峙|追查|追击|争夺|逼迫|失控|代价)/.test(text)) score += 2;
  if (/(休整|过渡|日常|疗伤|缓冲|整理|铺垫|回顾)/.test(text)) score -= 2;
  return score;
};

export const resolveChapterPayoffRange = (
  strategy: ResolvedNovelStrategy,
  role: RhythmRole,
): PayoffRange => {
  if (role === 'burst') {
    return {
      min: clamp(strategy.payoffRange.min + 1, 2, 4),
      max: clamp(strategy.payoffRange.max + 1, 3, 4),
    };
  }
  if (role === 'breathing') {
    return { min: 1, max: Math.max(1, strategy.payoffRange.min) };
  }
  if (role === 'resolution') {
    return { min: 1, max: clamp(strategy.payoffRange.max, 2, 4) };
  }
  return { ...strategy.payoffRange };
};

export const buildDynamicRhythmPlan = (
  chapters: RhythmSourceChapter[],
  strategy: ResolvedNovelStrategy,
): ChapterRhythmDecision[] => {
  const result: ChapterRhythmDecision[] = [];
  let chaptersSinceBurst = strategy.burstGap.min;

  chapters.forEach((chapter, index) => {
    const chapterNo = Number(chapter.order ?? index) + 1;
    const fn = normalizeOutlineChapterFunction(
      chapter.func,
      Number(chapter.order ?? index),
      strategy.storyType !== 'long_novel',
      chapter.title || '',
      chapter.brief || '',
    );
    const text = `${chapter.title || ''}\n${chapter.brief || ''}`;
    const score = functionIntensityScore(fn) + textIntensityScore(text);
    const isLast = index === chapters.length - 1;
    const explicitBurst = fn === 'climax' || fn === 'explosion';
    const quietFunction = fn === 'breathing' || fn === 'transition';
    const minGapReached = chaptersSinceBurst >= strategy.burstGap.min;
    const maxGapReached = chaptersSinceBurst >= strategy.burstGap.max;

    let role: RhythmRole;
    let reason: string;

    if (isLast && (fn === 'resolution' || fn === 'closing' || strategy.storyType !== 'long_novel')) {
      role = 'resolution';
      reason = '收束章优先兑现主线结果、关键伏笔或核心情绪，不再机械插入新的固定高潮。';
    } else if (explicitBurst) {
      role = 'burst';
      reason = `章节功能为 ${fn}，明确承担爆发/兑现职责。`;
    } else if (maxGapReached && !quietFunction) {
      role = 'burst';
      reason = `距上次主要兑现已达到策略上限 ${strategy.burstGap.max} 章，需要形成明显读者回报，避免连续蓄力。`;
    } else if (score >= 6 && minGapReached) {
      role = 'burst';
      reason = '章节任务本身包含高强度冲突、揭露或翻盘信号，且已完成必要蓄力。';
    } else if (quietFunction || score <= 0) {
      role = 'breathing';
      reason = '章节承担转场/缓冲职责，但仍必须产生至少一种软回报或有效推进。';
    } else if (score >= 4) {
      role = 'pressure';
      reason = '本章主要提升压力、危机或信息差，为后续兑现提供充分因果。';
    } else {
      role = 'build';
      reason = '本章以推进目标、铺设因果和积累期待为主，不强制套用固定高潮节拍。';
    }

    if (role === 'burst') chaptersSinceBurst = 0;
    else chaptersSinceBurst += 1;

    result.push({
      index,
      chapter: chapterNo,
      role,
      reason,
      payoffRange: resolveChapterPayoffRange(strategy, role),
      preferredPayoffs: strategy.preferredPayoffs,
    });
  });

  return result;
};

export const buildIdeaDiscoveryStrategyPrompt = (strategy: ResolvedNovelStrategy): string => {
  const payoffLabels = strategy.preferredPayoffs.map(item => PAYOFF_LABELS[item]).join('、');
  return `【本次网文策略】\n` +
    `- 平台：${strategy.label}；${strategy.guide}\n` +
    `- 高节奏原则：必须持续推进人物目标、冲突、信息差或关系变化；禁止连续大段只有背景说明。\n` +
    `- 读者回报：优先使用 ${payoffLabels}。回报形式根据题材动态组合，不把所有作品都写成同一种“打脸爽点”。\n` +
    `- 爆发间隔：通常在 ${strategy.burstGap.min}-${strategy.burstGap.max} 章内形成一次明显兑现，但由剧情任务决定具体位置，不使用固定“每3章必爆”。\n` +
    `- 标题策略：从 ${strategy.titleStrategies.join('、')} 等策略中择优，允许组合或创新，不限制为固定四公式。\n` +
    `- 强钩子：开局应尽快建立不可忽视的问题或目标，章节结尾保持追读；具体字数与频率根据平台和场景职责动态调整，不使用机械“每300字一次刺激”。`;
};

export const buildChapterPayoffPrompt = (
  decision: ChapterRhythmDecision,
  strategy: ResolvedNovelStrategy,
): string => {
  const labels = decision.preferredPayoffs.map(item => PAYOFF_LABELS[item]).join('、');
  const softRule = strategy.allowSoftPayoff
    ? '允许使用信息揭露、关系变化、情绪兑现、世界观发现等软回报。'
    : '优先使用强冲突、明显兑现、反转或危机升级等可感知回报。';
  return `【本章节奏职责】${decision.role}\n` +
    `原因：${decision.reason}\n` +
    `本章建议形成 ${decision.payoffRange.min}-${decision.payoffRange.max} 个有效读者回报；这里的“回报”不限于传统爽点，可从 ${labels} 中按剧情选择。${softRule}\n` +
    `数量不是机械 KPI：宁可 1 个有充分铺垫的强兑现，也不要为了凑数塞入无因反转或重复爽点。`;
};

export const buildPlatformQualityGuide = (strategy: ResolvedNovelStrategy): string => {
  return `${strategy.label}质量基准：${strategy.guide} ` +
    `检查重点是“是否持续推进并按当前章节职责提供有效回报”，而不是检查固定每300字情绪点、固定每3章爆发或每章固定2-3个爽点。`;
};
