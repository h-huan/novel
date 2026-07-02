/**
 * 缁勭粐/鍔垮姏 Repository
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
  created_at: string;
  updated_at: string;
}

@Injectable()
export class OrganizationRepository extends BaseRepository<OrganizationRow> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'organizations');
  }

  /**
   * 鎸夐」鐩甀D鏌ヨ
   */
  findByProjectId(projectId: string): OrganizationRow[] {
    return this.findByField('project_id', projectId);
  }

  /**
   * 鎸夌埗缁勭粐ID鏌ヨ瀛愮粍缁?   */
  findByParentId(projectId: string, parentId: string): OrganizationRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM organizations WHERE project_id = ? AND parent_id = ?
      ORDER BY created_at ASC
    `);
    return stmt.all(projectId, parentId) as unknown as OrganizationRow[];
  }

  /**
   * 鏌ヨ鏍圭粍缁囷紙鏃犵埗缁勭粐锛?   */
  findRoots(projectId: string): OrganizationRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM organizations
      WHERE project_id = ? AND (parent_id IS NULL OR parent_id = '')
      ORDER BY created_at ASC
    `);
    return stmt.all(projectId) as unknown as OrganizationRow[];
  }

  /**
   * 鎼滅储缁勭粐
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
