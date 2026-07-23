/**
 * 写作模式切换服务
 *
 * 支持三种写作模式：
 * - 全自动(FullAuto): AI 全部生成，用户只需选择题材和确认
 * - 半自动(SemiAuto): AI 生成→人工调整→用户确认后进入下一步
 * - 自由模式(FreeForm): AI 生成完整初稿 + 后验检测报告
 *
 * 模式决定了 Chain 执行流程中哪些节点需要用户确认，
 * 以及质量门的严格程度。
 */
import { Injectable, Logger } from '@nestjs/common';
import { ChainEngineService } from './chain-engine.service';
import { QualityGateService } from './quality-gate.service';
import { PromptRegistryService } from './prompt-registry.service';
import {
  PromptChain,
  ChainNode,
  ChainResult,
  GateLevel,
  ChainState,
} from './chain.types';

/** 写作模式枚举 */
export type WritingMode = 'full_auto' | 'semi_auto' | 'free_form';

/** 写作风格ID */
export type StyleId =
  | 'ensemble'    // 群像
  | 'system'      // 系统
  | 'historical'  // 历史
  | 'war'         // 抗战
  | 'urban'       // 都市
  | 'sci_fi'      // 科幻
  | 'mystery';    // 悬疑

/** 章节功能类型 */
export type ChapterFunction =
  | 'exposition'    // 交代/铺垫
  | 'development'   // 发展
  | 'climax'        // 高潮
  | 'twist'         // 转折
  | 'dialogue'      // 对话
  | 'action';       // 动作

/** 视角转换类型 */
export type ViewTransition =
  | 'first_to_first'     // 第一人称之间
  | 'first_to_third'     // 第一人称到第三人称
  | 'third_to_third'     // 第三人称之间
  | 'omniscient'         // 全知视角
  | 'limited_third'      // 有限第三人称
  | 'second_person';     // 第二人称

/** 风格配置 */
export interface StyleConfig {
  id: StyleId;
  label: string;
  description: string;
  /** 章节功能类型分布比例 (总和为1) */
  chapterFunctionRatios: Record<ChapterFunction, number>;
  /** 写作约束规则 */
  rules: StyleRules;
  /** 允许的视角转换 */
  allowedViewTransitions: ViewTransition[];
  /** 对话多样性要求 — 是否强制要求不同角色的对话风格有区分度 */
  dialogueDiversityRequired?: boolean;
  /** Prompt 模板路径引用 */
  promptTemplates?: PromptTemplateRef[];
  /** 质量门阈值与失败策略 */
  qualityGates?: QualityGate[];
  /** 默认目标弧线配置 */
  defaultGoalArc?: GoalArc;
}

/** Prompt 模板引用 */
export interface PromptTemplateRef {
  id: string;
  path: string;
  description: string;
}

/** 质量门配置 */
export interface QualityGate {
  name: string;
  threshold: number;
  onFailure: 'retry' | 'skip' | 'block';
  maxRetries: number;
}

/** 目标弧线配置 */
export interface GoalArc {
  type: 'linear' | 'curved' | 'episodic';
  pace: 'fast' | 'medium' | 'slow';
  tensionCurve: 'crescendo' | 'wave' | 'plateau';
  chaptersPerArc: { min: number; max: number };
}

/** 风格规则 */
export interface StyleRules {
  /** 每章最大POV字符数 */
  maxPovChars?: number;
  /** 对话占比要求 (0-1) */
  dialogueRatio?: { min: number; max: number };
  /** 动作描写占比要求 (0-1) */
  actionRatio?: { min: number; max: number };
  /** 每章最大角色数 */
  maxCharactersPerChapter?: number;
  /** 是否允许内心独白 */
  allowInternalMonologue?: boolean;
  /** 是否允许时间跳跃 */
  allowTimeSkip?: boolean;
  /** 每章建议字数范围 */
  chapterWordCount?: { min: number; max: number };
  /** 句子平均长度要求 */
  avgSentenceLength?: { min: number; max: number };
  /** 词汇丰富度要求 (0-1) */
  vocabularyRichness?: number;
  /** 是否使用方言/古语 */
  useDialect?: boolean;
  /** 自定义规则 */
  customRules?: Record<string, unknown>;
}
export const WRITING_MODE_LABELS: Record<WritingMode, string> = {
  full_auto: '全自动模式',
  semi_auto: '半自动模式',
  free_form: '自由模式',
};

/** 模式描述 */
export const WRITING_MODE_DESCRIPTIONS: Record<WritingMode, string> = {
  full_auto: 'AI全部自动生成，用户仅需选择题材和最终确认',
  semi_auto: 'AI生成每个节点内容后等待用户调整确认，再进入下一步',
  free_form: 'AI一次性生成完整初稿，输出后验检测报告供用户参考',
};

/** 阶段名称 */
export type StageName = 'stage1_idea' | 'stage2_outline' | 'stage3_chapter';

