/**
 * 灵感相关 DTO
 */
import { IsString, IsOptional, IsArray, IsInt, Min } from 'class-validator';

export class CreateInspirationDto {
  @IsString()
  title: string;

  @IsString()
  platform: string;

  @IsOptional()
  @IsString()
  hook?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  characters?: string[];

  @IsOptional()
  @IsString()
  setting?: string;

  @IsOptional()
  @IsInt()
  @Min(100)
  estimatedWords?: number;
}

export class UpdateInspirationDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsString()
  hook?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  characters?: string[];

  @IsOptional()
  @IsString()
  setting?: string;

  @IsOptional()
  @IsInt()
  @Min(100)
  estimatedWords?: number;
}

export class ConvertToProjectDto {
  @IsString()
  inspirationId: string;

  @IsOptional()
  @IsString()
  type?: 'short_story' | 'long_novel' | 'script';
}
