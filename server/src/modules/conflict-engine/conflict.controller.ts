/**
 * 冲突检测 Controller
 * API: 检测 / 报告列表 / 解决冲突 / 统计
 */
import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConflictEngineService, ConflictPriority, ConflictType, ConflictStatus } from './conflict-engine.service';
import { RunDetectionDto, ResolveConflictDto, ConflictQueryDto } from './dto/conflict.dto';

@ApiTags('conflict')
@Controller('conflicts')
export class ConflictController {
  constructor(private readonly service: ConflictEngineService) {}

  /**
   * 运行检测
   */
  @Post('detect')
  runDetection(@Body() dto: RunDetectionDto) {
    // 简化实现：实际项目中从数据库读取章节数据
    const chapter = {
      index: dto.chapterIndex || 1,
      title: `第${dto.chapterIndex || 1}章`,
      content: dto.paragraphContent || '',
      paragraphs: dto.paragraphContent ? dto.paragraphContent.split('\n') : [],
      isLocked: false,
    };

    if (dto.mode === 'realtime' && dto.paragraphContent) {
      return this.service.runRealtimeDetection(chapter, dto.paragraphContent, 0);
    }
    return this.service.runDeepDetection(chapter);
  }

  /**
   * 获取冲突报告列表
   */
  @Get()
  getConflicts(@Query() query: ConflictQueryDto) {
    return this.service.getConflicts({
      priority: query.priority,
      type: query.type,
      status: query.status,
      chapterIndex: query.chapterIndex,
    });
  }

  /**
   * 获取单条冲突
   */
  @Get(':id')
  getConflict(@Param('id') id: string) {
    const conflict = this.service.getConflict(id);
    if (!conflict) return { error: 'Conflict not found' };
    return conflict;
  }

  /**
   * 解决冲突
   */
  @Post(':id/resolve')
  resolveConflict(
    @Param('id') id: string,
    @Body() dto: ResolveConflictDto,
  ) {
    const result = this.service.resolveConflict(id, dto.resolution, dto.note);
    if (!result) return { error: 'Conflict not found' };
    return result;
  }

  /**
   * 自动解决P2级冲突
   */
  @Post('auto-resolve')
  autoResolve() {
    const count = this.service.autoResolveP2Conflicts();
    return { autoResolved: count };
  }

  /**
   * 获取冲突统计
   */
  @Get('stats')
  getStats() {
    return this.service.getStats();
  }
}