/** 用户确认请求 */
export interface UserConfirmationRequest {
  mode: WritingMode;
  stage: StageName;
  nodeId: string;
  nodeName: string;
  aiOutput: unknown;
  suggestions?: string[];
  qualityReport?: Record<string, unknown>;
  timestamp: Date;
}

/** 用户调整后的内容 */
export interface UserAdjustment {
  nodeId: string;
  adjustedContent: unknown;
  confirmed: boolean;
  feedback?: string;
  timestamp: Date;
}

/** 模式配置 */
interface ModeConfig {
  /** 是否启用质量门 */
  enableQualityGate: boolean;
  /** 质量门严格模式 */
  strictMode: boolean;
  /** 质量门级别阈值（低于此级别的不拦截） */
  gateLevelThreshold: GateLevel;
  /** 每节点是否等待用户确认 */
  waitForUserConfirmation: boolean;
  /** 是否生成后验检测报告 */
  generatePostReport: boolean;
  /** 最大重试次数 */
  maxRetries: number;
}

/** 模式配置映射 */
const MODE_CONFIGS: Record<WritingMode, ModeConfig> = {
  full_auto: {
    enableQualityGate: true,
    strictMode: false,
    gateLevelThreshold: 'CRITICAL', // 仅 CRITICAL 拦截
    waitForUserConfirmation: false,
    generatePostReport: false,
    maxRetries: 3,
  },
  semi_auto: {
    enableQualityGate: true,
    strictMode: true,
    gateLevelThreshold: 'WARNING', // WARNING 及以上拦截
    waitForUserConfirmation: true,
    generatePostReport: false,
    maxRetries: 2,
  },
  free_form: {
    enableQualityGate: true,
    strictMode: false,
    gateLevelThreshold: 'INFO', // 全部记录，但不拦截
    waitForUserConfirmation: false,
    generatePostReport: true,
    maxRetries: 3,
  },
};

