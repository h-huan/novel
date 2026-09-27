import { readConstitution, updateConstitution, constitutionColumns, constitutionSettings, categoryPlacementProblem, categoryPlacementMessage, missingConstitutionStandards, genreFitProblem, categoryWordScaleStanding, categoryWordScaleBlocked, categoryWordScaleMessage, type CreativeConstitution } from './creative-constitution';
import { platformDisplayName } from '../../../shared/src';
import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
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
  /** Historical provenance only. New UI no longer branches on it. */
  creationSource: string;
  targetPlatform: string;
  currentWorkflowStage: string;
  /** Transitional read-only projections; project CRUD can no longer mutate these fields. */
  ideaStatus: string;
  ideaSeed?: string;
  confirmedIdea?: string;
  createdAt: string;
  updatedAt: string;
}

function confirmedStoryForResponse(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value || undefined;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const summary = (value as Record<string, unknown>).summary;
    if (typeof summary === 'string' && summary.trim()) return summary;
  }
  try { return JSON.stringify(value); } catch { return undefined; }
}

@Injectable()
export class ProjectService {
  constructor(private readonly repo: ProjectRepository, @Optional() private readonly database?: DatabaseService) {}

  /**
   * Direct project CRUD is no longer an idea-incubation path. It can create a
   * standards-complete project shell only; confirmed story authority belongs
   * to the /discover creation chain and Creative Constitution.
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

    const projectType = dto.type || 'long_novel';
    const currentWorkflowStage = dto.currentWorkflowStage || this.defaultWorkflowStage(projectType);
    const constitution = updateConstitution({ type: projectType, settings: '{}' }, dto);
    constitution.revision = 1;

    const missingStandards = missingConstitutionStandards(constitution);
    if (missingStandards.length > 0) {
      throw new BadRequestException(
        missingStandards
          .map(item => `创作宪法未设置${item.label}：属未执行标准，必须补齐后才能继续（不得用默认值或平台推荐替代）`)
          .join('；')
        + '；项目未创建，请先选定这些执行标准。',
      );
    }

    const placementProblem = categoryPlacementProblem(constitution);
    if (placementProblem) {
      throw new BadRequestException(
        categoryPlacementMessage(constitution, placementProblem, platformDisplayName(constitution.targetPlatform))
        + '；作品未创建，请先改选该平台的投稿分类。',
      );
    }
    const fitProblem = genreFitProblem(constitution);
    if (fitProblem) throw new BadRequestException(fitProblem + '；作品未创建。');

    const scaleStanding = categoryWordScaleStanding(constitution);
    if (categoryWordScaleBlocked(scaleStanding)) {
      throw new BadRequestException(
        categoryWordScaleMessage(scaleStanding, platformDisplayName(constitution.targetPlatform))
        + '；项目未创建，请调整目标总字数，或补齐「分类体量取舍依据」。',
      );
    }

    const row = {
      id,
      ...constitutionColumns(JSON.parse(settings), constitution),
      title: dto.title,
      status: dto.status || 'active',
      current_words: 0,
      description: dto.description || null,
      current_workflow_stage: currentWorkflowStage,
      created_at: now,
      updated_at: now,
    };

    this.repo.insert(row as any);
    return this.toResponse(this.repo.findById(id)!);
  }

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

  findOne(id: string): ProjectResponse {
    const row = this.repo.findById(id);
    if (!row) throw new NotFoundException(`Project ${id} not found`);
    return this.toResponse(row);
  }

  update(id: string, dto: UpdateProjectDto): ProjectResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Project ${id} not found`);

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.currentWorkflowStage !== undefined) updateData.current_workflow_stage = dto.currentWorkflowStage;

    const constitution = updateConstitution(existing, dto);
    if (dto.targetPlatform !== undefined || dto.category !== undefined || dto.webNovelGenre !== undefined || dto.submissionTags !== undefined || dto.genreFitNote !== undefined
      || dto.targetWords !== undefined || dto.categoryWordScaleDeviation !== undefined) {
      const fitProblem = genreFitProblem(constitution);
      if (fitProblem) throw new BadRequestException(fitProblem + '；执行标准未保存。');
      const placementProblem = categoryPlacementProblem(constitution);
      if (placementProblem) {
        throw new BadRequestException(
          categoryPlacementMessage(constitution, placementProblem, platformDisplayName(constitution.targetPlatform))
          + '；执行标准未保存，请把分类改选为该平台的投稿分类。',
        );
      }
      const scaleStanding = categoryWordScaleStanding(constitution);
      if (categoryWordScaleBlocked(scaleStanding)) {
        throw new BadRequestException(
          categoryWordScaleMessage(scaleStanding, platformDisplayName(constitution.targetPlatform))
          + '；执行标准未保存，请调整目标总字数，或补齐「分类体量取舍依据」。',
        );
      }
    }

    Object.assign(updateData, constitutionColumns(
      this.normalizePlanningSettings({
        ...this.safeParseSettings(existing.settings),
        ...this.parseJsonObject(dto.settings),
        ...(dto.writingMode ? { writingMode: dto.writingMode } : {}),
      }),
      constitution,
    ));
    this.repo.update(id, updateData);
    return this.toResponse(this.repo.findById(id)!);
  }

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

  getStats(id: string): any {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Project ${id} not found`);
    return this.repo.getProjectStats(id);
  }

  getGlobalStats(): any {
    return {
      totalProjects: this.repo.count(),
      totalWords: this.repo.totalWords(),
      byStatus: this.repo.countByStatus(),
    };
  }

  private toResponse(row: ProjectRow): ProjectResponse {
    const constitution = readConstitution(row);
    const targetPlatform = constitution.targetPlatform;
    const currentWorkflowStage = row.current_workflow_stage || this.defaultWorkflowStage(row.type);
    const canonicalStory = (constitution as CreativeConstitution & { confirmedStory?: unknown }).confirmedStory;

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
      creationSource: row.creation_source || 'legacy',
      targetPlatform,
      currentWorkflowStage,
      ideaStatus: 'none',
      ideaSeed: undefined,
      confirmedIdea: confirmedStoryForResponse(canonicalStory),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private defaultWorkflowStage(type: string): string {
    return type === 'short_story' ? 'topic' : 'world_setting';
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
