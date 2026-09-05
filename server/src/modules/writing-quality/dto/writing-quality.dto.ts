/**
 * Writing Quality DTOs - Phase 6.1
 */
import { IsString, IsOptional, IsNumber, IsArray, IsIn } from 'class-validator';

export class AnalyzeChapterDto {
  @IsString()
  chapterId: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  @IsIn(['chapter', 'paragraph', 'full'])
  scope?: string;

  @IsOptional()
  @IsArray()
  focusTags?: string[];

  @IsOptional()
  @IsString()
  platform?: string;
}

export class ListReportsDto {
  @IsOptional()
  @IsString()
  chapterId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsNumber()
  limit?: number;
}

export class RefineIssueDto {
  @IsOptional()
  @IsString()
  @IsIn(['suggest_only', 'generate_patch'])
  mode?: string;

  @IsOptional()
  @IsString()
  instruction?: string;
}

export class AttentionCheckDto {
  @IsOptional()
  @IsString()
  chapterId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  intro?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  @IsIn(['short', 'long', 'auto'])
  mode?: string;

  @IsOptional()
  persist?: boolean;

  @IsOptional()
  @IsString()
  reportId?: string;
}

export class UpdateIssueStatusDto {
  @IsString()
  @IsIn(['open', 'planned', 'refined', 'applied', 'recheck_passed', 'recheck_failed', 'ignored', 'archived', 'resolved'])
  status: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class LLMQualityOutput {
  summary: string;
  overallLevel: 'low' | 'medium' | 'high' | 'critical';
  overallScore: number;
  issues: LLMQualityIssue[];
  // 与作品标签的契合度评分（0-100），用于看板“平台/基调/风格/流派契合”
  tagFit?: {
    platform?: number; // 与目标平台（番茄/知乎/七猫…）读者口味的契合
    tone?: number;     // 与设定基调（storyTone，如悬疑/逆袭）的契合
    style?: number;    // 与写作风格（writingStyle，如第一人称/爽文）的契合
    genre?: number;    // 与流派（webNovelGenre，如马甲流）的契合
    note?: string;
  };
}

export interface LLMQualityIssue {
  issueType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  summary: string;
  evidence: string;
  suggestion: string;
  paragraphIndex: number;
  sentenceIndex: number;
  startOffset: number;
  endOffset: number;
  originalText: string;
  suggestedText: string;
  tags: string[];
}

export interface LLMRefineOutput {
  beforeText: string;
  afterText: string;
  reason: string;
  diff: Array<{
    type: 'keep' | 'delete' | 'insert' | 'replace';
    before: string;
    after: string;
  }>;
  remainingRisk: 'none' | 'low' | 'medium' | 'high';
}

export interface RecheckResult {
  pass: boolean;
  level: 'pass' | 'warning' | 'fail';
  remainingIssues: number;
  newIssues: number;
  summary: string;
}
