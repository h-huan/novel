/**
 * 时间线 Repository
 */
import { Injectable } from '@nestjs/common';
import { type SQLInputValue } from 'node:sqlite';
import { DatabaseService } from '../database.service';
import { BaseRepository } from './base.repository';

export interface TimelineRow {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimelineEventRow {
  id: string;
  timeline_id: string;
  title: string;
  description: string | null;
  event_date: string | null;
  event_type: string;
  importance: number;
  related_character_ids: string | null;
  related_chapter_ids: string | null;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class TimelineRepository extends BaseRepository<TimelineRow> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'timelines');
  }

  /** 查找项目的时间线 */
  findByProjectId(projectId: string): TimelineRow[] {
    const stmt = this.db.prepare(`SELECT * FROM timelines WHERE project_id = ? ORDER BY created_at ASC`);
    return stmt.all(projectId) as unknown as TimelineRow[];
  }

  /** 创建时间线 */
  createTimeline(data: {
    id: string;
    project_id: string;
    name: string;
    description?: string;
    start_date?: string;
    end_date?: string;
  }): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO timelines (id, project_id, name, description, start_date, end_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.id,
      data.project_id,
      data.name,
      data.description || null,
      data.start_date || null,
      data.end_date || null,
      now,
      now
    );
  }

  /** 更新时间线 */
  updateTimeline(id: string, data: Partial<{ name: string; description: string; start_date: string; end_date: string }>): void {
    const sets: string[] = [];
    const params: SQLInputValue[] = [];

    if (data.name !== undefined) { sets.push('name = ?'); params.push(data.name); }
    if (data.description !== undefined) { sets.push('description = ?'); params.push(data.description); }
    if (data.start_date !== undefined) { sets.push('start_date = ?'); params.push(data.start_date); }
    if (data.end_date !== undefined) { sets.push('end_date = ?'); params.push(data.end_date); }

    sets.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);

    this.db.prepare(`UPDATE timelines SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  }

  // ============ 时间线事件 ============

  /** 创建事件 */
  createEvent(data: {
    id: string;
    timeline_id: string;
    title: string;
    description?: string;
    event_date?: string;
    event_type?: string;
    importance?: number;
    related_character_ids?: string[];
    related_chapter_ids?: string[];
  }): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO timeline_events (id, timeline_id, title, description, event_date, event_type, importance, related_character_ids, related_chapter_ids, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.id,
      data.timeline_id,
      data.title,
      data.description || null,
      data.event_date || null,
      data.event_type || 'story',
      data.importance || 1,
      data.related_character_ids ? JSON.stringify(data.related_character_ids) : null,
      data.related_chapter_ids ? JSON.stringify(data.related_chapter_ids) : null,
      now,
      now
    );
  }

  /** 查找时间线的事件 */
  findEventsByTimelineId(timelineId: string): TimelineEventRow[] {
    const stmt = this.db.prepare(`SELECT * FROM timeline_events WHERE timeline_id = ? ORDER BY event_date ASC, created_at ASC`);
    return stmt.all(timelineId) as unknown as TimelineEventRow[];
  }

  /** 查找单个事件 */
  findEventById(id: string): TimelineEventRow | undefined {
    const stmt = this.db.prepare(`SELECT * FROM timeline_events WHERE id = ?`);
    return stmt.get(id) as unknown as TimelineEventRow | undefined;
  }

  /** 更新事件 */
  updateEvent(id: string, data: Partial<{
    title: string;
    description: string;
    event_date: string;
    event_type: string;
    importance: number;
    related_character_ids: string[];
    related_chapter_ids: string[];
  }>): void {
    const sets: string[] = [];
    const params: SQLInputValue[] = [];

    if (data.title !== undefined) { sets.push('title = ?'); params.push(data.title); }
    if (data.description !== undefined) { sets.push('description = ?'); params.push(data.description); }
    if (data.event_date !== undefined) { sets.push('event_date = ?'); params.push(data.event_date); }
    if (data.event_type !== undefined) { sets.push('event_type = ?'); params.push(data.event_type); }
    if (data.importance !== undefined) { sets.push('importance = ?'); params.push(data.importance); }
    if (data.related_character_ids !== undefined) { sets.push('related_character_ids = ?'); params.push(JSON.stringify(data.related_character_ids)); }
    if (data.related_chapter_ids !== undefined) { sets.push('related_chapter_ids = ?'); params.push(JSON.stringify(data.related_chapter_ids)); }

    sets.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);

    this.db.prepare(`UPDATE timeline_events SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  }

  /** 删除事件 */
  deleteEvent(id: string): void {
    this.db.prepare(`DELETE FROM timeline_events WHERE id = ?`).run(id);
  }

  /** 删除时间线的所有事件 */
  deleteEventsByTimelineId(timelineId: string): void {
    this.db.prepare(`DELETE FROM timeline_events WHERE timeline_id = ?`).run(timelineId);
  }
}
