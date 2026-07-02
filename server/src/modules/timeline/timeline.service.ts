/**
 * TimelineService - 时间线管理
 */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TimelineRepository, TimelineRow, TimelineEventRow } from '../../database/repositories/timeline.repository';

export interface TimelineDto {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TimelineEventDto {
  id: string;
  timelineId: string;
  title: string;
  description?: string;
  eventDate?: string;
  eventType: string;
  importance: number;
  relatedCharacterIds: string[];
  relatedChapterIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTimelineDto {
  name: string;
  description?: string;
  startDate?: string;
  endDate?: string;
}

export interface UpdateTimelineDto {
  name?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
}

export interface CreateTimelineEventDto {
  title: string;
  description?: string;
  eventDate?: string;
  eventType?: string;
  importance?: number;
  relatedCharacterIds?: string[];
  relatedChapterIds?: string[];
}

export interface UpdateTimelineEventDto {
  title?: string;
  description?: string;
  eventDate?: string;
  eventType?: string;
  importance?: number;
  relatedCharacterIds?: string[];
  relatedChapterIds?: string[];
}

@Injectable()
export class TimelineService {
  private readonly logger = new Logger(TimelineService.name);

  constructor(private readonly repo: TimelineRepository) {}

  /** 转换为 DTO */
  private toDto(row: TimelineRow): TimelineDto {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      description: row.description || undefined,
      startDate: row.start_date || undefined,
      endDate: row.end_date || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /** 转换事件为 DTO */
  private eventToDto(row: TimelineEventRow): TimelineEventDto {
    return {
      id: row.id,
      timelineId: row.timeline_id,
      title: row.title,
      description: row.description || undefined,
      eventDate: row.event_date || undefined,
      eventType: row.event_type,
      importance: row.importance,
      relatedCharacterIds: row.related_character_ids ? JSON.parse(row.related_character_ids) : [],
      relatedChapterIds: row.related_chapter_ids ? JSON.parse(row.related_chapter_ids) : [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /** 获取项目的时间线 */
  findByProjectId(projectId: string): TimelineDto[] {
    const rows = this.repo.findByProjectId(projectId);
    return rows.map((r) => this.toDto(r));
  }

  /** 获取单个时间线 */
  findById(id: string): TimelineDto {
    const row = this.repo.findById(id);
    if (!row) throw new NotFoundException(`时间线不存在: ${id}`);
    return this.toDto(row);
  }

  /** 创建时间线 */
  create(projectId: string, dto: CreateTimelineDto): TimelineDto {
    const { v4: uuid } = require('uuid');
    const id = uuid();

    this.repo.createTimeline({
      id,
      project_id: projectId,
      name: dto.name,
      description: dto.description,
      start_date: dto.startDate,
      end_date: dto.endDate,
    });

    this.logger.log(`创建时间线: ${id} (project=${projectId})`);
    return this.findById(id);
  }

  /** 更新时间线 */
  update(id: string, dto: UpdateTimelineDto): TimelineDto {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`时间线不存在: ${id}`);

    this.repo.update(id, {
      name: dto.name,
      description: dto.description,
      start_date: dto.startDate,
      end_date: dto.endDate,
    });

    this.logger.log(`更新时间线: ${id}`);
    return this.findById(id);
  }

  /** 删除时间线 */
  remove(id: string): void {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`时间线不存在: ${id}`);

    this.repo.delete(id);
    this.logger.log(`删除时间线: ${id}`);
  }

  // ============ 时间线事件 ============

  /** 获取时间线的事件 */
  findEventsByTimelineId(timelineId: string): TimelineEventDto[] {
    const rows = this.repo.findEventsByTimelineId(timelineId);
    return rows.map((r) => this.eventToDto(r));
  }

  /** 获取单个事件 */
  findEventById(id: string): TimelineEventDto {
    const row = this.repo.findEventById(id);
    if (!row) throw new NotFoundException(`时间线事件不存在: ${id}`);
    return this.eventToDto(row);
  }

  /** 创建事件 */
  createEvent(timelineId: string, dto: CreateTimelineEventDto): TimelineEventDto {
    // 验证时间线存在
    const timeline = this.repo.findById(timelineId);
    if (!timeline) throw new NotFoundException(`时间线不存在: ${timelineId}`);

    const { v4: uuid } = require('uuid');
    const id = uuid();

    this.repo.createEvent({
      id,
      timeline_id: timelineId,
      title: dto.title,
      description: dto.description,
      event_date: dto.eventDate,
      event_type: dto.eventType,
      importance: dto.importance,
      related_character_ids: dto.relatedCharacterIds,
      related_chapter_ids: dto.relatedChapterIds,
    });

    this.logger.log(`创建时间线事件: ${id} (timeline=${timelineId})`);
    return this.findEventById(id);
  }

  /** 更新事件 */
  updateEvent(id: string, dto: UpdateTimelineEventDto): TimelineEventDto {
    const existing = this.repo.findEventById(id);
    if (!existing) throw new NotFoundException(`时间线事件不存在: ${id}`);

    this.repo.updateEvent(id, {
      title: dto.title,
      description: dto.description,
      event_date: dto.eventDate,
      event_type: dto.eventType,
      importance: dto.importance,
      related_character_ids: dto.relatedCharacterIds,
      related_chapter_ids: dto.relatedChapterIds,
    });

    this.logger.log(`更新时间线事件: ${id}`);
    return this.findEventById(id);
  }

  /** 删除事件 */
  removeEvent(id: string): void {
    const existing = this.repo.findEventById(id);
    if (!existing) throw new NotFoundException(`时间线事件不存在: ${id}`);

    this.repo.deleteEvent(id);
    this.logger.log(`删除时间线事件: ${id}`);
  }
}
