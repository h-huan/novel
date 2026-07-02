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
