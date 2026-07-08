/**
 * Outline DTOs
 */
import { IsString, IsOptional, IsNumber, IsArray, IsIn, Min } from 'class-validator';
import type { OutlineLevel, ChapterFunctionType, GoalArcType } from '@novel/shared';

export class CreateOutlineDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  @IsIn(['book', 'volume', 'chapter', 'scene'])
  level?: OutlineLevel = 'chapter';

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsNumber()
  order?: number = 0;

  @IsOptional()
  @IsString()
  content?: string = '';

  @IsOptional()
  @IsString()
  chapterFunction?: ChapterFunctionType = 'breathing';

  @IsOptional()
  @IsString()
  goalArc?: GoalArcType = 'crisis_resolve';

  @IsOptional()
  @IsNumber()
  @Min(0)
  targetWords?: number = 3000;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  characterIds?: string[] = [];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  foreshadowingIds?: string[] = [];

  @IsOptional()
  scenes?: Record<string, unknown> | null;

  @IsOptional()
  volumes?: Record<string, unknown> | null;

  @IsOptional()
  bookSkeleton?: Record<string, unknown> | null;

  @IsOptional()
  plotPoints?: any[] = [];
}

export class UpdateOutlineDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  chapterFunction?: ChapterFunctionType;

  @IsOptional()
  @IsString()
  goalArc?: GoalArcType;

  @IsOptional()
  @IsNumber()
  targetWords?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  characterIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  foreshadowingIds?: string[];

  @IsOptional()
  scenes?: Record<string, unknown> | null;

  @IsOptional()
  volumes?: Record<string, unknown> | null;

  @IsOptional()
  bookSkeleton?: Record<string, unknown> | null;

  @IsOptional()
  plotPoints?: any[];
}

export class MoveOutlineDto {
  @IsOptional()
  @IsString()
  newParentId?: string;

  @IsNumber()
  newOrder: number;
}

export class ReorderChildrenDto {
  @IsArray()
  @IsString({ each: true })
  orderedIds: string[];
}

export class SplitOutlineDto {
  @IsString()
  newTitle: string;

  @IsOptional()
  @IsString()
  newContent?: string;

  @IsOptional()
  @IsNumber()
  splitPoint?: number;
}

export class InsertOutlineDto {
  @IsString()
  @IsIn(['before', 'after'])
  position: 'before' | 'after';

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;
}

export class MoveOutlineOrderDto {
  @IsString()
  @IsIn(['up', 'down'])
  direction: 'up' | 'down';
}

export class ContinueOutlineDto {
  @IsOptional()
  @IsString()
  fromOutlineId?: string;

  @IsOptional()
  @IsNumber()
  count?: number;

  @IsOptional()
  planning?: Record<string, unknown>;
}

export class RecommendOutlinePlanDto {
  @IsOptional()
  @IsString()
  workScale?: string;

  @IsOptional()
  @IsString()
  targetWordsRange?: string;

  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  planning?: Record<string, unknown>;
}
