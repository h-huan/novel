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
  targetWords?: number;

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

  /** 章节类型：标准章/高潮章/波折章/过渡章/结局章 */
  @IsOptional()
  @IsString()
  chapterType?: string;

  /** 视角比例，如"主角100%""玩家≥50%" */
  @IsOptional()
  @IsString()
  povRatio?: string;

  /** 热血镜头/爽点场景描述 */
  @IsOptional()
  @IsString()
  hotScenes?: string;

  /** 波折镜头/挫折场景描述 */
  @IsOptional()
  @IsString()
  setbackScenes?: string;

  /** 结尾设置：钩子/悬念/下一章预告 */
  @IsOptional()
  @IsString()
  endingSetup?: string;

  /** 数据追踪JSON：人口/玩家数/贡献点/粮食等关键数据 */
  @IsOptional()
  dataTracking?: Record<string, unknown>;

  /** 爽点设置：不少于2个爽点 */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  highlightPoints?: string[];

  /** 系统提示 */
  @IsOptional()
  @IsString()
  systemHints?: string;

  /** 时间线描述 */
  @IsOptional()
  @IsString()
  timeline?: string;

  /** 地点摘要 */
  @IsOptional()
  @IsString()
  locationSummary?: string;

  /** 冲突设计 */
  @IsOptional()
  @IsString()
  conflictDesign?: string;
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

  @IsOptional()
  @IsString()
  chapterType?: string;

  @IsOptional()
  @IsString()
  povRatio?: string;

  @IsOptional()
  @IsString()
  hotScenes?: string;

  @IsOptional()
  @IsString()
  setbackScenes?: string;

  @IsOptional()
  @IsString()
  endingSetup?: string;

  @IsOptional()
  dataTracking?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  highlightPoints?: string[];

  @IsOptional()
  @IsString()
  systemHints?: string;

  @IsOptional()
  @IsString()
  timeline?: string;

  @IsOptional()
  @IsString()
  locationSummary?: string;

  /** 冲突设计 */
  @IsOptional()
  @IsString()
  conflictDesign?: string;
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

  @IsNumber()
  originalTargetWords: number;

  @IsNumber()
  newTargetWords: number;
}

export class MergeOutlineDto {
  @IsNumber()
  targetWords: number;
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

  @IsNumber()
  targetWords: number;
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

  @IsArray()
  @IsNumber({}, { each: true })
  chapterTargets: number[];
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