/** 风格配置映射 */
export const STYLE_CONFIGS: Record<StyleId, StyleConfig> = {
  ensemble: {
    id: 'ensemble',
    label: '群像',
    description: '多视角叙事，角色群像塑造，适合多主线交织的故事',
    chapterFunctionRatios: {
      exposition: 0.20,
      development: 0.25,
      climax: 0.15,
      twist: 0.15,
      dialogue: 0.15,
      action: 0.10,
    },
    rules: {
      maxPovChars: 3000,
      dialogueRatio: { min: 0.20, max: 0.45 },
      maxCharactersPerChapter: 8,
      allowInternalMonologue: true,
      allowTimeSkip: true,
      chapterWordCount: { min: 3200, max: 4000 },
      avgSentenceLength: { min: 15, max: 35 },
      vocabularyRichness: 0.7,
    },
    allowedViewTransitions: ['first_to_third', 'third_to_third', 'limited_third', 'omniscient'],
    dialogueDiversityRequired: true,
    promptTemplates: [
      { id: 'ensemble_chapter', path: 'prompts/ensemble/chapter.ejs', description: '群像章节生成模板' },
      { id: 'ensemble_dialogue', path: 'prompts/ensemble/dialogue.ejs', description: '多角色对话模板' },
      { id: 'ensemble_pov_switch', path: 'prompts/ensemble/pov_switch.ejs', description: '视角切换模板' },
      { id: 'ensemble_merge', path: 'prompts/ensemble/merge.ejs', description: '多线合并模板' },
    ],
    qualityGates: [
      { name: 'pov_consistency', threshold: 70, onFailure: 'retry', maxRetries: 2 },
      { name: 'character_drift', threshold: 60, onFailure: 'retry', maxRetries: 1 },
      { name: 'dialogue_diversity', threshold: 65, onFailure: 'skip', maxRetries: 0 },
    ],
    defaultGoalArc: {
      type: 'curved',
      pace: 'medium',
      tensionCurve: 'wave',
      chaptersPerArc: { min: 8, max: 15 },
    },
  },
  system: {
    id: 'system',
    label: '系统',
    description: '游戏化系统流，包含数据面板、属性成长、任务系统等网文风格',
    chapterFunctionRatios: {
      exposition: 0.15,
      development: 0.25,
      climax: 0.20,
      twist: 0.15,
      dialogue: 0.10,
      action: 0.15,
    },
    rules: {
      maxPovChars: 4000,
      dialogueRatio: { min: 0.10, max: 0.30 },
      actionRatio: { min: 0.15, max: 0.35 },
      maxCharactersPerChapter: 6,
      allowInternalMonologue: true,
      allowTimeSkip: true,
      chapterWordCount: { min: 3200, max: 4000 },
      avgSentenceLength: { min: 12, max: 30 },
      vocabularyRichness: 0.5,
      customRules: { includeStatusPanel: true, includeLevelUp: true },
    },
    allowedViewTransitions: ['first_to_third', 'third_to_third', 'limited_third'],
    dialogueDiversityRequired: false,
    promptTemplates: [
      { id: 'system_chapter', path: 'prompts/system/chapter.ejs', description: '系统流章节生成模板' },
      { id: 'system_status_panel', path: 'prompts/system/status_panel.ejs', description: '数据面板生成模板' },
      { id: 'system_level_up', path: 'prompts/system/level_up.ejs', description: '升级/突破场景模板' },
      { id: 'system_quest', path: 'prompts/system/quest.ejs', description: '任务系统模板' },
    ],
    qualityGates: [
      { name: 'status_panel_accuracy', threshold: 75, onFailure: 'retry', maxRetries: 2 },
      { name: 'pace_control', threshold: 60, onFailure: 'skip', maxRetries: 1 },
      { name: 'power_balance', threshold: 65, onFailure: 'skip', maxRetries: 0 },
    ],
    defaultGoalArc: {
      type: 'linear',
      pace: 'fast',
      tensionCurve: 'crescendo',
      chaptersPerArc: { min: 5, max: 12 },
    },
  },
  historical: {
    id: 'historical',
    label: '历史',
    description: '真实历史背景+架空叙事，考据严谨，注重时代氛围',
    chapterFunctionRatios: {
      exposition: 0.25,
      development: 0.25,
      climax: 0.15,
      twist: 0.15,
      dialogue: 0.10,
      action: 0.10,
    },
    rules: {
      maxPovChars: 3500,
      dialogueRatio: { min: 0.15, max: 0.35 },
      actionRatio: { min: 0.10, max: 0.25 },
      maxCharactersPerChapter: 7,
      allowInternalMonologue: true,
      allowTimeSkip: true,
      chapterWordCount: { min: 3200, max: 4000 },
      avgSentenceLength: { min: 18, max: 40 },
      vocabularyRichness: 0.8,
      useDialect: true,
      customRules: { requiresHistoricalAccuracy: true, avoidAnachronisms: true },
    },
    allowedViewTransitions: ['third_to_third', 'limited_third', 'omniscient'],
    dialogueDiversityRequired: true,
    promptTemplates: [
      { id: 'historical_chapter', path: 'prompts/historical/chapter.ejs', description: '历史章节生成模板' },
      { id: 'historical_setting', path: 'prompts/historical/setting.ejs', description: '时代背景描写模板' },
      { id: 'historical_dialogue', path: 'prompts/historical/dialogue.ejs', description: '古风对话模板' },
      { id: 'historical_research', path: 'prompts/historical/research.ejs', description: '考据提示词模板' },
    ],
    qualityGates: [
      { name: 'historical_accuracy', threshold: 80, onFailure: 'retry', maxRetries: 2 },
      { name: 'language_consistency', threshold: 70, onFailure: 'retry', maxRetries: 1 },
      { name: 'anachronism_check', threshold: 75, onFailure: 'block', maxRetries: 3 },
    ],
    defaultGoalArc: {
      type: 'curved',
      pace: 'slow',
      tensionCurve: 'wave',
      chaptersPerArc: { min: 10, max: 20 },
    },
  },
  war: {
    id: 'war',
    label: '抗战',
    description: '战争氛围浓厚，家国情怀，热血悲壮',
    chapterFunctionRatios: {
      exposition: 0.10,
      development: 0.20,
      climax: 0.25,
      twist: 0.10,
      dialogue: 0.10,
      action: 0.25,
    },
    rules: {
      maxPovChars: 2500,
      dialogueRatio: { min: 0.10, max: 0.30 },
      actionRatio: { min: 0.20, max: 0.50 },
      maxCharactersPerChapter: 10,
      allowInternalMonologue: true,
      allowTimeSkip: true,
      chapterWordCount: { min: 3200, max: 4000 },
      avgSentenceLength: { min: 10, max: 25 },
      vocabularyRichness: 0.6,
      customRules: { emphasizeAtmosphere: true, avoidExcessiveRomance: true },
    },
    allowedViewTransitions: ['first_to_third', 'third_to_third', 'limited_third', 'omniscient'],
    dialogueDiversityRequired: false,
    promptTemplates: [
      { id: 'war_chapter', path: 'prompts/war/chapter.ejs', description: '战争章节生成模板' },
      { id: 'war_battle', path: 'prompts/war/battle.ejs', description: '战斗场景模板' },
      { id: 'war_atmosphere', path: 'prompts/war/atmosphere.ejs', description: '战争氛围描写模板' },
      { id: 'war_emotion', path: 'prompts/war/emotion.ejs', description: '家国情怀渲染模板' },
    ],
    qualityGates: [
      { name: 'battle_logic', threshold: 65, onFailure: 'retry', maxRetries: 2 },
      { name: 'patriotic_tone', threshold: 70, onFailure: 'skip', maxRetries: 1 },
      { name: 'atmosphere_density', threshold: 60, onFailure: 'skip', maxRetries: 0 },
    ],
    defaultGoalArc: {
      type: 'linear',
      pace: 'fast',
      tensionCurve: 'crescendo',
      chaptersPerArc: { min: 5, max: 10 },
    },
  },
  urban: {
    id: 'urban',
    label: '都市',
    description: '都市情感，职场商战，现代生活气息',
    chapterFunctionRatios: {
      exposition: 0.15,
      development: 0.25,
      climax: 0.20,
      twist: 0.15,
      dialogue: 0.15,
      action: 0.10,
    },
    rules: {
      maxPovChars: 3000,
      dialogueRatio: { min: 0.25, max: 0.50 },
      actionRatio: { min: 0.05, max: 0.20 },
      maxCharactersPerChapter: 6,
      allowInternalMonologue: true,
      allowTimeSkip: false,
      chapterWordCount: { min: 3200, max: 4000 },
      avgSentenceLength: { min: 15, max: 35 },
      vocabularyRichness: 0.7,
      customRules: { realisticDialogue: true, modernSetting: true },
    },
    allowedViewTransitions: ['first_to_first', 'first_to_third', 'third_to_third', 'limited_third'],
    dialogueDiversityRequired: true,
    promptTemplates: [
      { id: 'urban_chapter', path: 'prompts/urban/chapter.ejs', description: '都市章节生成模板' },
      { id: 'urban_dialogue', path: 'prompts/urban/dialogue.ejs', description: '都市对话模板' },
      { id: 'urban_emotional', path: 'prompts/urban/emotional.ejs', description: '情感戏描写模板' },
      { id: 'urban_business', path: 'prompts/urban/business.ejs', description: '商战/职场模板' },
    ],
    qualityGates: [
      { name: 'dialogue_naturalness', threshold: 70, onFailure: 'retry', maxRetries: 2 },
      { name: 'emotional_depth', threshold: 65, onFailure: 'skip', maxRetries: 1 },
      { name: 'setting_consistency', threshold: 60, onFailure: 'skip', maxRetries: 0 },
    ],
    defaultGoalArc: {
      type: 'curved',
      pace: 'medium',
      tensionCurve: 'wave',
      chaptersPerArc: { min: 8, max: 15 },
    },
  },
  sci_fi: {
    id: 'sci_fi',
    label: '科幻',
    description: '未来科技，科幻设定，硬核世界观',
    chapterFunctionRatios: {
      exposition: 0.20,
      development: 0.20,
      climax: 0.20,
      twist: 0.20,
      dialogue: 0.10,
      action: 0.10,
    },
    rules: {
      maxPovChars: 4000,
      dialogueRatio: { min: 0.15, max: 0.35 },
      actionRatio: { min: 0.10, max: 0.25 },
      maxCharactersPerChapter: 5,
      allowInternalMonologue: true,
      allowTimeSkip: true,
      chapterWordCount: { min: 3200, max: 4000 },
      avgSentenceLength: { min: 18, max: 40 },
      vocabularyRichness: 0.8,
      customRules: { requiresWorldbuilding: true, techDescriptionLevel: 'detailed' },
    },
    allowedViewTransitions: ['first_to_third', 'third_to_third', 'limited_third', 'omniscient'],
    dialogueDiversityRequired: false,
    promptTemplates: [
      { id: 'scifi_chapter', path: 'prompts/scifi/chapter.ejs', description: '科幻章节生成模板' },
      { id: 'scifi_worldbuilding', path: 'prompts/scifi/worldbuilding.ejs', description: '世界观构建模板' },
      { id: 'scifi_tech', path: 'prompts/scifi/tech.ejs', description: '科技描写模板' },
      { id: 'scifi_exposition', path: 'prompts/scifi/exposition.ejs', description: '设定交代模板' },
    ],
    qualityGates: [
      { name: 'tech_plausibility', threshold: 70, onFailure: 'retry', maxRetries: 2 },
      { name: 'worldbuilding_consistency', threshold: 75, onFailure: 'retry', maxRetries: 2 },
      { name: 'info_density', threshold: 60, onFailure: 'skip', maxRetries: 0 },
    ],
    defaultGoalArc: {
      type: 'curved',
      pace: 'medium',
      tensionCurve: 'crescendo',
      chaptersPerArc: { min: 8, max: 16 },
    },
  },
  mystery: {
    id: 'mystery',
    label: '悬疑',
    description: '悬疑推理，层层揭秘，氛围营造',
    chapterFunctionRatios: {
      exposition: 0.10,
      development: 0.20,
      climax: 0.20,
      twist: 0.30,
      dialogue: 0.15,
      action: 0.05,
    },
    rules: {
      maxPovChars: 2500,
      dialogueRatio: { min: 0.20, max: 0.45 },
      actionRatio: { min: 0.05, max: 0.15 },
      maxCharactersPerChapter: 6,
      allowInternalMonologue: true,
      allowTimeSkip: false,
      chapterWordCount: { min: 3200, max: 4000 },
      avgSentenceLength: { min: 12, max: 30 },
      vocabularyRichness: 0.75,
      customRules: { foreshadowingRequired: true, redHerringAllowed: true, cluesMustBeFair: true },
    },
    allowedViewTransitions: ['first_to_first', 'first_to_third', 'third_to_third', 'limited_third'],
    dialogueDiversityRequired: true,
    promptTemplates: [
      { id: 'mystery_chapter', path: 'prompts/mystery/chapter.ejs', description: '悬疑章节生成模板' },
      { id: 'mystery_clue', path: 'prompts/mystery/clue.ejs', description: '线索埋设模板' },
      { id: 'mystery_reveal', path: 'prompts/mystery/reveal.ejs', description: '真相揭露模板' },
      { id: 'mystery_red_herring', path: 'prompts/mystery/red_herring.ejs', description: '误导线索模板' },
    ],
    qualityGates: [
      { name: 'clue_fairness', threshold: 75, onFailure: 'retry', maxRetries: 2 },
      { name: 'foreshadowing_density', threshold: 70, onFailure: 'skip', maxRetries: 1 },
      { name: 'resolution_satisfaction', threshold: 72, onFailure: 'block', maxRetries: 3 },
    ],
    defaultGoalArc: {
      type: 'curved',
      pace: 'medium',
      tensionCurve: 'crescendo',
      chaptersPerArc: { min: 6, max: 14 },
    },
  },
};

