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

  /** 创建来源 */
  @IsOptional()
  @IsIn(['inspiration', 'idea', 'import', 'blank'])
  creationSource?: CreationSource = 'blank';

  /** 目标平台 */
  @IsOptional()
  @IsIn(['zhihu', 'fanqie', 'qimao', 'qidian', 'douyin', 'xiaohongshu', 'jinjiang', 'rules_horror', 'custom', 'generic'])
  targetPlatform?: TargetPlatform;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  storyTone?: string[];

  @IsOptional()
  webNovelGenre?: string[];

  @IsOptional()
  @IsString()
  pov?: string;

  @IsOptional()
  targetAudience?: string | Record<string, unknown>;

  @IsOptional()
  chapterWordRange?: { min: number; max: number };

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
