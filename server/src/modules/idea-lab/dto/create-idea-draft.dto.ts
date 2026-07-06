/**
 * 创建想法草稿 DTO
 */
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsIn } from 'class-validator';

export class CreateIdeaDraftDto {
  @IsString()
  @IsNotEmpty()
  rawIdea: string;

  @IsOptional()
  @IsString()
  title?: string = '';

  @IsOptional()
  @IsIn(['short_story', 'long_novel'])
  projectType?: string = 'long_novel';

  @IsOptional()
  @IsIn(['zhihu', 'fanqie', 'qidian', 'douyin', 'xiaohongshu', 'custom', 'generic'])
  targetPlatform?: string = 'generic';

  @IsOptional()
  @IsNumber()
  targetWords?: number = 0;

  @IsOptional()
  @IsString()
  description?: string = '';
}