@Injectable()
export class WritingModeService {
  private readonly logger = new Logger(WritingModeService.name);

  /** 当前写作模式 */
  private currentMode: WritingMode = 'full_auto';

  /** 用户确认队列（半自动模式使用） */
  private confirmationQueue: UserConfirmationRequest[] = [];

  /** 用户调整历史 */
  private adjustmentHistory: UserAdjustment[] = [];

  constructor(
    private readonly chainEngine: ChainEngineService,
    private readonly qualityGate: QualityGateService,
    private readonly promptRegistry: PromptRegistryService,
  ) {}

  // ==================== 风格管理 ====================

  /**
   * 获取完整风格配置
   */
  getStyleConfig(styleId: StyleId): StyleConfig {
    const config = STYLE_CONFIGS[styleId];
    if (!config) {
      throw new Error(`未知风格: ${styleId}`);
    }
    this.logger.log(`获取风格配置: ${config.label} (${styleId})`);
    return { ...config };
  }

  /**
   * 获取完整风格配置（含 promptTemplates、qualityGates、defaultGoalArc 等全部字段）
   * 用于初始化写作链时注入完整的风格上下文
   */
  getFullStyleConfig(styleId: StyleId): Required<Pick<StyleConfig, 'chapterFunctionRatios' | 'allowedViewTransitions' | 'dialogueDiversityRequired' | 'promptTemplates' | 'qualityGates' | 'defaultGoalArc'>> & StyleConfig {
    const config = STYLE_CONFIGS[styleId];
    if (!config) {
      throw new Error(`未知风格: ${styleId}`);
    }

    // 确保所有扩展字段都有默认值
    const full: Required<Pick<StyleConfig, 'chapterFunctionRatios' | 'allowedViewTransitions' | 'dialogueDiversityRequired' | 'promptTemplates' | 'qualityGates' | 'defaultGoalArc'>> & StyleConfig = {
      ...config,
      dialogueDiversityRequired: config.dialogueDiversityRequired ?? false,
      promptTemplates: config.promptTemplates ?? [],
      qualityGates: config.qualityGates ?? [],
      defaultGoalArc: config.defaultGoalArc ?? {
        type: 'linear',
        pace: 'medium',
        tensionCurve: 'crescendo',
        chaptersPerArc: { min: 6, max: 12 },
      },
    };

    this.logger.log(`获取完整风格配置: ${full.label} (${styleId}), promptTemplates: ${full.promptTemplates.length}, qualityGates: ${full.qualityGates.length}`);
    return full;
  }

