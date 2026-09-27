/**
 * 创建项目 DTO
 */
import { IsString, IsOptional, IsNumber, IsIn } from 'class-validator';
import { CREATION_SOURCE_IDS, PLATFORM_IDS, PROJECT_TYPE_IDS } from '../../../../shared/src';
import type { ProjectType, ProjectStatus, CreationSource, TargetPlatform, WorkflowStage, IdeaStatus } from '@novel/shared';

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

  /** 创建来源 */
  @IsOptional()
  @IsIn([...CREATION_SOURCE_IDS])
  creationSource?: CreationSource = 'blank';

  /** 目标平台 */
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
   * 目标总字数落在该平台分类的头部实测区间之外时，执行标准允许的唯一合规路径是
   * 「确有取舍必须写在项目卡片上」——依据写在这里。此前这个字段只存在于创作宪法与前端，
   * 创建/更新 DTO 没有它，经由 HTTP 写入的取舍依据会在边界被丢掉，
   * 于是同一本书前端放行、后端 Gate 阻断，精修层又永远改不动项目卡片级判据。
   */
  @IsOptional()
  @IsString()
  categoryWordScaleDeviation?: string;

  @IsOptional()
  qualityPolicy?: import('../../writing-quality/score-policy').ScorePolicy;

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
