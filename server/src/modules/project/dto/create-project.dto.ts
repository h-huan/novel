/** 创建项目 DTO：只接受项目元数据与唯一执行标准。题材确认只允许由 /discover 主链写入 Creative Constitution。 */
import { IsString, IsOptional, IsNumber, IsIn } from 'class-validator';
import { PLATFORM_IDS, PROJECT_TYPE_IDS } from '../../../../shared/src';
import type { ProjectType, ProjectStatus, TargetPlatform, WorkflowStage } from '@novel/shared';

export class CreateProjectDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsIn([...PROJECT_TYPE_IDS])
  type?: ProjectType;

  @IsOptional()
  @IsIn(['active', 'archived', 'completed'])
  status?: ProjectStatus = 'active';

  @IsOptional()
  @IsNumber()
  targetWords?: number = 0;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @IsIn(['full_auto', 'semi_auto', 'free'])
  writingMode?: string = 'full_auto';

  @IsOptional()
  settings?: string | Record<string, unknown>;

  @IsOptional()
  writingStyle?: string | Record<string, unknown>;

  @IsOptional()
  @IsIn([...PLATFORM_IDS])
  targetPlatform?: TargetPlatform;

  @IsOptional()
  @IsString()
  customPlatformNote?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  storyTone?: string[];

  @IsOptional()
  webNovelGenre?: string[];

  @IsOptional()
  submissionTags?: string[];

  @IsOptional()
  plotTags?: string[];

  @IsOptional()
  @IsString()
  genreFitNote?: string;

  @IsOptional()
  @IsString()
  pov?: string;

  @IsOptional()
  targetAudience?: string | Record<string, unknown>;

  @IsOptional()
  chapterWordRange?: { min: number; max: number };

  @IsOptional()
  @IsString()
  categoryWordScaleDeviation?: string;

  @IsOptional()
  qualityPolicy?: import('../../writing-quality/score-policy').ScorePolicy;

  @IsOptional()
  @IsString()
  currentWorkflowStage?: WorkflowStage;
}