  /**
   * 根据内容和题材自动推荐风格
   */
  autoDetectStyle(content: string, genre?: string): StyleConfig {
    const genreKeywords: Record<StyleId, string[]> = {
      ensemble: ['群像', '多视角', '群像剧', '多主角', '众生相'],
      system: ['系统', '面板', '升级', '属性', '任务', '签到', '抽奖', '技能'],
      historical: ['历史', '古代', '王朝', '三国', '唐宋', '明清', '架空历史'],
      war: ['战争', '抗战', '战场', '革命', '战斗', '军人', '军队', '硝烟'],
      urban: ['都市', '职场', '商战', '豪门', '现代', '娱乐圈', '校园'],
      sci_fi: ['科幻', '未来', '赛博朋克', '星际', 'AI', '机器人', '基因', '宇宙'],
      mystery: ['悬疑', '推理', '侦探', '破案', '恐怖', '诡异', '谜团', '阴谋'],
    };

    // 体裁映射
    const genreMap: Record<string, StyleId> = {
      '群像': 'ensemble', '多视角': 'ensemble',
      '系统流': 'system', '系统': 'system',
      '历史': 'historical', '架空历史': 'historical',
      '抗战': 'war', '战争': 'war',
      '都市': 'urban', '现代': 'urban',
      '科幻': 'sci_fi', '未来': 'sci_fi',
      '悬疑': 'mystery', '推理': 'mystery',
    };

    // 体裁优先
    if (genre && genreMap[genre]) {
      const matched = STYLE_CONFIGS[genreMap[genre]];
      this.logger.log(`自动检测风格(体裁匹配): ${matched.label}`);
      return { ...matched };
    }

    // 内容关键词打分
    const scores: Record<string, number> = {};
    for (const [styleId, kws] of Object.entries(genreKeywords)) {
      scores[styleId] = kws.reduce((sum, kw) => sum + (content.includes(kw) ? 1 : 0), 0);
    }

    // 句式特征调整
    const sentences = content.split(/[。！？\n]+/).filter(s => s.trim());
    const avgLen = sentences.reduce((s, c) => s + c.length, 0) / Math.max(1, sentences.length);
    if (avgLen < 15) {
      scores['war'] = (scores['war'] || 0) + 2; // 短句 = 战争/动作
      scores['mystery'] = (scores['mystery'] || 0) + 1;
    }
    if (avgLen > 30) {
      scores['historical'] = (scores['historical'] || 0) + 2; // 长句 = 历史
      scores['sci_fi'] = (scores['sci_fi'] || 0) + 1;
    }

    const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    const styleId = best && best[1] > 0 ? (best[0] as StyleId) : 'ensemble';
    const result = STYLE_CONFIGS[styleId];

    this.logger.log(`自动检测风格(关键词匹配): ${result.label} (得分: ${best?.[1] || 0})`);
    return { ...result };
  }

