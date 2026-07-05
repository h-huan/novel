/**
 * 创建项目 DTO
 */
import { IsString, IsOptional, IsNumber, IsIn } from 'class-validator';
import type { ProjectType, ProjectStatus, CreationSource, TargetPlatform, WorkflowStage, IdeaStatus } from '@novel/shared';

export class CreateProjectDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsIn(['short_story', 'long_novel', 'script'])
  type?: ProjectType = 'long_novel';

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
  writingMode?: string = 'semi_auto';

  @IsOptional()
  @IsString()
  @IsIn(['zhihu', 'fanqie', 'qidian', 'douyin', 'xiaohongshu', 'custom', 'generic', 'rules_horror', 'jinjiang'])
  platformStyle?: string = 'generic';

  @IsOptional()
  settings?: string | Record<string, unknown>;

  @IsOptional()
  writingStyle?: string | Record<string, unknown>;

  // ======== 第一阶段新增字段 ========

  /** 作品类型（与 type 兼容，不重复；以 type 为准） */
  @IsOptional()
  @IsIn(['short_story', 'long_novel', 'script'])
  projectMode?: ProjectType;

  /** 创建来源 */
  @IsOptional()
  @IsIn(['inspiration', 'idea', 'import', 'blank'])
  creationSource?: CreationSource = 'blank';

  /** 目标平台 */
  @IsOptional()
  @IsIn(['zhihu', 'fanqie', 'qidian', 'douyin', 'xiaohongshu', 'custom', 'generic'])
  targetPlatform?: TargetPlatform = 'generic';

  /** 当前创作阶段 */
  @IsOptional()
  @IsString()
  currentWorkflowStage?: WorkflowStage;

  /** 想法孵化状态 */
  @IsOptional()
  @IsIn(['none', 'draft', 'refining', 'confirmed', 'converted'])
  ideaStatus?: IdeaStatus = 'none';

  /** 用户原始想法 */
  @IsOptional()
  @IsString()
  ideaSeed?: string;

  /** 确认后的成熟想法 */
  @IsOptional()
  @IsString()
  confirmedIdea?: string;
}
