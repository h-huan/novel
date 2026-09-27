/** 更新项目 DTO：项目卡只允许修改元数据与唯一执行标准，不再暴露旧 IdeaLab 生命周期。 */
import { IsString, IsOptional, IsNumber, IsIn, Min } from 'class-validator';
import { PLATFORM_IDS, PROJECT_TYPE_IDS } from '../../../../shared/src';
import type { ProjectType, ProjectStatus, TargetPlatform, WorkflowStage } from '@novel/shared';

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsIn([...PROJECT_TYPE_IDS])
  type?: ProjectType;

  @IsOptional()
  @IsIn(['active', 'archived', 'completed'])
  status?: ProjectStatus;

  @IsOptional()
  @IsNumber()
  @Min(1)
  targetWords?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @IsIn(['full_auto', 'semi_auto', 'free'])
  writingMode?: string;

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