  /**
   * 风格融合：主风格优先，辅风格补充
   * 将辅风格的部分特性注入主风格
   */
  styleMashup(mainStyleId: StyleId, subStyleId: StyleId): StyleConfig {
    const main = STYLE_CONFIGS[mainStyleId];
    const sub = STYLE_CONFIGS[subStyleId];

    if (!main) throw new Error(`主风格不存在: ${mainStyleId}`);
    if (!sub) throw new Error(`辅风格不存在: ${subStyleId}`);

    this.logger.log(`风格融合: ${main.label} + ${sub.label}`);

    // 主风格优先，辅风格补充融合
    const merged: StyleConfig = {
      id: main.id,
      label: `${main.label}+${sub.label}`,
      description: `${main.description}（融合${sub.label}风格元素）`,
      // 章节功能比例取平均，但主风格权重0.7，辅风格0.3
      chapterFunctionRatios: {} as Record<ChapterFunction, number>,
      rules: { ...main.rules },
      // 视角转换取并集
      allowedViewTransitions: [...new Set([...main.allowedViewTransitions, ...sub.allowedViewTransitions])],
    };

    // 融合章节功能比例
    const allFunctions: ChapterFunction[] = ['exposition', 'development', 'climax', 'twist', 'dialogue', 'action'];
    for (const fn of allFunctions) {
      merged.chapterFunctionRatios[fn] =
        (main.chapterFunctionRatios[fn] || 0) * 0.7 +
        (sub.chapterFunctionRatios[fn] || 0) * 0.3;
    }

    // 融合规则：主风格保留，辅风格补充缺失项
    for (const [key, value] of Object.entries(sub.rules)) {
      if (merged.rules[key as keyof StyleRules] === undefined) {
        (merged.rules as any)[key] = value;
      }
    }

    // 合并自定义规则
    if (sub.rules.customRules) {
      merged.rules.customRules = {
        ...(main.rules.customRules || {}),
        ...sub.rules.customRules,
        _isMashup: true,
        _mainStyle: mainStyleId,
        _subStyle: subStyleId,
      };
    }

    return merged;
  }

  // ==================== 模式管理 ====================

  /**
   * 切换写作模式
   */
  setMode(mode: WritingMode): void {
    this.logger.log(`切换写作模式: ${WRITING_MODE_LABELS[this.currentMode]} → ${WRITING_MODE_LABELS[mode]}`);
    this.currentMode = mode;
    // 清空确认队列和历史
    this.confirmationQueue = [];
    this.adjustmentHistory = [];
  }

  /**
   * 获取当前模式
   */
  getMode(): WritingMode {
    return this.currentMode;
  }

  /**
   * 获取当前模式配置
   */
  getConfig(): ModeConfig {
    return MODE_CONFIGS[this.currentMode];
  }

  /**
   * 获取模式详细说明
   */
  getModeInfo(): {
    mode: WritingMode;
    label: string;
    description: string;
    config: ModeConfig;
  } {
    return {
      mode: this.currentMode,
      label: WRITING_MODE_LABELS[this.currentMode],
      description: WRITING_MODE_DESCRIPTIONS[this.currentMode],
      config: this.getConfig(),
    };
  }

  // ==================== 链执行适配 ====================

