/**
 * 创建想法草稿 DTO
 */
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsIn, Min } from 'class-validator';
import { PLATFORM_IDS, SUPPORTED_STORY_TYPE_IDS } from '../../../../shared/src';

export class CreateIdeaDraftDto {
  @IsString()
  @IsNotEmpty()
  rawIdea: string;

  @IsOptional()
  @IsString()
  title?: string = '';

  @IsOptional()
  @IsIn([...SUPPORTED_STORY_TYPE_IDS])
  projectType?: string = 'long_novel';

  @IsOptional()
  @IsIn([...PLATFORM_IDS])
  targetPlatform?: string;

  /** 自定义平台说明：targetPlatform === 'custom' 时它就是平台维度的执行标准本身。 */
  @IsOptional()
  @IsString()
  customPlatformNote?: string;

  @IsNumber()
  @Min(1)
  targetWords: number;

  @IsOptional()
  @IsString()
  description?: string = '';
}
