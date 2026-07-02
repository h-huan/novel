/**
 * 更新项目 DTO
 */
import { IsString, IsOptional, IsNumber, IsBoolean, IsIn, Min } from 'class-validator';
import type { ProjectType, ProjectStatus } from '@novel/shared';

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
  @Min(0)
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
  @IsIn(['zhihu', 'fanqie', 'qidian', 'douyin', 'rules_horror', 'jinjiang', 'generic'])
  platformStyle?: string;

  @IsOptional()
  settings?: string | Record<string, unknown>;

  @IsOptional()
  writingStyle?: string | Record<string, unknown>;
}
