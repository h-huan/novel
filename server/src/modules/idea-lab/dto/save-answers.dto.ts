/**
 * 保存回答 DTO
 */
import { IsArray, IsString, ValidateNested } from 'class-validator';

export class AnswerItem {
  @IsString()
  questionId: string;

  @IsString()
  answer: string;
}

export class SaveAnswersDto {
  @IsArray()
  @ValidateNested({ each: true })
  answers: AnswerItem[];
}
