/**
 * 项目 Service
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { ProjectRepository } from '../../database/repositories/project.repository';
import type { ProjectRow } from '../../database/repositories/project.repository';
import type { CreateProjectDto } from './dto/create-project.dto';
import type { UpdateProjectDto } from './dto/update-project.dto';
import type { ProjectQueryDto } from './dto/query-project.dto';

export interface ProjectResponse {
  id: string;
  type: string;
  /** 作品类型别名（与 type 一致） */
  projectMode: string;
  title: string;
  status: string;
  targetWords: number;
  /** 目标字数别名（与 targetWords 一致） */
  targetWordCount: number;
  currentWords: number;
  description?: string;
  writingStyle?: any;
  settings: any;
  platformStyle?: string;
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
  constructor(private readonly repo: ProjectRepository) {}

  /**
   * 创建项目
   */
  create(dto: CreateProjectDto): ProjectResponse {
    const now = new Date().toISOString();
    const id = uuid();

    const settings = JSON.stringify({
      autoSave: true,
      autoSaveInterval: 30,
      writingMode: dto.writingMode || 'semi_auto',
      immersiveModeEnabled: false,
      recapEnabled: true,
      typoCheckEnabled: true,
      sensitiveWordCheckEnabled: false,
      ...this.parseJsonObject(dto.settings),
    });

    // 推导默认创作阶段
    const projectType = dto.projectMode || dto.type || 'long_novel';
    const creationSource = dto.creationSource || 'blank';
    const currentWorkflowStage = dto.currentWorkflowStage ||
      this.defaultWorkflowStage(projectType, creationSource);

    // target_platform 兼容逻辑：优先 dto.targetPlatform，否则 dto.platformStyle，否则 generic
    const targetPlatform = dto.targetPlatform || dto.platformStyle || 'generic';
    const platformStyle = dto.platformStyle || dto.targetPlatform || 'generic';

    const row = {
      id,
      type: projectType,
      title: dto.title,
      status: dto.status || 'active',
      target_words: dto.targetWords || 0,
      current_words: 0,
      platform_style: platformStyle,
      description: dto.description || null,
      writing_style: dto.writingStyle !== undefined ? this.stringifyJsonValue(dto.writingStyle) : null,
      settings,
      creation_source: creationSource,
      target_platform: targetPlatform,
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
    if (dto.type !== undefined) updateData.type = dto.type;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.targetWords !== undefined) updateData.target_words = dto.targetWords;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.platformStyle !== undefined) updateData.platform_style = dto.platformStyle;
    if (dto.writingStyle !== undefined) updateData.writing_style = this.stringifyJsonValue(dto.writingStyle);

    // 第一阶段新增字段
    if (dto.creationSource !== undefined) updateData.creation_source = dto.creationSource;
    if (dto.targetPlatform !== undefined) updateData.target_platform = dto.targetPlatform;
    if (dto.currentWorkflowStage !== undefined) updateData.current_workflow_stage = dto.currentWorkflowStage;
    if (dto.ideaStatus !== undefined) updateData.idea_status = dto.ideaStatus;
    if (dto.ideaSeed !== undefined) updateData.idea_seed = dto.ideaSeed || null;
    if (dto.confirmedIdea !== undefined) updateData.confirmed_idea = dto.confirmedIdea || null;

    if (dto.settings !== undefined) {
      const existingSettings = this.safeParseSettings(existing.settings);
      updateData.settings = JSON.stringify({
        ...existingSettings,
        ...this.parseJsonObject(dto.settings),
      });
    }

    if (dto.writingMode) {
      const settings = updateData.settings
        ? JSON.parse(String(updateData.settings))
        : this.safeParseSettings(existing.settings);
      settings.writingMode = dto.writingMode;
      updateData.settings = JSON.stringify(settings);
    }

    this.repo.update(id, updateData);
    return this.toResponse(this.repo.findById(id)!);
  }

  /**
   * 删除项目
   */
  remove(id: string): { success: boolean } {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Project ${id} not found`);
    this.repo.delete(id);
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
    const targetPlatform = row.target_platform || row.platform_style || 'generic';
    const currentWorkflowStage = row.current_workflow_stage ||
      this.defaultWorkflowStage(row.type, creationSource);
    const ideaStatus = row.idea_status || 'none';

    return {
      id: row.id,
      type: row.type,
      projectMode: row.type,
      title: row.title,
      status: row.status,
      targetWords: row.target_words,
      targetWordCount: row.target_words,
      currentWords: row.current_words,
      description: row.description || undefined,
      writingStyle: row.writing_style ? JSON.parse(row.writing_style) : undefined,
      settings: JSON.parse(row.settings),
      platformStyle: row.platform_style || 'generic',
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

  private parseJsonObject(value: string | Record<string, unknown> | undefined): Record<string, unknown> {
    if (!value) return {};
    if (typeof value === 'string') return this.safeParseSettings(value);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  private stringifyJsonValue(value: string | Record<string, unknown>): string {
    return typeof value === 'string' ? value : JSON.stringify(value);
  }
}
