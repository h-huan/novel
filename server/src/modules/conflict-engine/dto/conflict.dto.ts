/**
 * 冲突检测 DTO
 */
import { IsString, IsOptional, IsEnum, IsNumber, IsArray, Min, Max } from 'class-validator';
import { ConflictPriority, ConflictType, ConflictStatus } from '../conflict-engine.service';

export class RunDetectionDto {
  @IsString()
  projectId: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  chapterIndex?: number;

  @IsEnum(['realtime', 'deep'])
  mode: 'realtime' | 'deep';

  @IsOptional()
  @IsString()
  paragraphContent?: string;
}

export class ResolveConflictDto {
  @IsEnum(['accept', 'reject', 'ignore'])
  resolution: 'accept' | 'reject' | 'ignore';

  @IsOptional()
  @IsString()
  note?: string;
}

export class ConflictQueryDto {
  @IsOptional()
  @IsEnum(ConflictPriority)
  priority?: ConflictPriority;

  @IsOptional()
  @IsEnum(ConflictType)
  type?: ConflictType;

  @IsOptional()
  @IsEnum(ConflictStatus)
  status?: ConflictStatus;

  @IsOptional()
  @IsNumber()
  chapterIndex?: number;
}
