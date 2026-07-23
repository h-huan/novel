/**
 * TimelineController - 时间线管理 API
 */
import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { TimelineService, TimelineDto, TimelineEventDto, CreateTimelineDto, UpdateTimelineDto, CreateTimelineEventDto, UpdateTimelineEventDto } from './timeline.service';
import { VectorIndexService } from '../../rag/vector-index.service';
import { EmbeddingService } from '../../rag/embedding.service';
import { CanonicalSyncStateService } from '../../rag/canonical-sync-state.service';

@ApiTags('timeline')
@Controller('projects/:projectId/timelines')
export class TimelineController {
  constructor(private readonly service: TimelineService, private readonly vectorIndex: VectorIndexService, private readonly embedding: EmbeddingService, private readonly syncStates: CanonicalSyncStateService) {}

  @Get()
  @ApiOperation({ summary: '获取项目的时间线列表' })
  @ApiParam({ name: 'projectId', description: '项目ID' })
  async findAll(@Param('projectId') projectId: string): Promise<TimelineDto[]> {
    return this.service.findByProjectId(projectId);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取单个时间线' })
  @ApiParam({ name: 'projectId', description: '项目ID' })
  @ApiParam({ name: 'id', description: '时间线ID' })
  async findOne(@Param('id') id: string): Promise<TimelineDto> {
    return this.service.findById(id);
  }

  @Post()
  @ApiOperation({ summary: '创建时间线' })
  @ApiParam({ name: 'projectId', description: '项目ID' })
  async create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateTimelineDto,
  ): Promise<any> {
    const result = this.service.create(projectId, dto); const sync = await this.indexTimeline(projectId, result.id); return { ...result, sync };
  }

  @Put(':id')
  @ApiOperation({ summary: '更新时间线' })
  @ApiParam({ name: 'projectId', description: '项目ID' })
  @ApiParam({ name: 'id', description: '时间线ID' })
  async update(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTimelineDto,
  ): Promise<any> {
    const result = this.service.update(id, dto); const sync = await this.indexTimeline(projectId, id); return { ...result, sync };
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除时间线' })
  @ApiParam({ name: 'projectId', description: '项目ID' })
  @ApiParam({ name: 'id', description: '时间线ID' })
  async remove(@Param('projectId') projectId: string, @Param('id') id: string): Promise<any> {
    this.service.remove(id);
    const sync = await this.syncStates.run(projectId, 'timeline', id, () => this.vectorIndex.deleteChunksStrict(VectorIndexService.COLLECTIONS.GLOBAL_KNOWLEDGE, [`timeline:${id}`]));
    return { success: true, sync };
  }

  // ============ 时间线事件 ============

  @Get(':timelineId/events')
  @ApiOperation({ summary: '获取时间线的事件列表' })
  @ApiParam({ name: 'projectId', description: '项目ID' })
  @ApiParam({ name: 'timelineId', description: '时间线ID' })
  async findAllEvents(@Param('timelineId') timelineId: string): Promise<TimelineEventDto[]> {
    return this.service.findEventsByTimelineId(timelineId);
  }

  @Get(':timelineId/events/:eventId')
  @ApiOperation({ summary: '获取单个事件' })
  @ApiParam({ name: 'projectId', description: '项目ID' })
  @ApiParam({ name: 'timelineId', description: '时间线ID' })
  @ApiParam({ name: 'eventId', description: '事件ID' })
  async findOneEvent(@Param('eventId') eventId: string): Promise<TimelineEventDto> {
    return this.service.findEventById(eventId);
  }

  @Post(':timelineId/events')
  @ApiOperation({ summary: '创建时间线事件' })
  @ApiParam({ name: 'projectId', description: '项目ID' })
  @ApiParam({ name: 'timelineId', description: '时间线ID' })
  async createEvent(
    @Param('projectId') projectId: string,
    @Param('timelineId') timelineId: string,
    @Body() dto: CreateTimelineEventDto,
  ): Promise<any> {
    const result = this.service.createEvent(timelineId, dto); const sync = await this.indexTimeline(projectId, timelineId); return { ...result, sync };
  }

  @Put(':timelineId/events/:eventId')
  @ApiOperation({ summary: '更新时间线事件' })
  @ApiParam({ name: 'projectId', description: '项目ID' })
  @ApiParam({ name: 'timelineId', description: '时间线ID' })
  @ApiParam({ name: 'eventId', description: '事件ID' })
  async updateEvent(
    @Param('projectId') projectId: string,
    @Param('timelineId') timelineId: string,
    @Param('eventId') eventId: string,
    @Body() dto: UpdateTimelineEventDto,
  ): Promise<any> {
    const result = this.service.updateEvent(eventId, dto); const sync = await this.indexTimeline(projectId, timelineId); return { ...result, sync };
  }

  @Delete(':timelineId/events/:eventId')
  @ApiOperation({ summary: '删除时间线事件' })
  @ApiParam({ name: 'projectId', description: '项目ID' })
  @ApiParam({ name: 'timelineId', description: '时间线ID' })
  @ApiParam({ name: 'eventId', description: '事件ID' })
  async removeEvent(@Param('projectId') projectId: string, @Param('timelineId') timelineId: string, @Param('eventId') eventId: string): Promise<any> {
    this.service.removeEvent(eventId);
    const sync = await this.indexTimeline(projectId, timelineId);
    return { success: true, sync };
  }

  private async indexTimeline(projectId: string, timelineId: string) {
    return this.syncStates.run(projectId, 'timeline', timelineId, async () => {
      const timeline = this.service.findById(timelineId);
      const events = this.service.findEventsByTimelineId(timelineId);
      const text = [timeline.name, timeline.description || '', ...events.map((event) => `${event.eventDate || ''} ${event.title} ${event.description || ''}`)].join('\n');
      const [vector] = await this.embedding.embed([text]);
      await this.vectorIndex.indexChunksStrict(VectorIndexService.COLLECTIONS.GLOBAL_KNOWLEDGE, [{ chunk: { id: `timeline:${timelineId}`, text, docType: 'timeline', metadata: { chunkIndex: 0, parentDocId: timelineId } }, vector }]);
    });
  }
}
