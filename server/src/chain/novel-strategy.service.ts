import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export type PlatformId =
  | 'fanqie'
  | 'qidian'
  | 'zhihu'
  | 'douyin'
  | 'qimao'
  | 'jinjiang'
  | 'rules_horror'
  | 'generic';

export type PacingLevel = 'high' | 'very_high';
export type HookStrength = 'medium' | 'high' | 'very_high';
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

export interface StoryStrategyInput {
  platform?: unknown;
  storyType?: unknown;
  storyCategory?: unknown;
  storyTone?: unknown;
  writingStyle?: unknown;
  webNovelGenre?: unknown;
}

export interface PlatformStrategyProfile {
  id: PlatformId;
  label: string;
  pacing: PacingLevel;
  hookStrength: HookStrength;
  payoffRange: { min: number; max: number };
  burstGap: { min: number; max: number };
  allowSoftPayoff: boolean;
  preferredPayoffs: ReaderPayoffKind[];
  titleStrategies: string[];
  guide: string;
}

export interface ResolvedNovelStrategy {
  platform: PlatformId;
  platformLabel: string;
  storyType: string;
  storyCategory: string;
  storyTone: string[];
  writingStyle: string[];
  webNovelGenre: string[];
  pacing: PacingLevel;
  hookStrength: HookStrength;
  payoffRange: { min: number; max: number };
  burstGap: { min: number; max: number };
  allowSoftPayoff: boolean;
  preferredPayoffs: ReaderPayoffKind[];
  titleStrategies: string[];
  guide: string;
  reasons: string[];
}

export interface ChapterStrategyInput {
  chapterId?: string;
  chapterIndex?: number;
  chapterFunction?: unknown;
  goalArc?: unknown;
  chapterTitle?: unknown;
  outlineContract?: unknown;
  brief?: unknown;
}

export interface ChapterRhythmPlan {
  chapterIndex: number;
  order: number;
  title: string;
  chapterFunction: string;
  role: RhythmRole;
  reason: string;
  payoffRange: { min: number; max: number };
  preferredPayoffs: ReaderPayoffKind[];
  hookRequired: boolean;
}

export interface ResolvedChapterStrategy extends ResolvedNovelStrategy {
  chapter: {
    chapterId?: string;
    chapterIndex: number;
    title: string;
    chapterFunction: string;
    goalArc: string;
    role: RhythmRole;
  };
  chapterPayoffRange: { min: number; max: number };
  chapterPreferredPayoffs: ReaderPayoffKind[];
  chapterHookRequired: boolean;
  cadencePolicy: {
    hardHookAtOpening: boolean;
    hardDeadZoneCheck: boolean;
    deadZoneChars: number;
  };
  rhythmReason: string;
}

const PAYOFF_LABELS: Record<ReaderPayoffKind, string> = {
  victory: '阶段胜利/反击/逆袭',
  reversal: '有因果的反转',
  reveal: '关键新信息/真相推进',
  emotional_release: '情绪兑现/释放',
  relationship_shift: '人物关系变化',
  crisis_escalation: '危机升级/代价加码',
  foreshadow_payoff: '伏笔兑现',
  world_discovery: '世界观发现/规则揭示',
  competence_display: '能力展示/成长反馈',
  expectation_hook: '建立强烈下一步期待',
};

