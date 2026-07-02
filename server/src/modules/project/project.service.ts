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
  title: string;
  status: string;
  targetWords: number;
  currentWords: number;
  description?: string;
  writingStyle?: any;
  settings: any;
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

    this.repo.insert({
      id,
      type: dto.type || 'long_novel',
      title: dto.title,
      status: dto.status || 'active',
      target_words: dto.targetWords || 0,
      current_words: 0,
      platform_style: dto.platformStyle || 'generic',
      description: dto.description || null,
      writing_style: dto.writingStyle !== undefined ? this.stringifyJsonValue(dto.writingStyle) : null,
      settings,
      created_at: now,
      updated_at: now,
    });

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
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      status: row.status,
      targetWords: row.target_words,
      currentWords: row.current_words,
      description: row.description || undefined,
      writingStyle: row.writing_style ? JSON.parse(row.writing_style) : undefined,
      settings: JSON.parse(row.settings),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
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
