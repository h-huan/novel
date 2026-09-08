import { readConstitution, updateConstitution, constitutionColumns, constitutionSettings, type CreativeConstitution } from './creative-constitution';
/**
 * 项目 Service
 */
import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { ProjectRepository } from '../../database/repositories/project.repository';
import type { ProjectRow } from '../../database/repositories/project.repository';
import type { CreateProjectDto } from './dto/create-project.dto';
import type { UpdateProjectDto } from './dto/update-project.dto';
import type { ProjectQueryDto } from './dto/query-project.dto';
import { DatabaseService } from '../../database/database.service';

export interface ProjectResponse {
  creativeConstitution: CreativeConstitution;
  id: string;
  type: string;
  title: string;
  status: string;
  targetWords: number;
  currentWords: number;
  description?: string;
  settings: any;
  creationSource: string;
  targetPlatform: string;
  currentWorkflowStage: string;
  ideaStatus: string;
  ideaSeed?: string;
  confirmedIdea?: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class ProjectService {
  constructor(private readonly repo: ProjectRepository, @Optional() private readonly database?: DatabaseService) {}

  /**
   * 创建项目
   */
  create(dto: CreateProjectDto): ProjectResponse {
    const now = new Date().toISOString();
    const id = uuid();

    const settings = JSON.stringify(this.normalizePlanningSettings({
      autoSave: true,
      autoSaveInterval: 30,
      writingMode: dto.writingMode || 'full_auto',
      immersiveModeEnabled: false,
      recapEnabled: true,
      typoCheckEnabled: true,
      sensitiveWordCheckEnabled: false,
      ...this.parseJsonObject(dto.settings),
    }));

    // 推导默认创作阶段
    const projectType = dto.type || 'long_novel';
    const creationSource = dto.creationSource || 'blank';
    const currentWorkflowStage = dto.currentWorkflowStage ||
      this.defaultWorkflowStage(projectType, creationSource);

    const constitution = updateConstitution({ type: projectType, settings: '{}' }, dto);
    constitution.revision = 1;

    const row = {
      id,
      ...constitutionColumns(JSON.parse(settings), constitution),
      title: dto.title,
      status: dto.status || 'active',
      current_words: 0,
      description: dto.description || null,
      creation_source: creationSource,
      current_workflow_stage: currentWorkflowStage,
      idea_status: dto.ideaStatus || 'none',
      idea_seed: dto.ideaSeed || null,
      confirmed_idea: dto.confirmedIdea || null,
      created_at: now,
      updated_at: now,
    };

    this.repo.insert(row as any);

    return this.toResponse(this.repo.findById(id)!);
  }

  /**
   * 获取项目列表
   */
  findAll(query: ProjectQueryDto): { data: ProjectResponse[]; total: number } {
    if (query.search) {
      const data = this.repo.search(query.search, query.limit, query.offset);
      const total = this.repo.searchCount(query.search);
      return { data: data.map((r) => this.toResponse(r)), total };
    }

    if (query.status) {
      const allFiltered = this.repo.findByStatus(query.status);
      const total = allFiltered.length;
      const data = allFiltered.slice(query.offset ?? 0, (query.offset ?? 0) + (query.limit ?? 20));
      return { data: data.map((r) => this.toResponse(r)), total };
    }

    const total = this.repo.count();
    const data = this.repo.paginate(query.offset ?? 0, query.limit ?? 20, 'updated_at');
    return { data: data.map((r) => this.toResponse(r)), total };
  }

  /**
   * 获取项目详情
   */
  findOne(id: string): ProjectResponse {
    const row = this.repo.findById(id);
    if (!row) throw new NotFoundException(`Project ${id} not found`);
    return this.toResponse(row);
  }

  /**
   * 更新项目
   */
  update(id: string, dto: UpdateProjectDto): ProjectResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Project ${id} not found`);

    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = { updated_at: now };

    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.description !== undefined) updateData.description = dto.description;

    // 第一阶段新增字段
    if (dto.creationSource !== undefined) updateData.creation_source = dto.creationSource;
    if (dto.currentWorkflowStage !== undefined) updateData.current_workflow_stage = dto.currentWorkflowStage;
    if (dto.ideaStatus !== undefined) updateData.idea_status = dto.ideaStatus;
    if (dto.ideaSeed !== undefined) updateData.idea_seed = dto.ideaSeed || null;
    if (dto.confirmedIdea !== undefined) updateData.confirmed_idea = dto.confirmedIdea || null;

    const constitution = updateConstitution(existing, dto);
    Object.assign(updateData, constitutionColumns(
      this.normalizePlanningSettings({ ...this.safeParseSettings(existing.settings), ...this.parseJsonObject(dto.settings), ...(dto.writingMode ? { writingMode: dto.writingMode } : {}) }),
      constitution,
    ));
    this.repo.update(id, updateData);
    return this.toResponse(this.repo.findById(id)!);
  }

  /**
   * 删除项目
   */
  remove(id: string): { success: boolean } {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Project ${id} not found`);
    const db = this.database?.getDb();
    const versionEntityIds = db ? [
      ...(['characters', 'world_settings', 'outlines', 'foreshadowings', 'organizations', 'map_points', 'chapters'] as const)
        .flatMap(table => (db.prepare(`SELECT id FROM ${table} WHERE project_id = ?`).all(id) as Array<{ id: string }>).map(row => row.id)),
      ...(db.prepare(`SELECT id FROM timelines WHERE project_id = ?`).all(id) as Array<{ id: string }>).map(row => row.id),
      ...(db.prepare(`SELECT event.id FROM timeline_events event JOIN timelines timeline ON timeline.id = event.timeline_id WHERE timeline.project_id = ?`).all(id) as Array<{ id: string }>).map(row => row.id),
    ] : [];
    this.repo.delete(id);
    if (db) {
      if (versionEntityIds.length) {
        const placeholders = versionEntityIds.map(() => '?').join(',');
        db.prepare(`DELETE FROM version_history WHERE entity_id IN (${placeholders})`).run(...versionEntityIds);
      }
      for (const table of [
        'canonical_entity_sync_states',
        'chapter_continuity_reviews',
        'chapter_summaries',
        'aggregate_summary_states',
        'chapter_derived_sync_states',
      ]) {
        db.prepare(`DELETE FROM ${table} WHERE project_id = ?`).run(id);
      }
    }
    return { success: true };
  }

  /**
   * 获取项目统计
   */
  getStats(id: string): any {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Project ${id} not found`);
    return this.repo.getProjectStats(id);
  }

  /**
   * 获取全局统计
   */
  getGlobalStats(): any {
    return {
      totalProjects: this.repo.count(),
      totalWords: this.repo.totalWords(),
      byStatus: this.repo.countByStatus(),
    };
  }

  /**
   * 转换数据库行为API响应
   */
  private toResponse(row: ProjectRow): ProjectResponse {
    const creationSource = row.creation_source || 'blank';
    const constitution = readConstitution(row);
    const targetPlatform = constitution.targetPlatform;
    const currentWorkflowStage = row.current_workflow_stage ||
      this.defaultWorkflowStage(row.type, creationSource);
    const ideaStatus = row.idea_status || 'none';

    return {
      id: row.id,
      creativeConstitution: constitution,
      type: constitution.projectType,
      title: row.title,
      status: row.status,
      targetWords: constitution.targetWords,
      currentWords: row.current_words,
      description: row.description || undefined,
      settings: constitutionSettings(this.normalizePlanningSettings(this.safeParseSettings(row.settings)), constitution),
      creationSource,
      targetPlatform,
      currentWorkflowStage,
      ideaStatus,
      ideaSeed: row.idea_seed || undefined,
      confirmedIdea: row.confirmed_idea || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * 根据作品类型和创建来源推导默认创作阶段
   */
  private defaultWorkflowStage(type: string, _creationSource: string): string {
    if (type === 'short_story') return 'topic';
    return 'idea_or_inspiration';
  }

  private safeParseSettings(value: string | null | undefined): Record<string, unknown> {
    if (!value) return {};
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  private normalizePlanningSettings(settings: Record<string, unknown>): Record<string, unknown> {
    const normalized = { ...settings };
    for (const legacyKey of ['perChapterTarget', 'wordsPerChapter', 'chapterWords', 'volumeCount', 'chaptersPerVolume', 'totalChapters', 'chapterCount']) {
      delete normalized[legacyKey];
    }

    normalized.structurePlanning = 'dynamic_by_story_rhythm';
    return normalized;
  }

  private parseJsonObject(value: string | Record<string, unknown> | undefined): Record<string, unknown> {
    if (!value) return {};
    if (typeof value === 'string') return this.safeParseSettings(value);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

}
