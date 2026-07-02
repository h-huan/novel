/**
 * 地图地点 DTO
 */
import { IsString, IsOptional, IsIn, IsArray } from 'class-validator';
import type { MapLevel } from '@novel/shared';

export class CreateMapPointDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsString()
  @IsIn(['world', 'region', 'country', 'city', 'location', 'scene'])
  level?: MapLevel = 'location';

  @IsOptional()
  @IsString()
  coordinates?: string; // "x,y" 格式

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  linkedChapterIds?: string[] = [];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  linkedCharacterIds?: string[] = [];
}

export class UpdateMapPointDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @IsString()
  @IsIn(['world', 'region', 'country', 'city', 'location', 'scene'])
  level?: MapLevel;

  @IsOptional()
  @IsString()
  coordinates?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  linkedChapterIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  linkedCharacterIds?: string[];
}
