/**
 * 章节 DTO
 */
import { IsString, IsOptional, IsNumber, IsArray, Min, Max } from 'class-validator';
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
}

export class ChapterQueryDto {
  @IsOptional()
  @IsString()
  status?: ChapterStatus;

  @IsOptional()
  @IsNumber()
  volumeIndex?: number;
}
