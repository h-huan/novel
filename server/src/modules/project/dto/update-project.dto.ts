/**
 * 更新项目 DTO
 */
import { IsString, IsOptional, IsNumber, IsIn, Min } from 'class-validator';
import { CREATION_SOURCE_IDS, PLATFORM_IDS, PROJECT_TYPE_IDS } from '../../../../shared/src';
import type { ProjectType, ProjectStatus, CreationSource, TargetPlatform, WorkflowStage, IdeaStatus } from '@novel/shared';

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

  // ======== 第一阶段新增字段 ========

  @IsOptional()
  @IsIn([...CREATION_SOURCE_IDS])
  creationSource?: CreationSource;

  @IsOptional()
  @IsIn([...PLATFORM_IDS])
  targetPlatform?: TargetPlatform;

  /**
   * 自定义平台说明（targetPlatform === 'custom' 时必须提供）。
   *
   * 它就是「平台」这一维的执行值：自定义平台没有系统预置的节奏/回报/读者基准，
   * 所以标准只能来自用户这段话。为空 = 选了自定义平台却没给标准 → 未执行标准，
   * 创建入口直接阻断，绝不允许静默落回通用网文基准。
   */
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

  /**
   * 分类体量的取舍依据（执行标准「分类」维的执行值输入）。
   *
   * 与 CreateProjectDto 同一份口径、同一个字段名：目标总字数落在该平台分类头部实测区间之外时，
   * 执行标准允许的唯一合规路径就是把取舍依据写在项目卡片上。缺这个字段，作者在卡片上写的依据
   * 到不了创作宪法，后端 Gate 只看到「区间外」而看不到「已声明取舍」。
   */
  @IsOptional()
  @IsString()
  categoryWordScaleDeviation?: string;

  @IsOptional()
  qualityPolicy?: import('../../writing-quality/score-policy').ScorePolicy;

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