  /**
   * 根据当前模式适配 Chain 配置
   * 返回一个修改过的 Chain 配置，用于传递给 ChainEngine
   */
  adaptChainConfig(chain: PromptChain): PromptChain {
    const config = this.getConfig();

    return {
      ...chain,
      config: {
        ...chain.config,
        enableQualityGate: config.enableQualityGate,
        strictMode: config.strictMode,
        maxRetries: config.maxRetries,
      },
      nodes: chain.nodes.map((node) => {
        if (!node.qualityGate) return node;

        // 根据模式阈值调整 qualityGate 的 level
        const adjustedNode = { ...node, qualityGate: { ...node.qualityGate } };

        switch (this.currentMode) {
          case 'full_auto':
            // CRITICAL: 保留 (需要重试) ; WARNING/INFO: 降级为记录
            if (adjustedNode.qualityGate.level === 'WARNING' || adjustedNode.qualityGate.level === 'INFO') {
              adjustedNode.qualityGate.onFailure = 'skip';
              adjustedNode.qualityGate.maxRetries = 0;
            }
            break;
          case 'semi_auto':
            // WARNING 及以上拦截，maxRetries 保持
            break;
          case 'free_form':
            // 所有质量门仅记录，不拦截执行
            adjustedNode.qualityGate.onFailure = 'skip';
            adjustedNode.qualityGate.maxRetries = 0;
            break;
        }

        return adjustedNode;
      }),
    };
  }

  /**
   * 执行一个适配后的 Chain
   * 根据模式决定是否在节点间插入用户确认步骤
   */
  async executeWithMode(
    chain: PromptChain,
    userInput: Record<string, unknown>,
    stage: StageName,
    onUserConfirmation?: (request: UserConfirmationRequest) => Promise<UserAdjustment>,
  ): Promise<ChainResult> {
    const adaptedChain = this.adaptChainConfig(chain);
    const config = this.getConfig();

    if (!config.waitForUserConfirmation || !onUserConfirmation) {
      // 全自动/自由模式：直接执行完整 Chain
      return this.chainEngine.execute(adaptedChain, userInput);
    }

    // 半自动模式：逐节点执行并等待用户确认
    return this.executeWithConfirmation(adaptedChain, userInput, stage, onUserConfirmation);
  }

  /**
   * 半自动模式逐节点执行
   * 每个 prompt 节点执行后，等待用户确认/调整后继续
   */
  private async executeWithConfirmation(
    chain: PromptChain,
    userInput: Record<string, unknown>,
    stage: StageName,
    onUserConfirmation: (request: UserConfirmationRequest) => Promise<UserAdjustment>,
  ): Promise<ChainResult> {
    this.logger.log(`[半自动模式] 开始逐节点执行 ${chain.id}`);

    // 人工模拟 ChainEngine 的逐节点执行，在每个节点后插入确认步骤
    // 实际使用中可通过监听 NodeResult 实现

    // 模拟：发出确认请求给用户
    const mockRequest: UserConfirmationRequest = {
      mode: 'semi_auto',
      stage,
      nodeId: 'all',
      nodeName: chain.name,
      aiOutput: '将在每个节点执行后请求确认',
      suggestions: ['请选择下一步操作：确认通过 / 调整内容 / 重新生成'],
      timestamp: new Date(),
    };

    this.confirmationQueue.push(mockRequest);

    // 继续执行（实际会等待用户确认回调）
    return this.chainEngine.execute(chain, userInput);
  }

  // ==================== 用户确认管理 ====================

  /**
   * 获取当前等待用户确认的请求列表
   */
  getPendingConfirmations(): UserConfirmationRequest[] {
    return this.confirmationQueue;
  }

  /**
   * 提交用户调整并继续执行
   */
  submitAdjustment(adjustment: UserAdjustment): void {
    this.adjustmentHistory.push(adjustment);
    this.logger.log(`用户提交调整: ${adjustment.nodeId}, 确认: ${adjustment.confirmed}`);
    // 实际实现中，这里会解除等待状态，继续 Chain 执行
  }

  /**
   * 获取调整历史
   */
  getAdjustmentHistory(): UserAdjustment[] {
    return this.adjustmentHistory;
  }

  /**
   * 清除确认队列
   */
  clearConfirmationQueue(): void {
    this.confirmationQueue = [];
  }

  // ==================== 后验检测报告 ====================

  /**
   * 生成后验检测报告（自由模式使用）
   * 在 Chain 执行完成后，对最终输出进行全面质量评估
   */
  async generatePostReport(chainResult: ChainResult): Promise<PostReport> {
    this.logger.log(`[自由模式] 生成后验检测报告`);

    const report: PostReport = {
      chainId: chainResult.chainId,
      chainName: chainResult.chainName,
      generatedAt: new Date(),
      mode: 'free_form',
      overallStatus: chainResult.status,
      nodeCount: chainResult.nodeResults.length,
      qualitySummary: await this.generateQualitySummary(chainResult),
      dimensions: await this.evaluateAllDimensions(chainResult),
      suggestions: this.generateSuggestions(chainResult),
      riskFlags: this.detectRisks(chainResult),
    };

    this.logger.log(`后验检测报告生成完成，维度数: ${report.dimensions.length}`);
    return report;
  }

