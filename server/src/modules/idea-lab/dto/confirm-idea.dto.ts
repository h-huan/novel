/**
 * 确认想法 DTO
 */
import { IsString, IsOptional } from 'class-validator';

export class ConfirmIdeaDto {
  @IsOptional()
  @IsString()
  confirmedIdea?: string;
}
