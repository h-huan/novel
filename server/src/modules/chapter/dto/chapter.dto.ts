/**
 * 章节 DTO
 */
import { IsString, IsOptional, IsNumber, IsArray, Min, Max, IsIn } from 'class-validator';
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

  /** 本次保存来源：ai_generated=AI 生成正文 canonical 保存（触发自动质检）；manual=作者手动编辑（默认，不触发） */
  @IsOptional()
  @IsIn(['manual', 'ai_generated'])
  source?: 'manual' | 'ai_generated';
}

export class ChapterQueryDto {
  @IsOptional()
  @IsString()
  status?: ChapterStatus;

  @IsOptional()
  @IsNumber()
  volumeIndex?: number;
}
