/**
 * 创建想法草稿 DTO
 */
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsIn, Min } from 'class-validator';

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
  @IsIn(['zhihu', 'fanqie', 'qimao', 'qidian', 'douyin', 'xiaohongshu', 'jinjiang', 'rules_horror', 'custom', 'generic'])
  targetPlatform?: string = 'generic';

  @IsNumber()
  @Min(1)
  targetWords: number;

  @IsOptional()
  @IsString()
  description?: string = '';
}
