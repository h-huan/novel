/**
 * TimelineController - 时间线管理 API
 */
import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { TimelineService, TimelineDto, TimelineEventDto, CreateTimelineDto, UpdateTimelineDto, CreateTimelineEventDto, UpdateTimelineEventDto } from './timeline.service';

@ApiTags('timeline')
@Controller('projects/:projectId/timelines')
export class TimelineController {
  constructor(private readonly service: TimelineService) {}

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
  ): Promise<TimelineDto> {
    return this.service.create(projectId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新时间线' })
  @ApiParam({ name: 'projectId', description: '项目ID' })
  @ApiParam({ name: 'id', description: '时间线ID' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTimelineDto,
  ): Promise<TimelineDto> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除时间线' })
  @ApiParam({ name: 'projectId', description: '项目ID' })
  @ApiParam({ name: 'id', description: '时间线ID' })
  async remove(@Param('id') id: string): Promise<{ success: boolean }> {
    this.service.remove(id);
    return { success: true };
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
    @Param('timelineId') timelineId: string,
    @Body() dto: CreateTimelineEventDto,
  ): Promise<TimelineEventDto> {
    return this.service.createEvent(timelineId, dto);
  }

  @Put(':timelineId/events/:eventId')
  @ApiOperation({ summary: '更新时间线事件' })
  @ApiParam({ name: 'projectId', description: '项目ID' })
  @ApiParam({ name: 'timelineId', description: '时间线ID' })
  @ApiParam({ name: 'eventId', description: '事件ID' })
  async updateEvent(
    @Param('eventId') eventId: string,
    @Body() dto: UpdateTimelineEventDto,
  ): Promise<TimelineEventDto> {
    return this.service.updateEvent(eventId, dto);
  }

  @Delete(':timelineId/events/:eventId')
  @ApiOperation({ summary: '删除时间线事件' })
  @ApiParam({ name: 'projectId', description: '项目ID' })
  @ApiParam({ name: 'timelineId', description: '时间线ID' })
  @ApiParam({ name: 'eventId', description: '事件ID' })
  async removeEvent(@Param('eventId') eventId: string): Promise<{ success: boolean }> {
    this.service.removeEvent(eventId);
    return { success: true };
  }
}
