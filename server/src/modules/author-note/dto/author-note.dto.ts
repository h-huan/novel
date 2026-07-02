/**
 * Author's Note DTO
 */
import { IsString, IsOptional, IsEnum, IsNumber, IsBoolean, IsArray, Min, Max } from 'class-validator';

export enum AuthorNoteRuleType {
  PLOT_CONSTRAINT = 'plot_constraint',
  STYLE_REQUIREMENT = 'style_requirement',
  SETTING_OVERRIDE = 'setting_override',
  FORESHADOWING_OPERATION = 'foreshadowing_operation',
  CUSTOM = 'custom',
}

export enum AuthorNoteScope {
  CHAPTER = 'chapter',
  VOLUME = 'volume',
  PERMANENT = 'permanent',
}

export class CreateAuthorNoteDto {
  @IsString()
  title: string;

  @IsEnum(AuthorNoteRuleType)
  ruleType: AuthorNoteRuleType;

  @IsString()
  content: string;

  @IsEnum(AuthorNoteScope)
  scope: AuthorNoteScope;

  @IsOptional()
  @IsNumber()
  @Min(1)
  chapterIndex?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  volumeIndex?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAuthorNoteDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CheckConflictDto {
  @IsString()
  noteId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lockedChapterIds?: string[];
}
