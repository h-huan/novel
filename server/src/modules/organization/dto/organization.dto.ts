/**
 * 组织/势力 DTO
 */
import { IsString, IsOptional, IsIn } from 'class-validator';
import type { OrganizationType } from '@novel/shared';

export class CreateOrganizationDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  @IsIn(['regime', 'faction', 'army', 'sect', 'camp', 'organization', 'other'])
  type?: OrganizationType = 'organization';

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn(['regime', 'faction', 'army', 'sect', 'camp', 'organization', 'other'])
  type?: OrganizationType;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  parentId?: string | null;
}
