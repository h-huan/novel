/**
 * 精修系统 DTO
 */
import { IsString, IsOptional, IsNumber, IsArray, IsObject, Min, Max, IsIn } from 'class-validator';

// ─── 精修模板 ───

export class GetTemplatesQueryDto {
  @IsOptional()
  @IsString()
  category?: string;

  /**
   * 带上 projectId = 按该项目的执行标准标注「哪些模板可用、哪些与标准冲突」。
   * 不带只返回模板清单，界面不得据此直接执行（适用性未知）。
   */
  @IsOptional()
  @IsString()
  projectId?: string;
}

export class ApplyTemplateDto {
  @IsString()
  templateId: string;

  /**
   * 项目 ID — 模板批量改写必须在【项目执行标准】之下执行：
   * 平台/分类/基调/文风/流派/视角由服务端 resolveProjectStandardDirective 解析，
   * 缺 projectId 一律 400，不允许退化成与项目无关的通用改写。
   */
  @IsString()
  projectId: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsObject()
  options?: Record<string, unknown>;
}

// ─── 去AI味 ───

export class DeAIDetectDto {
  @IsString()
  content: string;
}

export class DeAIPolishDto {
  @IsString()
  content: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  intensity?: number; // 1-10, 默认5

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  focusTags?: string[]; // 聚焦特定AI特征类型
}

// ─── Describe逐句精修 ───

export class DescribePolishDto {
  @IsString()
  sentence: string;

  /**
   * 项目 ID — 逐句精修必须在【项目执行标准】之下执行：
   * 平台/分类/基调/文风/流派/视角由服务端 resolveProjectStandardDirective 解析，
   * 缺 projectId 一律 400，不允许退化成与项目无关的通用风格词表。
   */
  @IsString()
  projectId: string;

  /**
   * 「文风」维内部的定向强化方向，取值见 STYLE_INTENSITY_AXES（唯一来源）。
   * 缺省 = standard（严格按执行标准，不额外定向强化）。
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  styles?: string[];

  /** 每个方向返回几个变体（1-3），默认 3 */
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(3)
  variants?: number;

  @IsOptional()
  @IsObject()
  context?: {
    genre?: string;
    characterName?: string;
    emotion?: string;
  };
}

// ─── AI质检 ───

export class QualityInspectDto {
  @IsString()
  content: string;

  @IsOptional()
  @IsObject()
  context?: {
    characters?: { name: string; traits: string[] }[];
    foreshadowingClues?: string[];
    timeline?: string;
    setting?: string;
  };
}

// ─── 错别字/语法检查 ───

export class SpellCheckDto {
  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  @IsIn(['all', 'typo', 'grammar', 'mixed'])
  mode?: string;
}

export class BatchFixDto {
  @IsArray()
  errors: { index: number; replacement: string }[];
}

// ─── 敏感词检测 ───

export class SensitiveCheckDto {
  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  @IsIn(['strict', 'moderate', 'lenient'])
  level?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];
}

export class SensitiveReplaceDto {
  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  @IsIn(['replace', 'remove', 'warn'])
  strategy?: string;
}

// ─── 版权检测 ───

export class CopyrightCheckDto {
  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  characterNames?: string[];
}

// ─── 导出 ───

export class ExportDto {
  @IsString()
  content: string;

  @IsString()
  @IsIn(['markdown', 'txt', 'epub', 'html', 'pdf', 'docx'])
  format: string;

  @IsOptional()
  @IsObject()
  options?: {
    title?: string;
    author?: string;
    coverImage?: string;
    language?: string;
    css?: string;
  };
}

// ─── 短剧/分镜 ───

export class ScriptExportDto {
  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  @IsIn(['script', 'storyboard', 'both'])
  mode?: string;

  @IsOptional()
  @IsObject()
  options?: {
    title?: string;
    sceneCount?: number;
    generateImagePrompts?: boolean;
  };
}

// ─── 社交平台适配 ───

export class SocialAdaptDto {
  @IsString()
  text: string;

  @IsString()
  @IsIn(['douyin', 'xiaohongshu', 'wechat'])
  platform: 'douyin' | 'xiaohongshu' | 'wechat';
}

// ─── 输出类型 ───

export interface PolishResult {
  original: string;
  rewritten: string;
  /** 本次定向强化的方向（STYLE_INTENSITY_AXES 的 id / label） */
  axis: string;
  axisLabel: string;
  changes: string[];
}

