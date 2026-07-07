/**
 * 大纲 Service
 */
import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { OutlineRepository } from '../../database/repositories/outline.repository';
import { DatabaseService } from '../../database/database.service';
import type { OutlineRow } from '../../database/repositories/outline.repository';
import type { CreateOutlineDto, UpdateOutlineDto, MoveOutlineDto } from './dto/outline.dto';
import { StateItemService } from '../../state/state-item.service';

export interface OutlineResponse {
  id: string;
  projectId: string;
  level: string;
  parentId?: string;
  order: number;
  title: string;
  content: string;
  chapterFunction: string;
  goalArc: string;
  targetWords: number;
  actualWords?: number;
  foreshadowingIds: string[];
  plotPoints: any[];
  status: string;
  characterIds: string[];
  children?: OutlineResponse[];
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class OutlineService {
  constructor(
    private readonly repo: OutlineRepository,
    private readonly db: DatabaseService,
    @Optional() private readonly stateItemService?: StateItemService,
  ) {}

  create(projectId: string, dto: CreateOutlineDto): OutlineResponse {
    const now = new Date().toISOString();
    const id = uuid();

    this.repo.insert({
      id,
      project_id: projectId,
      level: dto.level || 'chapter',
      parent_id: dto.parentId || null,
      order: dto.order || 0,
      title: dto.title,
      content: dto.content || '',
      chapter_function: dto.chapterFunction || 'breathing',
      goal_arc: dto.goalArc || 'crisis_resolve',
      target_words: dto.targetWords || 3000,
      actual_words: 0,
      foreshadowing_ids: JSON.stringify(dto.foreshadowingIds || []),
      plot_points: JSON.stringify(dto.plotPoints || []),
      status: 'planned',
      character_ids: JSON.stringify(dto.characterIds || []),
      scenes: dto.scenes ? JSON.stringify(dto.scenes) : null,
      volumes: dto.volumes ? JSON.stringify(dto.volumes) : null,
      book_skeleton: dto.bookSkeleton ? JSON.stringify(dto.bookSkeleton) : null,
      created_at: now,
      updated_at: now,
    });

    return this.toResponse(this.repo.findById(id)!);
  }

  findByProjectId(projectId: string): OutlineResponse[] {
    return this.repo.findByProjectId(projectId).map((r) => this.toResponse(r));
  }

  getTree(projectId: string): OutlineResponse[] {
    return this.repo.getTree(projectId).map((r) => this.toResponse(r));
  }

  findOne(id: string): OutlineResponse {
    const row = this.repo.findById(id);
    if (!row) throw new NotFoundException(`Outline ${id} not found`);
    return this.toResponse(row);
  }

  update(id: string, dto: UpdateOutlineDto): OutlineResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Outline ${id} not found`);

    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = { updated_at: now };

    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.content !== undefined) updateData.content = dto.content;
    if (dto.chapterFunction !== undefined) updateData.chapter_function = dto.chapterFunction;
    if (dto.goalArc !== undefined) updateData.goal_arc = dto.goalArc;
    if (dto.targetWords !== undefined) updateData.target_words = dto.targetWords;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.characterIds !== undefined) updateData.character_ids = JSON.stringify(dto.characterIds || []);
    if (dto.foreshadowingIds !== undefined) updateData.foreshadowing_ids = JSON.stringify(dto.foreshadowingIds || []);
    if (dto.plotPoints !== undefined) updateData.plot_points = JSON.stringify(dto.plotPoints || []);
    if (dto.scenes !== undefined) updateData.scenes = dto.scenes ? JSON.stringify(dto.scenes) : null;
    if (dto.volumes !== undefined) updateData.volumes = dto.volumes ? JSON.stringify(dto.volumes) : null;
    if (dto.bookSkeleton !== undefined) updateData.book_skeleton = dto.bookSkeleton ? JSON.stringify(dto.bookSkeleton) : null;

    this.repo.update(id, updateData);
    const response = this.toResponse(this.repo.findById(id)!);
    this.analyzeStateImpact(existing, dto);
    return response;
  }

  remove(id: string): { success: boolean } {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Outline ${id} not found`);
    if (existing.status === 'locked') throw new Error('已锁定章节不可删除');
    const order = existing.order;
    this.repo.delete(id);
    // 后续章节号前移
    const siblings = this.repo.findChildren(existing.parent_id || '') || [];
    for (const sib of siblings.filter(s => s.order > order)) {
      this.repo.update(sib.id, { order: sib.order - 1, updated_at: new Date().toISOString() });
    }
    // 状态同步
    this.syncAfterChapterChange(existing.project_id, order + 1, -1);
    return { success: true };
  }

  move(id: string, dto: MoveOutlineDto): OutlineResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Outline ${id} not found`);

    const row = this.repo.moveNode(id, dto.newParentId || null, dto.newOrder);
    return this.toResponse(row!);
  }

  reorderChildren(id: string, dto: { orderedIds: string[] }): { success: boolean } {
    this.repo.reorderChildren(id, dto.orderedIds);
    return { success: true };
  }

  /**
   * 拆分章节：在当前位置创建一个新章节，原章节保留前半部分
   * 后续章节顺序自动后移
   */
  split(id: string, dto: { newTitle: string; newContent?: string; splitPoint?: number }): { original: OutlineResponse; new: OutlineResponse } {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Outline ${id} not found`);

    const now = new Date().toISOString();
    const newId = uuid();
    const newOrder = existing.order + 1;
    const splitPoint = dto.splitPoint ?? Math.floor((existing.content?.length || 100) / 2);

    // 创建新章节（后半部分）
    this.repo.insert({
      id: newId,
      project_id: existing.project_id,
      level: existing.level,
      parent_id: existing.parent_id,
      order: newOrder,
      title: dto.newTitle,
      content: dto.newContent || (existing.content?.slice(splitPoint) || ''),
      chapter_function: existing.chapter_function,
      goal_arc: existing.goal_arc,
      target_words: Math.floor(existing.target_words / 2),
      actual_words: 0,
      foreshadowing_ids: '[]',
      plot_points: '[]',
      status: 'planned',
      character_ids: existing.character_ids,
      scenes: existing.scenes,
      volumes: null,
      book_skeleton: null,
      created_at: now,
      updated_at: now,
    });

    // 更新原章节（保留前半部分）
    const originalContent = (existing.content || '').slice(0, splitPoint);
    this.repo.update(id, {
      content: originalContent,
      target_words: Math.floor(existing.target_words / 2),
      updated_at: now,
    });

    // 后续章节顺序后移
    const siblings = this.repo.findChildren(existing.parent_id || '');
    const toShift = siblings.filter(s => s.order > existing.order && s.id !== newId);
    for (const sib of toShift) {
      this.repo.update(sib.id, { order: sib.order + 1, updated_at: now });
    }

    // 状态同步：更新伏笔和角色状态中引用的章节号
    this.syncAfterChapterChange(existing.project_id, existing.order + 1, 1);

    return {
      original: this.toResponse(this.repo.findById(id)!),
      new: this.toResponse(this.repo.findById(newId)!),
    };
  }

  /**
   * 将章节移动到其他卷
   */
  moveToVolume(id: string, targetVolumeId: string): OutlineResponse {
    const node = this.repo.findById(id);
    if (!node) throw new NotFoundException(`Outline ${id} not found`);
    return this.move(id, { newParentId: targetVolumeId, newOrder: 999 });
  }

  /**
   * 章节变动后同步：调整foreshadowings和character_states中引用的章节号
   * @param projectId 项目ID
   * @param fromChapter 从第几章开始偏移
   * @param offset +1(拆分) 或 -1(删除)
   */
  private syncAfterChapterChange(projectId: string, fromChapter: number, offset: number) {
    try {
      const d = this.db.getDb();
      // 同步 foreshadowings 表中的章节索引
      d.prepare(`
        UPDATE foreshadowings SET buried_chapter_index = buried_chapter_index + ?,
          planned_recovery_chapter_index = CASE WHEN planned_recovery_chapter_index >= ? THEN planned_recovery_chapter_index + ? ELSE planned_recovery_chapter_index END,
          updated_at = ?
        WHERE project_id = ? AND buried_chapter_index >= ?
      `).run(offset, fromChapter, offset, new Date().toISOString(), projectId, fromChapter);
    } catch {
      // 状态同步失败不影响主流程
    }
  }

  private analyzeStateImpact(existing: OutlineRow, dto: UpdateOutlineDto) {
    if (!this.stateItemService) return;
    const targetType = existing.level === 'volume'
      ? 'volume'
      : existing.level === 'chapter'
        ? 'chapter_plan'
        : 'outline';
    const priority = targetType === 'outline' ? 'book_outline' : targetType;
    try {
      this.stateItemService.analyzeImpact(existing.project_id, {
        targetType,
        targetId: existing.id,
        summary: `${targetType === 'volume' ? '分卷' : targetType === 'chapter_plan' ? '章节规划' : '总纲'}修改影响分析`,
        payload: {
          before: {
            title: existing.title,
            content: existing.content,
            level: existing.level,
            order: existing.order,
          },
          after: dto,
          priority,
          affects: targetType === 'outline'
            ? ['volume', 'chapter_plan', 'chapter']
            : targetType === 'volume'
              ? ['chapter_plan', 'chapter']
              : ['chapter'],
        },
      });
    } catch {
      // 影响分析失败不能阻断大纲保存
    }
  }

  findChildren(id: string): OutlineResponse[] {
    return this.repo.findChildren(id).map((r) => this.toResponse(r));
  }

  private toResponse(row: OutlineRow & { children?: OutlineRow[] }): OutlineResponse {
    const result: OutlineResponse = {
      id: row.id,
      projectId: row.project_id,
      level: row.level,
      parentId: row.parent_id || undefined,
      order: row.order,
      title: row.title,
      content: row.content,
      chapterFunction: row.chapter_function,
      goalArc: row.goal_arc,
      targetWords: row.target_words,
      actualWords: row.actual_words || undefined,
      foreshadowingIds: JSON.parse(row.foreshadowing_ids),
      plotPoints: JSON.parse(row.plot_points),
      status: row.status,
      characterIds: JSON.parse(row.character_ids),
      children: row.children ? row.children.map((c) => this.toResponse(c as any)) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    return result;
  }
}
