/**
 * 章节 DTO
 *
 * 公共章节 CRUD 永远表示作者手工编辑。AI 生成结果不得通过客户端声明来源后直接落 Canon；
 * AI 内容必须由生成主链在 Gate 通过后走服务端受控提交。
 */
import { IsString, IsOptional, IsNumber } from 'class-validator';
import type { ChapterStatus, HookType, TransitionMode } from '@novel/shared';

export class CreateChapterDto {
  @IsNumber()
  volumeIndex: number;

  @IsNumber()
  chapterIndex: number;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  outlineId?: string;

  /** 仅作者手工创建时可带正文；AI 主链不得使用该入口提交生成内容。 */
  @IsOptional()
  @IsString()
  content?: string;
}

export class UpdateChapterDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  hookType?: HookType;

  @IsOptional()
  @IsString()
  transitionMode?: TransitionMode;
}

export class ChapterQueryDto {
  @IsOptional()
  @IsString()
  status?: ChapterStatus;

  @IsOptional()
  @IsNumber()
  volumeIndex?: number;
}