export interface InspectionResult {
  overallScore: number | null;
  evaluation: { status: 'not_evaluated' | 'partial'; reason: string };
  dimensionEvidence: Record<string, { status: 'not_evaluated' | 'heuristic'; reason: string }>;
  dimensions: {
    /** 开头钩子 — 前500字的代入感+悬念张力 */
    openingHook: number | null;
    /** 热血感 — 爽点密度/对抗张力/读起来是否"燃" */
    passion: number | null;
    /** 短伏笔密度 — 2~3章回收密度 */
    shortForeshadowingDensity: number | null;
    /** 长伏笔密度 — 10章以上回收密度 */
    longForeshadowingDensity: number | null;
    /** 章节结尾吸引力 — 钩子是否让人"非要看下一章" */
    chapterEnding: number | null;
    /** 代入感 — 角色共鸣度 */
    immersion: number | null;
    /** 悬念密度 — 伏笔密度 */
    suspenseDensity: number | null;
    /** 反转力度 — 反转是否意外又合理 */
    reversalPower: number | null;
    /** 人物动机 — 行为逻辑 */
    characterMotivation: number | null;
    /** 伏笔回收 — 回收率/及时性 */
    foreshadowingRecovery: number | null;
    /** AI痕迹指数 0~100 (≤25过关, >40必降AI) */
    aiTraceIndex: number | null;
  };
  /** 每项附1~3条具体改进建议 */
  suggestions: string[];
  logicIssues: LogicIssue[];
  characterDrift: CharacterDriftIssue[];
  foreshadowingMisses: ForeshadowingMiss[];
  /** 确定性AI物理指纹检测结果（毫秒级，无需LLM） */
  aiFingerprints?: {
    overallScore: number | null;
    parallelism: { score: number; count: number; examples: string[] };
    adjectiveDensity: { score: number; density: number; overLimitSentences: number };
    paragraphUniformity: { score: number; uniformGroups: number; avgVariance: number };
    aiWordDensity: { score: number; count: number; perThousand: number };
    sentenceLengthUniformity: { score: number; variance: number; cv: number };
    dialogueRatio: { score: number; ratio: number };
    punctuationDiversity: { score: number; uniqueTypes: number; ratio: number };
    clicheExpression: { score: number; count: number; perThousand: number; examples: string[] };
  };
}

export interface LogicIssue {
  type: 'timeline' | 'causality' | 'spatial';
  description: string;
  severity: 'high' | 'medium' | 'low';
  position: number;
}

export interface CharacterDriftIssue {
  characterName: string;
  expectedTraits: string[];
  detectedBehavior: string;
  consistencyScore: number;
}

export interface ForeshadowingMiss {
  clue: string;
  status: 'unresolved' | 'partial';
  suggestion: string;
}

export interface SpellError {
  index: number;
  word: string;
  suggestion: string;
  type: 'typo' | 'grammar' | 'mixed';
  context: string;
}

export interface SensitiveWord {
  word: string;
  category: string;
  position: number;
  severity: 'high' | 'medium' | 'low';
  suggestion: string;
}

export interface CopyrightMatch {
  type: 'title' | 'content' | 'character';
  risk: 'high' | 'medium' | 'low';
  matchedItem: string;
  similarity: number;
  source: string;
  suggestion: string;
}

export interface ExportResult {
  format: string;
  content: string;
  filename: string;
  mimeType: string;
}

export interface ScriptScene {
  sceneNumber: number;
  sceneTitle: string;
  setting: string;
  timeOfDay: string;
  characters: string[];
  lines: ScriptLine[];
  imagePrompt?: string;
}

export interface ScriptLine {
  type: 'action' | 'dialogue' | 'note';
  character?: string;
  content: string;
  emotion?: string;
  duration?: string;
}

export interface StoryboardFrame {
  frameNumber: number;
  shotType: string;
  cameraAngle: string;
  visualDescription: string;
  dialogue: string;
  duration: string;
  imagePrompt: string;
}

/**
 * 模板与项目执行标准（平台/分类/基调/文风/流派/视角）的适用性门槛。
 *
 * 为什么模板需要这个：模板曾是「21 套正则规则」，其中「古风版/韵律节奏版」这类模板
 * 会把现代白描正文改成另一种文风——即绕过项目卡片上已确认的执行标准。
 * 凡是与执行标准冲突的模板，服务端直接拒绝执行（422），而不是照做后让正文不像这本书。
 */
export interface TemplateFit {
  /** 执行标准文本中必须命中其中至少一个关键词；缺省 = 不限制 */
  requireAny?: string[];
  /** 执行标准文本中命中任一关键词即拒绝执行 */
  forbidAny?: string[];
  /** 拒绝执行时给出的理由（服务端会补上命中的标准文本） */
  reason: string;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  /** 定向强化方向：取值见 STYLE_INTENSITY_AXES（唯一来源） */
  axis: string;
  /** 模板自身任务指令——必须在项目执行标准之内执行，不得改变六维设定 */
  task: string;
  /** 与执行标准冲突时的拒绝门槛；缺省 = 任何标准下都可用（仍受执行标准约束） */
  fit?: TemplateFit;
}

/** 模板执行时注入的标准上下文（由 resolveProjectStandardDirective 派生，唯一来源 projectStandardBlock） */
export interface TemplateStandardContext {
  projectId: string;
  /** 可直接放在 prompt 顶部的执行标准块 */
  standardBlock: string;
  platformLabel: string;
  category: string;
  writingStyle: string;
  storyTone: string;
  webNovelGenre: string;
  pov: string;
  styleTags: string[];
  /** 仅用于适用性判断的合并文本 */
  standardText: string;
}
