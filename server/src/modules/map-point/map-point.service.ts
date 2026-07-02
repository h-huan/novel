/**
 * 地图地点 Service
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { MapPointRepository } from '../../database/repositories/map-point.repository';
import type { MapPointRow } from '../../database/repositories/map-point.repository';
import type { CreateMapPointDto, UpdateMapPointDto } from './dto/map-point.dto';
import type { MapLevel, MapPointType, MapPointTreeNode } from '@novel/shared';

export interface MapPointResponse {
  id: string;
  projectId: string;
  name: string;
  type: MapPointType;
  description: string;
  parentId: string | null;
  level: MapLevel;
  coordinates?: string;
  linkedChapterIds: string[];
  linkedCharacterIds: string[];
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class MapPointService {
  constructor(private readonly repo: MapPointRepository) {}

  create(projectId: string, dto: CreateMapPointDto): MapPointResponse {
    const now = new Date().toISOString();
    const id = uuid();

    this.repo.insert({
      id,
      project_id: projectId,
      name: dto.name,
      type: dto.type || '',
      description: dto.description || '',
      parent_id: dto.parentId || null,
      level: dto.level || 'location',
      coordinates: dto.coordinates || null,
      linked_chapter_ids: JSON.stringify(dto.linkedChapterIds || []),
      linked_character_ids: JSON.stringify(dto.linkedCharacterIds || []),
      created_at: now,
      updated_at: now,
    });

    return this.toResponse(this.repo.findById(id)!);
  }

  findByProjectId(projectId: string): MapPointResponse[] {
    return this.repo.findByProjectId(projectId).map((r) => this.toResponse(r));
  }

  findOne(id: string): MapPointResponse {
    const row = this.repo.findById(id);
    if (!row) throw new NotFoundException(`MapPoint ${id} not found`);
    return this.toResponse(row);
  }

  update(id: string, dto: UpdateMapPointDto): MapPointResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`MapPoint ${id} not found`);

    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = { updated_at: now };

    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.type !== undefined) updateData.type = dto.type;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.parentId !== undefined) updateData.parent_id = dto.parentId || null;
    if (dto.level !== undefined) updateData.level = dto.level;
    if (dto.coordinates !== undefined) updateData.coordinates = dto.coordinates || null;
    if (dto.linkedChapterIds !== undefined) {
      updateData.linked_chapter_ids = JSON.stringify(dto.linkedChapterIds);
    }
    if (dto.linkedCharacterIds !== undefined) {
      updateData.linked_character_ids = JSON.stringify(dto.linkedCharacterIds);
    }

    this.repo.update(id, updateData);
    return this.toResponse(this.repo.findById(id)!);
  }

  remove(id: string): { success: boolean } {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`MapPoint ${id} not found`);
    this.repo.delete(id);
    return { success: true };
  }

  /** 按层级查询 */
  findByLevel(projectId: string, level: string): MapPointResponse[] {
    return this.repo.findByLevel(projectId, level).map((r) => this.toResponse(r));
  }

  /** 获取子地点 */
  findByParentId(projectId: string, parentId: string): MapPointResponse[] {
    return this.repo.findByParentId(projectId, parentId).map((r) => this.toResponse(r));
  }

  /** 返回树状结构（递归组装 children） */
  getTree(projectId: string): MapPointTreeNode[] {
    const all = this.repo.findByProjectId(projectId);
    const nodeMap = new Map<string, MapPointTreeNode>();
    const roots: MapPointTreeNode[] = [];

    // 第一遍：创建所有节点
    for (const row of all) {
      nodeMap.set(row.id, { ...this.toResponse(row), children: [] });
    }

    // 第二遍：组装父子关系
    for (const row of all) {
      const node = nodeMap.get(row.id)!;
      if (row.parent_id && nodeMap.has(row.parent_id)) {
        nodeMap.get(row.parent_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  search(projectId: string, query: string): MapPointResponse[] {
    return this.repo.search(projectId, query).map((r) => this.toResponse(r));
  }

  /** 按关联角色查询 */
  findByCharacter(projectId: string, characterId: string): MapPointResponse[] {
    return this.repo.findByCharacterId(projectId, characterId).map((r) => this.toResponse(r));
  }

  /** 按关联章节查询 */
  findByChapter(projectId: string, chapterId: string): MapPointResponse[] {
    return this.repo.findByChapterId(projectId, chapterId).map((r) => this.toResponse(r));
  }

  private toResponse(row: MapPointRow): MapPointResponse {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      type: row.type || '',
      description: row.description || '',
      parentId: row.parent_id || null,
      level: (row.level || 'location') as MapLevel,
      coordinates: row.coordinates || undefined,
      linkedChapterIds: JSON.parse(row.linked_chapter_ids || '[]'),
      linkedCharacterIds: JSON.parse(row.linked_character_ids || '[]'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
