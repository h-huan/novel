/**
 * 精修系统 DTO
 */
import { IsString, IsOptional, IsNumber, IsArray, IsObject, Min, Max, IsIn } from 'class-validator';

// ─── 精修模板 ───

export class GetTemplatesQueryDto {
  @IsOptional()
  @IsString()
  category?: string;
}

export class ApplyTemplateDto {
  @IsString()
  templateId: string;

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

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  styles?: ('poetic' | 'direct' | 'metaphorical' | 'sensory' | 'emotional')[];

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
  changes: string[];
  rating: number;
}

export interface InspectionResult {
  overallScore: number;
  dimensions: {
    /** 开头钩子 — 前500字的代入感+悬念张力 */
    openingHook: number;
    /** 热血感 — 爽点密度/对抗张力/读起来是否"燃" */
    passion: number;
    /** 短伏笔密度 — 2~3章回收密度 */
    shortForeshadowingDensity: number;
    /** 长伏笔密度 — 10章以上回收密度 */
    longForeshadowingDensity: number;
    /** 章节结尾吸引力 — 钩子是否让人"非要看下一章" */
    chapterEnding: number;
    /** 代入感 — 角色共鸣度 */
    immersion: number;
    /** 悬念密度 — 伏笔密度 */
    suspenseDensity: number;
    /** 反转力度 — 反转是否意外又合理 */
    reversalPower: number;
    /** 人物动机 — 行为逻辑 */
    characterMotivation: number;
    /** 伏笔回收 — 回收率/及时性 */
    foreshadowingRecovery: number;
    /** AI痕迹指数 0~100 (≤25过关, >40必降AI) */
    aiTraceIndex: number;
  };
  /** 每项附1~3条具体改进建议 */
  suggestions: string[];
  logicIssues: LogicIssue[];
  characterDrift: CharacterDriftIssue[];
  foreshadowingMisses: ForeshadowingMiss[];
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

export interface TemplateRule {
  type: 'replace' | 'add' | 'remove' | 'rewrite';
  pattern?: string;
  replacement?: string;
  description?: string;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  rules: TemplateRule[];
  sample?: {
    before: string;
    after: string;
  };
}
