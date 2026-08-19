/**
 * 组织/势力 Repository
 */
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { BaseRepository } from './base.repository';

export interface OrganizationRow {
  id: string;
  project_id: string;
  name: string;
  type: string;
  description: string;
  parent_id: string | null;
  level: string | null;
  leader: string | null;
  strength_level: number | null;
  territory: string | null;
  characteristics: string | null;
  relationships_json: string | null;
  signature_equipment: string | null;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class OrganizationRepository extends BaseRepository<OrganizationRow> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'organizations');
  }

  /**
   * 按项目ID查询
   */
  findByProjectId(projectId: string): OrganizationRow[] {
    return this.findByField('project_id', projectId);
  }

  /**
   * 按父组织ID查询子组织
   */
  findByParentId(projectId: string, parentId: string): OrganizationRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM organizations WHERE project_id = ? AND parent_id = ?
      ORDER BY created_at ASC
    `);
    return stmt.all(projectId, parentId) as unknown as OrganizationRow[];
  }

  /**
   * 查询根组织（无父组织）
   */
  findRoots(projectId: string): OrganizationRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM organizations
      WHERE project_id = ? AND (parent_id IS NULL OR parent_id = '')
      ORDER BY created_at ASC
    `);
    return stmt.all(projectId) as unknown as OrganizationRow[];
  }

  /**
   * 搜索组织
   */
  search(projectId: string, query: string): OrganizationRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM organizations
      WHERE project_id = ? AND (name LIKE ? OR description LIKE ?)
      ORDER BY name ASC
    `);
    const pattern = `%${query}%`;
    return stmt.all(projectId, pattern, pattern) as unknown as OrganizationRow[];
  }
}
