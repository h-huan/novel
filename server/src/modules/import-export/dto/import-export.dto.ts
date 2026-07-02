/**
 * 导入导出模块 DTO
 */
import { IsString, IsOptional, IsEnum, IsArray } from 'class-validator';

export enum ExportFormat {
  MARKDOWN = 'markdown',
  TXT = 'txt',
  EPUB = 'epub',
  HTML = 'html',
  DOCX = 'docx',
  NOVEL = 'novel',
}

export class ImportDto {
  @IsString()
  filePath!: string;
}

export class ImportFromTextDto {
  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  format?: string;
}

export class ExportDto {
  @IsString()
  projectId!: string;

  @IsString()
  title!: string;

  @IsEnum(ExportFormat)
  format!: ExportFormat;
}

export class ExportPreviewDto {
  @IsString()
  title!: string;

  @IsArray()
  chapters!: Array<{
    index: number;
    title: string;
    content: string;
    wordCount: number;
  }>;

  @IsEnum(ExportFormat)
  format!: ExportFormat;
}
