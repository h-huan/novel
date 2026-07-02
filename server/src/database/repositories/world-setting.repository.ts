/**
 * 涓栫晫瑙傝缃?Repository
 */
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { BaseRepository } from './base.repository';

export interface WorldSettingRow {
  id: string;
  project_id: string;
  name: string;
  era: string | null;
  era_period: string | null;
  geography: string;
  factions: string;
  power_system: string;
  economy: string;
  society: string;
  constraints: string;
  version: number;
  created_at: string;
  updated_at: string;
  // Short-story world setting fields
  story_premise?: string;
  locations?: string;
  social_rules?: string;
  special_settings?: string;
  setting_type?: string;
}

@Injectable()
export class WorldSettingRepository extends BaseRepository<WorldSettingRow> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'world_settings');
  }

  /**
   * 鎸夐」鐩甀D鏌ヨ
   */
  findByProjectId(projectId: string): WorldSettingRow[] {
    return this.findByField('project_id', projectId);
  }

  /**
   * 娣诲姞绾︽潫
   */
  addConstraint(worldId: string, constraint: unknown): WorldSettingRow | undefined {
    const row = this.findById(worldId);
    if (!row) return undefined;

    const constraints = JSON.parse(row.constraints || '[]');
    constraints.push(constraint);

    const version = row.version + 1;
    this.db.prepare(
      `UPDATE world_settings SET constraints = ?, version = ?, updated_at = ? WHERE id = ?`
    ).run(JSON.stringify(constraints), version, new Date().toISOString(), worldId);

    return this.findById(worldId);
  }

  /**
   * 鍒犻櫎绾︽潫
   */
  removeConstraint(worldId: string, constraintId: string): WorldSettingRow | undefined {
    const row = this.findById(worldId);
    if (!row) return undefined;

    const constraints = JSON.parse(row.constraints || '[]');
    const filtered = constraints.filter((c: any) => c.id !== constraintId);

    const version = row.version + 1;
    this.db.prepare(
      `UPDATE world_settings SET constraints = ?, version = ?, updated_at = ? WHERE id = ?`
    ).run(JSON.stringify(filtered), version, new Date().toISOString(), worldId);

    return this.findById(worldId);
  }

  /**
   * 鏇存柊绾︽潫
   */
  updateConstraint(worldId: string, constraintId: string, update: unknown): WorldSettingRow | undefined {
    const row = this.findById(worldId);
    if (!row) return undefined;

    const constraints = JSON.parse(row.constraints || '[]');
    const index = constraints.findIndex((c: any) => c.id === constraintId);
    if (index === -1) return undefined;

    constraints[index] = { ...constraints[index], ...(update as object) };

    const version = row.version + 1;
    this.db.prepare(
      `UPDATE world_settings SET constraints = ?, version = ?, updated_at = ? WHERE id = ?`
    ).run(JSON.stringify(constraints), version, new Date().toISOString(), worldId);

    return this.findById(worldId);
  }
}