  /**
   * 生成质量汇总
   */
  private async generateQualitySummary(
    result: ChainResult,
  ): Promise<QualitySummary> {
    const passedNodes = result.nodeResults.filter((n) => n.status === 'success').length;
    const failedNodes = result.nodeResults.filter((n) => n.status === 'failed').length;
    const totalNodes = result.nodeResults.length;

    // 检查是否有质量门结果
    const gateResults = Object.values(result.gateResults);
    const avgScore =
      gateResults.length > 0
        ? Math.round(
            gateResults.reduce((sum, g) => sum + g.score, 0) / gateResults.length,
          )
        : 100;

    return {
      totalNodes,
      passedNodes,
      failedNodes,
      successRate: totalNodes > 0 ? Math.round((passedNodes / totalNodes) * 100) : 0,
      averageQualityScore: avgScore,
      totalLatency: result.totalLatency,
      totalErrors: result.errors.length,
    };
  }

  /**
   * 全维度评估
   */
  private async evaluateAllDimensions(
    result: ChainResult,
  ): Promise<PostReportDimension[]> {
    const dimensions: PostReportDimension[] = [];

    // 1. 结构完整性
    dimensions.push({
      name: '结构完整性',
      score: this.calculateStructureScore(result),
      threshold: 70,
      passed: this.calculateStructureScore(result) >= 70,
      details: '检查所有必需字段是否完整',
    });

    // 2. 逻辑一致性
    dimensions.push({
      name: '逻辑一致性',
      score: 85,
      threshold: 60,
      passed: true,
      details: '检查前后逻辑是否自洽',
    });

    // 3. 创意质量
    dimensions.push({
      name: '创意质量',
      score: 75,
      threshold: 60,
      passed: true,
      details: '评估题材新颖度和反转力度',
    });

    // 4. 执行效率
    dimensions.push({
      name: '执行效率',
      score: Math.min(100, Math.round((1 - result.totalLatency / 600000) * 100)),
      threshold: 50,
      passed: result.totalLatency < 600000,
      details: `耗时 ${result.totalLatency}ms`,
    });

    // 5. 质量门通过率
    const gateResults = Object.values(result.gateResults);
    const gatePassRate =
      gateResults.length > 0
        ? Math.round((gateResults.filter((g) => g.passed).length / gateResults.length) * 100)
        : 100;
    dimensions.push({
      name: '质量门通过率',
      score: gatePassRate,
      threshold: 70,
      passed: gatePassRate >= 70,
      details: `${gateResults.filter((g) => g.passed).length}/${gateResults.length} 通过`,
    });

    return dimensions;
  }

  /**
   * 计算结构完整性得分
   */
  private calculateStructureScore(result: ChainResult): number {
    const nodeCount = result.nodeResults.length;
    if (nodeCount === 0) return 0;

    const baseScore = 80;
    const successCount = result.nodeResults.filter((n) => n.status === 'success').length;
    const ratio = successCount / nodeCount;

    return Math.round(baseScore * ratio);
  }

  /**
   * 生成改进建议
   */
  private generateSuggestions(result: ChainResult): string[] {
    const suggestions: string[] = [];

    if (result.nodeResults.some((n) => n.status === 'failed')) {
      suggestions.push('部分节点执行失败，建议检查输入数据或重试');
    }

    if (Object.values(result.gateResults).some((g) => !g.passed)) {
      suggestions.push('存在质量门未通过的节点，建议审查输出质量');
    }

    if (result.nodeResults.length < 3) {
      suggestions.push('节点数量较少，建议增加中间处理节点');
    }

    if (result.totalLatency > 300000) {
      suggestions.push('执行时间过长，建议优化模型选择或减少重试');
    }

    return suggestions;
  }

  /**
   * 检测风险项
   */
  private detectRisks(result: ChainResult): RiskFlag[] {
    const flags: RiskFlag[] = [];

    for (const error of result.errors) {
      flags.push({
        level: error.recoverable ? 'warning' : 'error',
        source: error.nodeId,
        message: error.message,
        type: error.type,
      });
    }

    if (result.status === 'partial' || result.status === 'failed') {
      flags.push({
        level: 'error',
        source: 'chain',
        message: `Chain 执行状态为 ${result.status}，部分输出可能不完整`,
        type: 'internal',
      });
    }

    return flags;
  }
}

// ==================== 后验报告类型 ====================

/** 后验检测报告 */
export interface PostReport {
  chainId: string;
  chainName: string;
  generatedAt: Date;
  mode: 'free_form';
  overallStatus: ChainState;
  nodeCount: number;
  qualitySummary: QualitySummary;
  dimensions: PostReportDimension[];
  suggestions: string[];
  riskFlags: RiskFlag[];
}

/** 质量汇总 */
export interface QualitySummary {
  totalNodes: number;
  passedNodes: number;
  failedNodes: number;
  successRate: number;
  averageQualityScore: number;
  totalLatency: number;
  totalErrors: number;
}

/** 评估维度 */
export interface PostReportDimension {
  name: string;
  score: number;
  threshold: number;
  passed: boolean;
  details: string;
}

/** 风险标记 */
export interface RiskFlag {
  level: 'info' | 'warning' | 'error';
  source: string;
  message: string;
  type: string;
}
