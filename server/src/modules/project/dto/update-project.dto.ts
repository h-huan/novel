/**
 * 更新项目 DTO
 */
import { IsString, IsOptional, IsNumber, IsIn } from 'class-validator';
import type { ProjectType, ProjectStatus, CreationSource, TargetPlatform, WorkflowStage, IdeaStatus } from '@novel/shared';

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsIn(['short_story', 'long_novel', 'script'])
  type?: ProjectType;

  @IsOptional()
  @IsIn(['active', 'archived', 'completed'])
  status?: ProjectStatus;

  @IsOptional()
  @IsNumber()
  targetWords?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @IsIn(['full_auto', 'semi_auto', 'free'])
  writingMode?: string;

  @IsOptional()
  @IsString()
  @IsIn(['zhihu', 'fanqie', 'qidian', 'douyin', 'xiaohongshu', 'custom', 'generic', 'rules_horror', 'jinjiang'])
  platformStyle?: string;

  @IsOptional()
  settings?: string | Record<string, unknown>;

  @IsOptional()
  writingStyle?: string | Record<string, unknown>;

  // ======== 第一阶段新增字段 ========

  @IsOptional()
  @IsIn(['inspiration', 'idea', 'import', 'blank'])
  creationSource?: CreationSource;

  @IsOptional()
  @IsIn(['zhihu', 'fanqie', 'qidian', 'douyin', 'xiaohongshu', 'custom', 'generic'])
  targetPlatform?: TargetPlatform;

  @IsOptional()
  @IsString()
  currentWorkflowStage?: WorkflowStage;

  @IsOptional()
  @IsIn(['none', 'draft', 'refining', 'confirmed', 'converted'])
  ideaStatus?: IdeaStatus;

  @IsOptional()
  @IsString()
  ideaSeed?: string;

  @IsOptional()
  @IsString()
  confirmedIdea?: string;
}