const PLATFORM_PROFILES: Record<PlatformId, PlatformStrategyProfile> = {
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
    titleStrategies: ['世界观奇点', '核心能力', '身份变化', '目标冲突', '成长承诺', '强悬念'],
    guide: '保持持续推进，同时允许世界观、成长和伏笔获得合理铺垫空间；阶段兑现要足够清晰，不能把“慢”写成停滞。',
  },
  zhihu: {
    id: 'zhihu',
    label: '知乎盐选',
    pacing: 'very_high',
    hookStrength: 'very_high',
    payoffRange: { min: 1, max: 3 },
    burstGap: { min: 2, max: 4 },
    allowSoftPayoff: true,
    preferredPayoffs: ['reveal', 'reversal', 'relationship_shift', 'emotional_release', 'expectation_hook'],
    titleStrategies: ['秘密悬念', '关系反差', '结果前置', '身份反差', '迫近代价', '纪实疑问'],
    guide: '现实代入、信息差和情绪推动优先。开篇快速建立读者问题，反转必须建立在事实线索和人物动机上。',
  },
  douyin: {
    id: 'douyin',
    label: '抖音故事',
    pacing: 'very_high',
    hookStrength: 'very_high',
    payoffRange: { min: 2, max: 4 },
    burstGap: { min: 1, max: 3 },
    allowSoftPayoff: false,
    preferredPayoffs: ['reversal', 'crisis_escalation', 'reveal', 'emotional_release', 'expectation_hook'],
    titleStrategies: ['结果前置', '极端处境', '迫近代价', '关系爆点', '强悬念'],
    guide: '短平快但不能乱快。信息、冲突、情绪和转折要高密度，任何爆点都必须能由前文因果支撑。',
  },
  qimao: {
    id: 'qimao',
    label: '七猫小说',
    pacing: 'very_high',
    hookStrength: 'very_high',
    payoffRange: { min: 2, max: 3 },
    burstGap: { min: 2, max: 4 },
    allowSoftPayoff: false,
    preferredPayoffs: ['victory', 'relationship_shift', 'reversal', 'reveal', 'expectation_hook'],
    titleStrategies: ['利益冲突', '身份反差', '关系爆点', '迫近代价', '强悬念'],
    guide: '高推进、高反馈，重点保证冲突与人物目标不断发生变化；不得用重复打脸替代真正的剧情升级。',
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
    titleStrategies: ['关系张力', '身份变化', '核心意象', '秘密悬念', '目标冲突'],
    guide: '人物关系、情绪和角色选择是重要推进力；可以细腻，但不能让关系与剧情长期原地踏步。',
  },
  rules_horror: {
    id: 'rules_horror',
    label: '规则怪谈',
    pacing: 'very_high',
    hookStrength: 'very_high',
    payoffRange: { min: 1, max: 3 },
    burstGap: { min: 2, max: 4 },
    allowSoftPayoff: true,
    preferredPayoffs: ['reveal', 'crisis_escalation', 'reversal', 'world_discovery', 'expectation_hook'],
    titleStrategies: ['危险规则', '违反代价', '禁忌悬念', '身份异常', '规则漏洞'],
    guide: '规则本身必须服务剧情因果。持续揭示规则、代价和漏洞，避免只罗列规则而没有人物行动。',
  },
  generic: {
    id: 'generic',
    label: '通用网文',
    pacing: 'high',
    hookStrength: 'high',
    payoffRange: { min: 1, max: 3 },
    burstGap: { min: 2, max: 5 },
    allowSoftPayoff: true,
    preferredPayoffs: ['reveal', 'crisis_escalation', 'relationship_shift', 'victory', 'expectation_hook'],
    titleStrategies: ['核心冲突', '身份反差', '目标与代价', '秘密悬念', '世界观奇点', '关系张力'],
    guide: '保持网络小说所需的持续推进和追读动力，但具体节拍由题材、平台、章节职责和前后文决定。',
  },
};

function textList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.map(v => String(v ?? '').trim()).filter(Boolean))];
  }
  if (typeof value !== 'string') return [];
  const text = value.trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return textList(parsed);
  } catch {}
  return [...new Set(text.split(/[、,，/|]/).map(v => v.trim()).filter(Boolean))];
}

