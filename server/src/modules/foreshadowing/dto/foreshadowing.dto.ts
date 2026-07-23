/**
 * 伏笔 DTO
 */
import { IsString, IsOptional, IsNumber, IsArray, IsIn, Min, Max } from 'class-validator';
import type { ForeshadowingType, ForeshadowingStatus } from '@novel/shared';

export class CreateForeshadowingDto {
  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  @IsIn(['hint', 'setup', 'mystery', 'object', 'relationship'])
  type?: ForeshadowingType = 'hint';

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(3)
  importance?: number = 2;

  @IsNumber()
  buriedChapterIndex: number;

  @IsOptional()
  @IsString()
  buriedAt?: string;

  @IsOptional()
  @IsNumber()
  plannedRecoveryChapterIndex?: number;

  @IsOptional()
  @IsNumber()
  recoveryWindowStart?: number;

  @IsOptional()
  @IsNumber()
  recoveryWindowEnd?: number;

  @IsOptional()
  @IsString()
  evidenceText?: string;

  @IsOptional()
  @IsString()
  @IsIn(['low', 'medium', 'high'])
  riskLevel?: 'low' | 'medium' | 'high';

  @IsOptional()
  @IsString()
  plannedRecoveryAt?: string;

  @IsOptional()
  @IsString()
  recoveryCondition?: string;

  @IsOptional()
  @IsString()
  payoffDescription?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  relatedCharacterIds?: string[] = [];

  @IsOptional()
  @IsNumber()
  overdueThreshold?: number = 5;

  @IsOptional()
  @IsString()
  @IsIn(['global', 'volume', 'chapter'])
  scope?: string;

  @IsOptional()
  @IsNumber()
  volumeIndex?: number;
}

export class UpdateForeshadowingDto {
  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  type?: ForeshadowingType;

  @IsOptional()
  @IsNumber()
  importance?: number;

  @IsOptional()
  @IsNumber()
  plannedRecoveryChapterIndex?: number;

  @IsOptional()
  @IsNumber()
  recoveryWindowStart?: number;

  @IsOptional()
  @IsNumber()
  recoveryWindowEnd?: number;

  @IsOptional()
  @IsString()
  evidenceText?: string;

  @IsOptional()
  @IsString()
  @IsIn(['low', 'medium', 'high'])
  riskLevel?: 'low' | 'medium' | 'high';

  @IsOptional()
  @IsString()
  recoveryCondition?: string;

  @IsOptional()
  @IsString()
  payoffDescription?: string;
}

export class RecoverForeshadowingDto {
  @IsNumber()
  chapterIndex: number;

  @IsString()
  method: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  impact?: number = 5;
}
