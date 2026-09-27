/**
 * 章节 DTO
 *
 * 公共章节 CRUD 表示作者手工编辑。AI 生成正文只能由服务端核对最终 Gate PASS 记录后写入 Canon。
 */
import { IsString, IsOptional, IsNumber, IsIn } from 'class-validator';
import type { ChapterStatus, HookType, TransitionMode } from '@novel/shared';

export class CreateChapterDto {
  @IsNumber()
  volumeIndex: number;

  @IsNumber()
  chapterIndex: number;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  outlineId?: string;

  @IsOptional()
  @IsString()
  content?: string;
}

export class UpdateChapterDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  hookType?: HookType;

  @IsOptional()
  @IsString()
  transitionMode?: TransitionMode;

  /**
   * 临时迁移信号：ai_generated 不再授权 ChapterService 直接写库，Controller 必须转入
   * GeneratedChapterCommitService 做 generation_runs + Gate PASS + current-context 验证。
   * 前端切到 /accept-generated 后删除此字段。
   */
  @IsOptional()
  @IsIn(['manual', 'ai_generated'])
  source?: 'manual' | 'ai_generated';
}

export class AcceptGeneratedChapterDto {
  @IsString()
  content: string;
}

export class ChapterQueryDto {
  @IsOptional()
  @IsString()
  status?: ChapterStatus;

  @IsOptional()
  @IsNumber()
  volumeIndex?: number;
}
