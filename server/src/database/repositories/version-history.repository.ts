/**
 * 版本历史 Repository
 */
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { BaseRepository } from './base.repository';

export interface VersionHistoryRow {
  id: string;
  entity_type: string;
  entity_id: string;
  version: number;
  snapshot: string;
  checksum: string | null;
  change_summary: string | null;
  created_by: string;
  created_at: string;
}

@Injectable()
export class VersionHistoryRepository extends BaseRepository<VersionHistoryRow> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'version_history');
  }

  /**
   * 获取实体版本列表
   */
  getVersions(entityType: string, entityId: string): VersionHistoryRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM version_history
      WHERE entity_type = ? AND entity_id = ?
      ORDER BY version DESC
    `);
    return stmt.all(entityType, entityId) as unknown as VersionHistoryRow[];
  }

  /**
   * 获取特定版本
   */
  getVersion(entityType: string, entityId: string, version: number): VersionHistoryRow | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM version_history
      WHERE entity_type = ? AND entity_id = ? AND version = ?
    `);
    return stmt.get(entityType, entityId, version) as unknown as VersionHistoryRow | undefined;
  }

  /**
   * 获取最新版本号
   */
  getLatestVersion(entityType: string, entityId: string): number {
    const result = this.db.prepare(`
      SELECT COALESCE(MAX(version), 0) as max_version FROM version_history
      WHERE entity_type = ? AND entity_id = ?
    `).get(entityType, entityId) as unknown as { max_version: number };
    return result.max_version;
  }
}
