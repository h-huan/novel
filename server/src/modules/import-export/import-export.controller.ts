/**
 * 导入导出 Controller
 */
import { Controller, Post, Body, Get, Query, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ImportEngineService } from './import-engine.service';
import { ExportEngineService } from './export-engine.service';
import { OptimizationMarkService } from './optimization-mark.service';
import { ImportDto, ExportDto, ExportPreviewDto, ExportFormat } from './dto/import-export.dto';

@ApiTags('import-export')
@Controller('import-export')
export class ImportExportController {
  constructor(
    private readonly importEngine: ImportEngineService,
    private readonly exportEngine: ExportEngineService,
    private readonly optimizationMark: OptimizationMarkService,
  ) {}

  /**
   * 导入文件
   */
  @Post('import')
  async import(@Body() dto: ImportDto) {
    return this.importEngine.importFromFile(dto.filePath);
  }

  /**
   * 从文本内容导入
   */
  @Post('import/text')
  async importFromText(@Body() body: { content: string; format?: string }) {
    return this.importEngine.importFromText(body.content, body.format || 'txt');
  }

  /**
   * 导出
   */
  @Post('export')
  async export(@Body() dto: ExportDto) {
    // 这里需要从外部传入章节数据，简化实现中由调用方提供
    return { message: 'Export endpoint - chapters required from client' };
  }

  /**
   * 导出预览
   */
  @Post('export/preview')
  async preview(@Body() dto: ExportPreviewDto) {
    return { message: 'Preview endpoint - chapters required from client' };
  }

  /**
   * 分析导入内容的优化标记
   */
  @Post('optimization-mark/:projectId')
  async analyzeOptimizationMarks(
    @Param('projectId') projectId: string,
    @Body() body: { chapters: any[]; characters?: any[]; worldElements?: any[] },
  ) {
    // 转换格式后调用 optimization mark 服务
    return this.optimizationMark.analyze({
      projectInfo: {
        title: '',
        description: '',
        wordCount: 0,
        chapterCount: body.chapters.length,
        sourceFile: '',
        importFormat: '',
        importedAt: new Date().toISOString(),
      },
      chapters: body.chapters.map((ch: any, i: number) => ({
        index: i + 1,
        title: ch.title || `第${i + 1}章`,
        content: ch.content || '',
        wordCount: 0,
      })),
      characters: (body.characters || []).map((c: any) => ({
        name: c.name || '',
        aliases: c.aliases || [],
        mentionCount: c.mentionCount || 0,
        firstAppearChapter: c.firstAppearChapter || 1,
        confidence: c.confidence || 'low' as any,
      })),
      worldElements: (body.worldElements || []).map((w: any) => ({
        type: w.type || 'concept',
        name: w.name || '',
        description: w.description || '',
        chapterMentions: w.chapterMentions || [],
        confidence: w.confidence || 'low' as any,
      })),
    });
  }

  /**
   * 获取支持的格式列表
   */
  @Get('formats')
  getFormats() {
    return {
      import: ['txt', 'md', 'docx', 'novel'],
      export: ['markdown', 'txt', 'epub', 'html'],
    };
  }
}
