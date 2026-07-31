/**
 * 知识点（写作经验 / 避坑经验）Controller
 *
 * 真实数据来源：generation_lessons 表（由章节生成后的跨章节学习回路自动归纳写入，
 * 也允许作者在本 tab 手动逐条增删改查）。该表同时被 chain.controller 的
 * getActiveLessons 注入到后续章节生成提示中，因此作者手动维护的知识点会直接影响后续生成。
 *
 * 本 Controller 提供逐条（非批量）的 CRUD：
 *   GET    /generation-lessons?projectId=     列出本项目全部知识点
 *   POST   /generation-lessons                作者手动新增一条
 *   PUT    /generation-lessons/:id            作者手动修改一条（类别/内容）
 *   DELETE /generation-lessons/:id?projectId= 作者手动删除一条
 */
import { Controller, Get, Post, Put, Delete, Body, Param, Query, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DatabaseService } from '../../database/database.service';

/** 允许的知识点类别（避坑经验 + 写作经验）。 */
export const LESSON_CATEGORIES = [
  'missing_scene',
  'early_termination',
  'character_conflict',
  'viewpoint_drift',
  'hook_missing',
  'writing_tip',
  'other',
] as const;

export interface GenerationLessonRow {
  id: string;
  project_id: string;
  category: string;
  lesson: string;
  occurrence: number;
  last_chapter_index: number | null;
  created_at: string;
  updated_at: string;
}

@ApiTags('generation-lessons')
@Controller('generation-lessons')
export class GenerationLessonsController {
  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  /** 列出本项目全部知识点（按出现频次降序，便于作者先看高频避坑项）。 */
  @Get()
  list(@Query('projectId') projectId?: string) {
    if (!projectId) return { error: 'projectId required', lessons: [] };
    const db = this.databaseService.getDb();
    const rows = db
      .prepare(
        `SELECT id, project_id, category, lesson, occurrence, last_chapter_index, created_at, updated_at
         FROM generation_lessons WHERE project_id = ? ORDER BY occurrence DESC, updated_at DESC`,
      )
      .all(projectId) as unknown as GenerationLessonRow[];
    return { lessons: rows };
  }

  /**
   * 作者手动新增一条知识点。
   * 若与本项目已有条目措辞完全相同，则合并（occurrence+1，不新建重复行）并返回 merged=true，
   * 与自动归纳的三道闸去重逻辑保持一致。
   */
  @Post()
  create(@Body() dto: { projectId?: string; category?: string; lesson?: string }) {
    if (!dto.projectId) return { error: 'projectId required' };
    const lesson = String(dto.lesson || '').trim();
    if (!lesson) return { error: 'lesson required' };
    const category = (LESSON_CATEGORIES as readonly string[]).includes(String(dto.category))
      ? String(dto.category)
      : 'other';
    const db = this.databaseService.getDb();
    const now = new Date().toISOString();
    const id = this.genId();
    db.prepare(
      `INSERT INTO generation_lessons (id, project_id, category, lesson, occurrence, last_chapter_index, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, NULL, ?, ?)
       ON CONFLICT(project_id, lesson) DO UPDATE SET
         occurrence = occurrence + 1,
         updated_at = excluded.updated_at`,
    ).run(id, dto.projectId, category, lesson, now, now);
    // 无论新增还是合并，按 (project_id, lesson) 取回真实行；id 不一致即代表被合并到既有条目
    const row = db
      .prepare('SELECT * FROM generation_lessons WHERE project_id = ? AND lesson = ?')
      .get(dto.projectId, lesson) as unknown as GenerationLessonRow;
    return { lesson: row, merged: row.id !== id };
  }

  /** 作者手动修改一条知识点的类别或内容。 */
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: { projectId?: string; category?: string; lesson?: string },
  ) {
    const db = this.databaseService.getDb();
    const existing = db
      .prepare('SELECT * FROM generation_lessons WHERE id = ? AND project_id = ?')
      .get(id, dto.projectId || '') as unknown as GenerationLessonRow | undefined;
    if (!existing) return { error: 'lesson not found' };
    const lesson = dto.lesson !== undefined ? String(dto.lesson).trim() : existing.lesson;
    if (!lesson) return { error: 'lesson required' };
    const category =
      dto.category !== undefined && (LESSON_CATEGORIES as readonly string[]).includes(String(dto.category))
        ? String(dto.category)
        : existing.category;
    db.prepare(
      'UPDATE generation_lessons SET category = ?, lesson = ?, updated_at = ? WHERE id = ? AND project_id = ?',
    ).run(category, lesson, new Date().toISOString(), id, dto.projectId || '');
    const row = db.prepare('SELECT * FROM generation_lessons WHERE id = ?').get(id) as unknown as GenerationLessonRow;
    return { lesson: row };
  }

  /** 作者手动删除一条知识点。 */
  @Delete(':id')
  remove(@Param('id') id: string, @Query('projectId') projectId?: string) {
    const db = this.databaseService.getDb();
    const existing = db
      .prepare('SELECT * FROM generation_lessons WHERE id = ? AND project_id = ?')
      .get(id, projectId || '') as GenerationLessonRow | undefined;
    if (!existing) return { error: 'lesson not found' };
    db.prepare('DELETE FROM generation_lessons WHERE id = ? AND project_id = ?').run(id, projectId || '');
    return { deleted: 1, id };
  }

  private genId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
