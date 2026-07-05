/**
 * 转换为项目 DTO
 */
import { IsString, IsOptional } from 'class-validator';

export class ConvertToProjectDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  confirmedIdea?: string;
}
