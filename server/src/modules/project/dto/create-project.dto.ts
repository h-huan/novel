/**
 * 创建项目 DTO
 */
import { IsString, IsOptional, IsNumber, IsBoolean, Min, Max, IsIn } from 'class-validator';
import type { ProjectType, ProjectStatus } from '@novel/shared';

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
  @Min(0)
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
  @IsIn(['zhihu', 'fanqie', 'qidian', 'douyin', 'rules_horror', 'jinjiang', 'generic'])
  platformStyle?: string = 'generic';

  @IsOptional()
  settings?: string | Record<string, unknown>;

  @IsOptional()
  writingStyle?: string | Record<string, unknown>;
}
