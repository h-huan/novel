/**
 * 伏笔 Service
 */
import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { ForeshadowingRepository } from '../../database/repositories/foreshadowing.repository';
import type { ForeshadowingRow } from '../../database/repositories/foreshadowing.repository';
import type { CreateForeshadowingDto, UpdateForeshadowingDto, RecoverForeshadowingDto } from './dto/foreshadowing.dto';
import { StateItemService } from '../../state/state-item.service';

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
  recoveryWindowStart?: number;
  recoveryWindowEnd?: number;
  evidenceText?: string;
  riskLevel: 'low' | 'medium' | 'high';
  actualRecoveryAt?: string;
  actualRecoveryChapterIndex?: number;
  recoveryTrigger?: any;
  recoveryCondition?: string;
  payoffDescription?: string;
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
  constructor(
    private readonly repo: ForeshadowingRepository,
    @Optional() private readonly stateItems?: StateItemService,
  ) {}

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
      recovery_window_start: dto.recoveryWindowStart ?? dto.plannedRecoveryChapterIndex ?? null,
      recovery_window_end: dto.recoveryWindowEnd ?? dto.plannedRecoveryChapterIndex ?? null,
      evidence_text: dto.evidenceText || '',
      risk_level: dto.riskLevel || 'medium',
      actual_recovery_at: null,
      actual_recovery_chapter_index: null,
      recovery_trigger: null,
      recovery_condition: dto.recoveryCondition || '',
      payoff_description: dto.payoffDescription || '',
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
    if (dto.recoveryWindowStart !== undefined) updateData.recovery_window_start = dto.recoveryWindowStart;
    if (dto.recoveryWindowEnd !== undefined) updateData.recovery_window_end = dto.recoveryWindowEnd;
    if (dto.evidenceText !== undefined) updateData.evidence_text = dto.evidenceText;
    if (dto.riskLevel !== undefined) updateData.risk_level = dto.riskLevel;
    if (dto.recoveryCondition !== undefined) updateData.recovery_condition = dto.recoveryCondition;
    if (dto.payoffDescription !== undefined) updateData.payoff_description = dto.payoffDescription;

    this.repo.update(id, updateData);
    const response = this.toResponse(this.repo.findById(id)!);
    this.recordChange(existing, 'update', dto, response);
    return response;
  }

  remove(id: string): { success: boolean } {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Foreshadowing ${id} not found`);
    this.repo.delete(id);
    this.recordChange(existing, 'remove', {}, undefined);
    return { success: true };
  }

  /**
   * 激活伏笔 (buried → active)
   */
  activate(id: string): ForeshadowingResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Foreshadowing ${id} not found`);
    if (existing.status !== 'buried') throw new Error('Only buried foreshadowings can be activated');

    this.repo.update(id, { status: 'active', updated_at: new Date().toISOString() });
    const response = this.toResponse(this.repo.findById(id)!);
    this.recordChange(existing, 'activate', {}, response);
    return response;
  }

  /** 将已激活伏笔推进到提醒阶段，供写作包和工作台优先展示。 */
  remind(id: string): ForeshadowingResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Foreshadowing ${id} not found`);
    if (!['active', 'pending'].includes(existing.status)) {
      throw new Error('Only active foreshadowings can enter reminder status');
    }
    this.repo.update(id, { status: 'reminder', updated_at: new Date().toISOString() });
    const response = this.toResponse(this.repo.findById(id)!);
    this.recordChange(existing, 'remind', {}, response);
    return response;
  }

  /**
   * 回收伏笔 (active/reminder/legacy pending → recovered)
   */
  recover(id: string, dto: RecoverForeshadowingDto): ForeshadowingResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Foreshadowing ${id} not found`);
    if (!['active', 'reminder', 'pending'].includes(existing.status)) {
      throw new Error('Only active or reminded foreshadowings can be recovered');
    }

    const row = this.repo.recoverForeshadowing(id, dto.chapterIndex, dto.method, dto.impact || 5);
    const response = this.toResponse(row!);
    this.recordChange(existing, 'recover', dto, response);
    return response;
  }

  /**
   * 取消伏笔
   */
  cancel(id: string): ForeshadowingResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Foreshadowing ${id} not found`);

    const row = this.repo.cancelForeshadowing(id);
    const response = this.toResponse(row!);
    this.recordChange(existing, 'cancel', {}, response);
    return response;
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
      recoveryWindowStart: row.recovery_window_start ?? undefined,
      recoveryWindowEnd: row.recovery_window_end ?? undefined,
      evidenceText: row.evidence_text || undefined,
      riskLevel: (['low', 'medium', 'high'].includes(row.risk_level || '') ? row.risk_level : 'medium') as 'low' | 'medium' | 'high',
      actualRecoveryAt: row.actual_recovery_at || undefined,
      actualRecoveryChapterIndex: row.actual_recovery_chapter_index || undefined,
      recoveryTrigger: row.recovery_trigger ? JSON.parse(row.recovery_trigger) : undefined,
      recoveryCondition: (row as any).recovery_condition || undefined,
      payoffDescription: (row as any).payoff_description || undefined,
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

  /** Canonical foreshadowing changes never rewrite prose automatically. They create a
   * reviewable impact record so downstream chapters can be checked before locking. */
  private recordChange(existing: ForeshadowingRow, operation: string, input: unknown, after?: ForeshadowingResponse) {
    if (!this.stateItems) return;
    this.stateItems.analyzeImpactTracked(existing.project_id, {
        targetType: 'foreshadowing', targetId: existing.id,
        summary: `Foreshadowing ${operation} requires continuity review`,
        payload: {
          operation, before: this.toResponse(existing), after: after || null, input,
          priority: 'foreshadowing', affects: ['outline', 'chapter_plan', 'chapter', 'writing_context'],
          needsReview: true,
        },
    });
  }
}
