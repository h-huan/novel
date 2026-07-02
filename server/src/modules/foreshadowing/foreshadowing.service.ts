/**
 * 伏笔 Service
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { ForeshadowingRepository } from '../../database/repositories/foreshadowing.repository';
import type { ForeshadowingRow } from '../../database/repositories/foreshadowing.repository';
import type { CreateForeshadowingDto, UpdateForeshadowingDto, RecoverForeshadowingDto } from './dto/foreshadowing.dto';

export interface ForeshadowingResponse {
  id: string;
  projectId: string;
  content: string;
  status: string;
  type: string;
  importance: number;
  buriedAt?: string;
  buriedChapterIndex: number;
  plannedRecoveryAt?: string;
  plannedRecoveryChapterIndex?: number;
  actualRecoveryAt?: string;
  actualRecoveryChapterIndex?: number;
  recoveryTrigger?: any;
  recoveryMethod?: string;
  impact?: number;
  relatedCharacterIds: string[];
  scope: string;
  volumeIndex: number;
  overdueThreshold: number;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class ForeshadowingService {
  constructor(private readonly repo: ForeshadowingRepository) {}

  create(projectId: string, dto: CreateForeshadowingDto): ForeshadowingResponse {
    const now = new Date().toISOString();
    const id = uuid();

    this.repo.insert({
      id,
      project_id: projectId,
      content: dto.content,
      status: 'buried',
      type: dto.type || 'hint',
      importance: dto.importance || 2,
      buried_at: dto.buriedAt || null,
      buried_chapter_index: dto.buriedChapterIndex,
      planned_recovery_at: dto.plannedRecoveryAt || null,
      planned_recovery_chapter_index: dto.plannedRecoveryChapterIndex || null,
      actual_recovery_at: null,
      actual_recovery_chapter_index: null,
      recovery_trigger: null,
      recovery_method: null,
      impact: null,
      related_character_ids: JSON.stringify(dto.relatedCharacterIds || []),
      related_reversal_ids: null,
      overdue_threshold: dto.overdueThreshold || 5,
      scope: dto.scope || 'chapter',
      volume_index: dto.volumeIndex || 0,
      created_at: now,
      updated_at: now,
    });

    return this.toResponse(this.repo.findById(id)!);
  }

  findByProjectId(projectId: string, status?: string): ForeshadowingResponse[] {
    if (status) {
      return this.repo.findByStatus(projectId, status).map((r) => this.toResponse(r));
    }
    return this.repo.findByProjectId(projectId).map((r) => this.toResponse(r));
  }

  findOne(id: string): ForeshadowingResponse {
    const row = this.repo.findById(id);
    if (!row) throw new NotFoundException(`Foreshadowing ${id} not found`);
    return this.toResponse(row);
  }

  update(id: string, dto: UpdateForeshadowingDto): ForeshadowingResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Foreshadowing ${id} not found`);

    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = { updated_at: now };

    if (dto.content !== undefined) updateData.content = dto.content;
    if (dto.type !== undefined) updateData.type = dto.type;
    if (dto.importance !== undefined) updateData.importance = dto.importance;
    if (dto.plannedRecoveryChapterIndex !== undefined) {
      updateData.planned_recovery_chapter_index = dto.plannedRecoveryChapterIndex;
    }

    this.repo.update(id, updateData);
    return this.toResponse(this.repo.findById(id)!);
  }

  remove(id: string): { success: boolean } {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Foreshadowing ${id} not found`);
    this.repo.delete(id);
    return { success: true };
  }

  /**
   * 激活伏笔 (buried → pending)
   */
  activate(id: string): ForeshadowingResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Foreshadowing ${id} not found`);
    if (existing.status !== 'buried') throw new Error('Only buried foreshadowings can be activated');

    this.repo.update(id, { status: 'pending', updated_at: new Date().toISOString() });
    return this.toResponse(this.repo.findById(id)!);
  }

  /**
   * 回收伏笔 (pending → recovered)
   */
  recover(id: string, dto: RecoverForeshadowingDto): ForeshadowingResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Foreshadowing ${id} not found`);
    if (existing.status !== 'pending') throw new Error('Only pending foreshadowings can be recovered');

    const row = this.repo.recoverForeshadowing(id, dto.chapterIndex, dto.method, dto.impact || 5);
    return this.toResponse(row!);
  }

  /**
   * 取消伏笔
   */
  cancel(id: string): ForeshadowingResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Foreshadowing ${id} not found`);

    const row = this.repo.cancelForeshadowing(id);
    return this.toResponse(row!);
  }

  /**
   * 获取过期预警
   */
  getOverdueWarnings(projectId: string, currentChapterIndex: number): ForeshadowingResponse[] {
    return this.repo.getOverdueWarnings(projectId, currentChapterIndex).map((r) => this.toResponse(r));
  }

  /**
   * 获取伏笔统计
   */
  getStats(projectId: string): any {
    return this.repo.getStats(projectId);
  }

  /**
   * 按角色查询伏笔
   */
  findByCharacter(projectId: string, characterId: string): ForeshadowingResponse[] {
    return this.repo.findByCharacterId(projectId, characterId).map((r) => this.toResponse(r));
  }

  private toResponse(row: ForeshadowingRow): ForeshadowingResponse {
    return {
      id: row.id,
      projectId: row.project_id,
      content: row.content,
      status: row.status,
      type: row.type,
      importance: row.importance,
      buriedAt: row.buried_at || undefined,
      buriedChapterIndex: row.buried_chapter_index,
      plannedRecoveryAt: row.planned_recovery_at || undefined,
      plannedRecoveryChapterIndex: row.planned_recovery_chapter_index || undefined,
      actualRecoveryAt: row.actual_recovery_at || undefined,
      actualRecoveryChapterIndex: row.actual_recovery_chapter_index || undefined,
      recoveryTrigger: row.recovery_trigger ? JSON.parse(row.recovery_trigger) : undefined,
      recoveryMethod: row.recovery_method || undefined,
      impact: row.impact || undefined,
      relatedCharacterIds: JSON.parse(row.related_character_ids),
      scope: row.scope || 'chapter',
      volumeIndex: row.volume_index || 0,
      overdueThreshold: row.overdue_threshold,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
