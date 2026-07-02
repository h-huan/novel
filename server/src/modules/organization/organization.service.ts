/**
 * 组织/势力 Service
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { OrganizationRepository } from '../../database/repositories/organization.repository';
import type { OrganizationRow } from '../../database/repositories/organization.repository';
import type { CreateOrganizationDto, UpdateOrganizationDto } from './dto/organization.dto';
import type { OrganizationType, OrganizationTreeNode } from '@novel/shared';

export interface OrganizationResponse {
  id: string;
  projectId: string;
  name: string;
  type: OrganizationType;
  description: string;
  parentId: string | null;
  level: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class OrganizationService {
  constructor(private readonly repo: OrganizationRepository) {}

  create(projectId: string, dto: CreateOrganizationDto): OrganizationResponse {
    const now = new Date().toISOString();
    const id = uuid();

    this.repo.insert({
      id,
      project_id: projectId,
      name: dto.name,
      type: dto.type || 'organization',
      description: dto.description || '',
      parent_id: dto.parentId || null,
      level: '',
      created_at: now,
      updated_at: now,
    });

    return this.toResponse(this.repo.findById(id)!);
  }

  findByProjectId(projectId: string): OrganizationResponse[] {
    return this.repo.findByProjectId(projectId).map((r) => this.toResponse(r));
  }

  findOne(id: string): OrganizationResponse {
    const row = this.repo.findById(id);
    if (!row) throw new NotFoundException(`Organization ${id} not found`);
    return this.toResponse(row);
  }

  update(id: string, dto: UpdateOrganizationDto): OrganizationResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Organization ${id} not found`);

    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = { updated_at: now };

    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.type !== undefined) updateData.type = dto.type;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.parentId !== undefined) updateData.parent_id = dto.parentId || null;

    this.repo.update(id, updateData);
    return this.toResponse(this.repo.findById(id)!);
  }

  remove(id: string): { success: boolean } {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Organization ${id} not found`);
    this.repo.delete(id);
    return { success: true };
  }

  /** 获取子组织 */
  findByParentId(projectId: string, parentId: string): OrganizationResponse[] {
    return this.repo.findByParentId(projectId, parentId).map((r) => this.toResponse(r));
  }

  /** 返回树状结构（递归组装 children） */
  getTree(projectId: string): OrganizationTreeNode[] {
    const all = this.repo.findByProjectId(projectId);
    const nodeMap = new Map<string, OrganizationTreeNode>();
    const roots: OrganizationTreeNode[] = [];

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

  search(projectId: string, query: string): OrganizationResponse[] {
    return this.repo.search(projectId, query).map((r) => this.toResponse(r));
  }

  private toResponse(row: OrganizationRow): OrganizationResponse {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      type: (row.type || 'organization') as OrganizationType,
      description: row.description || '',
      parentId: row.parent_id || null,
      level: row.level || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
