/**
 * 角色 DTO
 */
import { IsString, IsOptional, IsNumber, IsBoolean, IsArray, IsIn, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { RelationshipType } from '@novel/shared';

export class PersonalityDto {
  @IsNumber() extraversion?: number = 50;
  @IsNumber() agreeableness?: number = 50;
  @IsNumber() conscientiousness?: number = 50;
  @IsNumber() neuroticism?: number = 50;
  @IsNumber() openness?: number = 50;
}

export class CreateCharacterDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  aliases?: string[];

  @IsOptional()
  @IsNumber()
  age?: number;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  identity?: string;

  @IsOptional()
  @IsString()
  appearance?: string;

  @IsOptional()
  @IsString()
  background?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PersonalityDto)
  personality?: PersonalityDto;

  @IsOptional()
  @IsString()
  dialogueStyle?: string;

  @IsOptional()
  @IsString({ each: true })
  dialoguePatterns?: string[];

  @IsOptional()
  @IsBoolean()
  isPovCharacter?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['protagonist', 'major', 'supporting', 'minor'])
  role?: string;

  /** 阵营/立场，如"主角阵营""北狄诸部""玩家内部·拼命型" */
  @IsOptional()
  @IsString()
  faction?: string;

  /** 目标/动机，外部想要什么+内部真正需要什么 */
  @IsOptional()
  @IsString()
  goals?: string;

  /** 弱点/恐惧 */
  @IsOptional()
  @IsString()
  weaknesses?: string;

  /** 伤口/创伤，过去的创伤事件塑造当前人格 */
  @IsOptional()
  @IsString()
  wound?: string;

  /** 关键台词/场景标记，逗号分隔 */
  @IsOptional()
  @IsString()
  keywords?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  growthStages?: string;

  @IsOptional()
  @IsString()
  coreConflictRole?: string;

  /** 统一详细档案 JSON，合并原 character_extended_profiles 的全部字段 */
  @IsOptional()
  profile?: Record<string, unknown>;
}

export class AddRelationshipDto {
  @IsString()
  targetCharacterId: string;

  @IsString()
  targetName: string;

  @IsString()
  @IsIn(['family','friend','lover','enemy','rival','master_student','colleague','subordinate','superior','neutral','other'])
  type: RelationshipType;

  @IsString()
  description: string;

  @IsNumber()
  intensity?: number = 5;
}