function cleanText(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function uniquePayoffs(values: ReaderPayoffKind[]): ReaderPayoffKind[] {
  return [...new Set(values)];
}

function normalizePlatform(value: unknown): PlatformId {
  const raw = cleanText(value).toLowerCase();
  if (!raw) return 'generic';
  if (raw.includes('番茄') || raw === 'fanqie') return 'fanqie';
  if (raw.includes('起点') || raw === 'qidian') return 'qidian';
  if (raw.includes('知乎') || raw.includes('盐选') || raw === 'zhihu') return 'zhihu';
  if (raw.includes('抖音') || raw === 'douyin') return 'douyin';
  if (raw.includes('七猫') || raw === 'qimao') return 'qimao';
  if (raw.includes('晋江') || raw === 'jinjiang') return 'jinjiang';
  if (raw.includes('规则怪谈') || raw === 'rules_horror') return 'rules_horror';
  return 'generic';
}

function functionIntensity(chapterFunction: string): number {
  const fn = cleanText(chapterFunction).toLowerCase();
  if (/(climax|explosion|payoff|showdown|revelation)/.test(fn)) return 6;
  if (/(conflict|crisis|cliffhanger)/.test(fn)) return 4;
  if (/(charging|rising_action|rising|development)/.test(fn)) return 2;
  if (/(breathing|transition|paving|exposition)/.test(fn)) return -2;
  if (/(resolution|closing)/.test(fn)) return 1;
  return 0;
}

function textIntensity(text: string): number {
  let score = 0;
  if (/(高潮|决战|爆发|翻盘|反杀|逆袭|揭露真相|身份揭晓|突破|兑现|终极对抗)/.test(text)) score += 4;
  if (/(冲突|危机|对峙|追查|追击|争夺|逼迫|失控|代价|困局|选择)/.test(text)) score += 2;
  if (/(休整|过渡|日常|疗伤|缓冲|整理|铺垫|回顾|喘息)/.test(text)) score -= 2;
  if (/(结局|收束|落幕|终章|尾声)/.test(text)) score += 1;
  return score;
}

function explicitRole(chapterFunction: string, text: string): RhythmRole | null {
  const fn = cleanText(chapterFunction).toLowerCase();
  if (/(resolution|closing)/.test(fn) || /(终章|尾声|结局|收束|落幕)/.test(text)) return 'resolution';
  if (/(climax|explosion|payoff|showdown|revelation)/.test(fn)) return 'burst';
  if (/(breathing|transition)/.test(fn)) return 'breathing';
  if (/(conflict|crisis|cliffhanger)/.test(fn)) return 'pressure';
  return null;
}

function payoffRangeForRole(
  strategy: ResolvedNovelStrategy,
  role: RhythmRole,
): { min: number; max: number } {
  if (role === 'burst') {
    return {
      min: clamp(strategy.payoffRange.min + 1, 1, 4),
      max: clamp(strategy.payoffRange.max + 1, 2, 5),
    };
  }
  if (role === 'pressure') {
    return { ...strategy.payoffRange };
  }
  if (role === 'breathing') {
    return {
      min: 1,
      max: Math.max(1, Math.min(2, strategy.payoffRange.max)),
    };
  }
  if (role === 'resolution') {
    return {
      min: 1,
      max: Math.max(2, Math.min(3, strategy.payoffRange.max + 1)),
    };
  }
  return {
    min: Math.max(1, strategy.payoffRange.min - (strategy.allowSoftPayoff ? 1 : 0)),
    max: Math.max(2, strategy.payoffRange.max),
  };
}

@Injectable()
export class NovelStrategyService {
  private readonly logger = new Logger(NovelStrategyService.name);

  constructor(private readonly db: DatabaseService) {}

  resolve(input: StoryStrategyInput): ResolvedNovelStrategy {
    const platform = normalizePlatform(input.platform);
    const profile = PLATFORM_PROFILES[platform];
    const storyType = cleanText(input.storyType) || 'long_novel';
    const storyCategory = cleanText(input.storyCategory);
    const storyTone = textList(input.storyTone);
    const writingStyle = textList(input.writingStyle);
    const webNovelGenre = textList(input.webNovelGenre);
    const tags = [...storyTone, ...writingStyle, ...webNovelGenre, storyCategory].join('、');

    let minPayoff = profile.payoffRange.min;
    let maxPayoff = profile.payoffRange.max;
    let minGap = profile.burstGap.min;
    let maxGap = profile.burstGap.max;
    let allowSoftPayoff = profile.allowSoftPayoff;
    let preferredPayoffs = [...profile.preferredPayoffs];
    const reasons = [`平台=${profile.label}`];

    if (/(爽文|无敌流|系统流|逆袭|热血|战神|升级|扮猪吃虎)/.test(tags)) {
      minPayoff += 1;
      maxPayoff += 1;
      maxGap -= 1;
      allowSoftPayoff = false;
      preferredPayoffs = uniquePayoffs([
        'victory',
        'competence_display',
        'reversal',
        ...preferredPayoffs,
      ]);
      reasons.push('强反馈流派/基调：提高兑现密度，缩短最大蓄力跨度');
    }

    if (/(悬疑|烧脑|推理|规则怪谈|无限流)/.test(tags)) {
      preferredPayoffs = uniquePayoffs([
        'reveal',
        'reversal',
        'crisis_escalation',
        'expectation_hook',
        ...preferredPayoffs,
      ]);
      reasons.push('悬疑/规则类：把信息揭露和危机升级视为有效回报');
    }

    if (/(情感|甜宠|虐恋|女强|言情)/.test(tags)) {
      preferredPayoffs = uniquePayoffs([
        'relationship_shift',
        'emotional_release',
        'reveal',
        ...preferredPayoffs,
      ]);
      reasons.push('情感类：关系变化和情绪兑现参与节奏计算');
    }

    if (/(白描|朴素|现实|日常|群像叙事|群像|社会)/.test(tags)) {
      minPayoff -= 1;
      maxGap += 1;
      allowSoftPayoff = true;
      preferredPayoffs = uniquePayoffs([
        'relationship_shift',
        'reveal',
        'world_discovery',
        ...preferredPayoffs,
      ]);
      reasons.push('现实/白描/群像：允许软回报和更长蓄力，但不允许无推进');
    }

    if (storyType === 'short_story') {
      maxGap = Math.min(maxGap, 4);
      reasons.push('短篇：压缩最大无兑现跨度');
    }

    minPayoff = clamp(minPayoff, 1, 3);
    maxPayoff = clamp(Math.max(maxPayoff, minPayoff), 2, 4);
    minGap = clamp(minGap, 1, 4);
    maxGap = clamp(Math.max(maxGap, minGap + 1), 2, 6);

    return {
      platform,
      platformLabel: profile.label,
      storyType,
      storyCategory,
      storyTone,
      writingStyle,
      webNovelGenre,
      pacing: profile.pacing,
      hookStrength: profile.hookStrength,
      payoffRange: { min: minPayoff, max: maxPayoff },
      burstGap: { min: minGap, max: maxGap },
      allowSoftPayoff,
      preferredPayoffs,
      titleStrategies: [...profile.titleStrategies],
      guide: profile.guide,
      reasons,
    };
  }

  resolveForProject(projectId: string): ResolvedNovelStrategy {
    try {
      const row = this.db.getDb()
        .prepare('SELECT type, target_platform, platform_style, settings FROM projects WHERE id = ?')
        .get(projectId) as any;
      if (!row) return this.resolve({});
      let settings: Record<string, any> = {};
      try {
        const parsed = JSON.parse(String(row.settings || '{}'));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) settings = parsed;
      } catch {}

      return this.resolve({
        platform:
          row.target_platform
          || row.platform_style
          || settings.recommendedPlatform
          || settings.platform,
        storyType: row.type,
        storyCategory: settings.genre || settings.storyCategory,
        storyTone: settings.storyTone,
        writingStyle: settings.writingStyle || settings.writingStyles || settings.style,
        webNovelGenre: settings.webNovelGenre,
      });
    } catch (error) {
      this.logger.warn(
        `resolveForProject(${projectId}) failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return this.resolve({});
    }
  }

  buildRhythmPlan(
    chapters: Array<{
      order?: number;
      title?: unknown;
      func?: unknown;
      chapterFunction?: unknown;
      brief?: unknown;
      content?: unknown;
    }>,
    strategy: ResolvedNovelStrategy,
  ): ChapterRhythmPlan[] {
    let chaptersSinceBurst = 0;

    return chapters.map((chapter, index) => {
      const chapterIndex = index + 1;
      const order = Number.isFinite(Number(chapter.order))
        ? Number(chapter.order)
        : index;
      const title = cleanText(chapter.title) || `第${chapterIndex}章`;
      const chapterFunction = cleanText(chapter.chapterFunction || chapter.func);
      const brief = cleanText(chapter.brief || chapter.content);
      const text = `${title} ${brief}`;
      const explicit = explicitRole(chapterFunction, text);
      const intensity = functionIntensity(chapterFunction) + textIntensity(text);

      let role: RhythmRole;
      let reason: string;

      if (explicit === 'resolution') {
        role = 'resolution';
        reason = '章节功能/语义明确承担收束与兑现';
      } else if (explicit === 'burst' || intensity >= 6) {
        role = 'burst';
        reason = '章节功能或事件语义已明确进入高潮/揭示/爆发';
      } else if (explicit === 'breathing') {
        role = 'breathing';
        reason = '章节明确承担过渡/呼吸职责，不为了章号强制爆发';
      } else if (chaptersSinceBurst >= strategy.burstGap.max) {
        role = 'burst';
        reason = `距离上次明显兑现已达到本策略最大蓄力跨度 ${strategy.burstGap.max} 章`;
      } else if (explicit === 'pressure' || intensity >= 2) {
        role = 'pressure';
        reason = '本章以危机、对峙、信息差或代价升级为主要职责';
      } else {
        role = 'build';
        reason = '本章负责推进、铺设因果和累积下一次兑现，不按固定章号轮换';
      }

      if (role === 'burst' || role === 'resolution') chaptersSinceBurst = 0;
      else chaptersSinceBurst += 1;

      const payoffRange = payoffRangeForRole(strategy, role);
      const hookRequired =
        role !== 'resolution'
        && (
          strategy.hookStrength === 'very_high'
          || role === 'pressure'
          || role === 'burst'
        );

      return {
        chapterIndex,
        order,
        title,
        chapterFunction,
        role,
        reason,
        payoffRange,
        preferredPayoffs: [...strategy.preferredPayoffs],
        hookRequired,
      };
    });
  }

  resolveForChapter(
    projectId: string,
    input: ChapterStrategyInput = {},
  ): ResolvedChapterStrategy {
    const strategy = this.resolveForProject(projectId);
    let chapterIndex = Number(input.chapterIndex || 0);
    let title = cleanText(input.chapterTitle);
    let chapterFunction = cleanText(input.chapterFunction);
    let goalArc = cleanText(input.goalArc);
    let outlineContract = cleanText(input.outlineContract);
    let rows: any[] = [];

    try {
      const db = this.db.getDb();

      if (input.chapterId) {
        const bound = db.prepare(`
          SELECT c.chapter_index, o.title, o.chapter_function, o.goal_arc, o.content
          FROM chapters c
          LEFT JOIN outlines o ON o.id = c.outline_id AND o.project_id = c.project_id
          WHERE c.id = ? AND c.project_id = ?
          LIMIT 1
        `).get(input.chapterId, projectId) as any;
        if (bound) {
          chapterIndex ||= Number(bound.chapter_index || 0);
          title ||= cleanText(bound.title);
          chapterFunction ||= cleanText(bound.chapter_function);
          goalArc ||= cleanText(bound.goal_arc);
          outlineContract ||= cleanText(bound.content);
        }
      }

      rows = db.prepare(`
        SELECT "order", title, chapter_function, goal_arc, content
        FROM outlines
        WHERE project_id = ? AND level = 'chapter'
        ORDER BY "order"
      `).all(projectId) as any[];
    } catch (error) {
      this.logger.warn(
        `resolveForChapter(${projectId}) outline read failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const source = rows.length
      ? rows.map((row, index) => ({
          order: Number(row.order ?? index),
          title: row.title,
          chapterFunction: row.chapter_function,
          brief: row.content,
        }))
      : [{
          order: Math.max(0, chapterIndex - 1),
          title,
          chapterFunction,
          brief: input.brief || outlineContract,
        }];

    const plan = this.buildRhythmPlan(source, strategy);
    const byIndex = chapterIndex > 0 ? plan[chapterIndex - 1] : undefined;
    const byTitle = title
      ? plan.find(item => item.title === title)
      : undefined;
    const current = byIndex || byTitle || plan[0] || {
      chapterIndex: Math.max(1, chapterIndex || 1),
      order: Math.max(0, chapterIndex - 1),
      title: title || `第${Math.max(1, chapterIndex || 1)}章`,
      chapterFunction,
      role: 'build' as RhythmRole,
      reason: '无完整章节序列，按本章语义采用推进职责',
      payoffRange: payoffRangeForRole(strategy, 'build'),
      preferredPayoffs: [...strategy.preferredPayoffs],
      hookRequired: strategy.hookStrength !== 'medium',
    };

    const role = current.role;
    const hardHookAtOpening =
      role !== 'breathing'
      && role !== 'resolution'
      && strategy.hookStrength === 'very_high';

    const hardDeadZoneCheck =
      role === 'burst'
      || (
        role === 'pressure'
        && strategy.pacing === 'very_high'
      );

    const deadZoneChars =
      role === 'burst'
        ? (strategy.pacing === 'very_high' ? 650 : 800)
        : role === 'pressure'
          ? (strategy.pacing === 'very_high' ? 800 : 950)
          : role === 'breathing'
            ? 1400
            : 1100;

    return {
      ...strategy,
      chapter: {
        chapterId: input.chapterId,
        chapterIndex: current.chapterIndex,
        title: current.title || title,
        chapterFunction: current.chapterFunction || chapterFunction,
        goalArc,
        role,
      },
      chapterPayoffRange: { ...current.payoffRange },
      chapterPreferredPayoffs: [...current.preferredPayoffs],
      chapterHookRequired: current.hookRequired,
      cadencePolicy: {
        hardHookAtOpening,
        hardDeadZoneCheck,
        deadZoneChars,
      },
      rhythmReason: current.reason,
    };
  }

  buildIdeaDiscoveryContract(strategy: ResolvedNovelStrategy): string {
    const titlePool = strategy.titleStrategies.map((item, i) => `${i + 1}. ${item}`).join('；');
    return `【本次创作策略】
平台：${strategy.platformLabel}
节奏：${strategy.pacing === 'very_high' ? '高密度高追读' : '持续推进、允许必要铺垫'}
平台导向：${strategy.guide}
标题策略池：${titlePool}
标题必须具备商业吸引力，但不是只能套固定四公式；应从策略池择优、组合或变体。
有效读者回报包括：${strategy.preferredPayoffs.map(v => PAYOFF_LABELS[v]).join('、')}。
禁止使用“每300字固定一个情绪点”“固定第3章爆”“固定10章大爆”这类机械节拍；
要保持网文的高推进和高反馈，但具体兑现位置由题材、因果、章节职责和前后文共同决定。`;
  }

  buildChapterPlanningContract(
    plan: ChapterRhythmPlan,
    strategy: ResolvedNovelStrategy,
  ): string {
    return `【本章节奏职责】
- role: ${plan.role}
- 原因: ${plan.reason}
- 本章建议形成 ${plan.payoffRange.min}-${plan.payoffRange.max} 个有效读者回报
- 优先回报: ${plan.preferredPayoffs.map(v => PAYOFF_LABELS[v]).join('、')}
- 章末追读钩子: ${plan.hookRequired ? '需要，且必须由本章事件自然产生' : '按本章收束职责决定，不为凑钩子破坏闭环'}

“有效读者回报”不限于传统打脸/爽点，也可以是关键新信息、关系变化、危机升级、伏笔兑现、能力展示、情绪释放或强期待。
数量是策略范围，不是机械 KPI；宁可少而有效，也不要为了凑数制造无因反转、重复打脸或提前兑现后续章节。`;
  }

  buildChapterWritingContract(strategy: ResolvedChapterStrategy): string {
    return `## 运行时网文策略（本章真实生成约束）
平台：${strategy.platformLabel}
题材/基调：${[
  strategy.storyCategory,
  ...strategy.storyTone,
  ...strategy.writingStyle,
  ...strategy.webNovelGenre,
].filter(Boolean).join('、') || '按项目已确认配置'}
本章节奏职责：${strategy.chapter.role}
职责依据：${strategy.rhythmReason}
本章有效读者回报建议：${strategy.chapterPayoffRange.min}-${strategy.chapterPayoffRange.max} 个
优先回报类型：${strategy.chapterPreferredPayoffs.map(v => PAYOFF_LABELS[v]).join('、')}
章末钩子：${strategy.chapterHookRequired ? '需要强追读，但必须从本章因果自然长出' : '按收束/呼吸职责处理，不强行制造悬念'}

执行原则：
1. 网络小说仍然要求高推进、高反馈；动态化不是降速，而是避免固定节拍。
2. 本章每一段必须至少服务“事件推进 / 冲突压力 / 信息揭露 / 关系变化 / 人物行动 / 氛围服务剧情”之一，禁止无功能注水。
3. ${strategy.chapter.role === 'burst'
      ? '本章是爆发/兑现章：前面已积累的冲突、信息差或能力必须形成明显兑现，不得继续只铺不收。'
      : strategy.chapter.role === 'pressure'
        ? '本章是加压章：重点升级代价、冲突或信息差，为后续爆发建立充分因果；不为凑爽点提前透支高潮。'
        : strategy.chapter.role === 'breathing'
          ? '本章是呼吸/过渡章：可以降低瞬时刺激，但人物目标、关系、信息或下一阶段动机至少有一项发生真实变化。'
          : strategy.chapter.role === 'resolution'
            ? '本章是收束章：优先兑现核心问题、情绪与伏笔，不为追读硬塞新的无关危机。'
            : '本章是推进/蓄力章：持续推进目标与阻力，让后续兑现拥有明确因果，不按章号机械爆发。'}
4. 禁止“固定每300字一个情绪点 / 固定每3章一爆 / 每章必须同数量爽点”。
5. 爽点、反转、钩子都必须有铺垫和因果；高密度不等于随机加刺激。`;
  }

  buildQualityGuide(strategy: ResolvedChapterStrategy | ResolvedNovelStrategy): string {
    const chapter = 'chapter' in strategy ? strategy : null;
    const roleLine = chapter
      ? `当前章节奏职责：${chapter.chapter.role}；本章回报建议：${chapter.chapterPayoffRange.min}-${chapter.chapterPayoffRange.max}。`
      : '';
    return `${strategy.platformLabel}质量标准：${strategy.guide}
${roleLine}
质检时重点判断“是否持续产生有效推进与读者回报”，不要用固定每300字、固定每3章、固定爽点数量作为数学公式。
允许不同职责章节有不同刺激强度：爆发章看兑现，加压章看压力升级，呼吸章看有效变化，收束章看闭环。`;
  }

  buildPlatformGuide(strategy: ResolvedNovelStrategy): string {
    return `${strategy.platformLabel}：${strategy.guide}
节奏=${strategy.pacing}；钩子强度=${strategy.hookStrength}；基础回报范围=${strategy.payoffRange.min}-${strategy.payoffRange.max}；
标题策略=${strategy.titleStrategies.join('、')}。`;
  }

  toSnapshot(strategy: ResolvedNovelStrategy): Record<string, unknown> {
    return {
      version: 2,
      resolvedAt: new Date().toISOString(),
      platform: strategy.platform,
      platformLabel: strategy.platformLabel,
      pacing: strategy.pacing,
      hookStrength: strategy.hookStrength,
      payoffRange: strategy.payoffRange,
      burstGap: strategy.burstGap,
      allowSoftPayoff: strategy.allowSoftPayoff,
      preferredPayoffs: strategy.preferredPayoffs,
      titleStrategies: strategy.titleStrategies,
      reasons: strategy.reasons,
    };
  }
}
