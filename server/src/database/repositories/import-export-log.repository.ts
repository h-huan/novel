/**
 * 导入导出日志 Repository
 */
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { BaseRepository } from './base.repository';

export interface ImportExportLogRow {
  id: string;
  project_id: string | null;
  direction: string;
  entity_type: string;
  entity_count: number;
  file_path: string | null;
  file_size: number | null;
  format: string;
  status: string;
  errors: string | null;
  started_at: string;
  completed_at: string | null;
  created_by: string;
}

@Injectable()
export class ImportExportLogRepository extends BaseRepository<ImportExportLogRow> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'import_export_logs');
  }

  findByProjectId(projectId: string): ImportExportLogRow[] {
    return this.findByField('project_id', projectId);
  }

  /**
   * 完成日志
   */
  complete(id: string, entityCount: number): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE import_export_logs
      SET status = 'completed', entity_count = ?, completed_at = ?
      WHERE id = ?
    `).run(entityCount, now, id);
  }

  /**
   * 失败日志
   */
  fail(id: string, errors: string[]): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE import_export_logs
      SET status = 'failed', errors = ?, completed_at = ?
      WHERE id = ?
    `).run(JSON.stringify(errors), now, id);
  }
}
