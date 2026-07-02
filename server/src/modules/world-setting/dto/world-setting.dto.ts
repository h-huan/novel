/**
 * 创建/更新世界观 DTO
 */
import { IsString, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ConstraintDto {
  @IsString()
  category: string;

  @IsString()
  rule: string;

  @IsString()
  description: string;

  @IsString()
  severity: string;
}

export class CreateWorldSettingDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  era?: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ConstraintDto)
  constraints?: ConstraintDto[];
}

export class UpdateWorldSettingDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  era?: string;
}

export class AddConstraintDto {
  @IsString()
  category: string;

  @IsString()
  rule: string;

  @IsString()
  description: string;

  @IsString()
  severity: string;
}
