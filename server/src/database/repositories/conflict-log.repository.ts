/**
 * 冲突日志 Repository
 */
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { BaseRepository } from './base.repository';

export interface ConflictLogRow {
  id: string;
  project_id: string;
  chapter_id: string | null;
  type: string;
  priority: number;
  description: string;
  source_entity_type: string | null;
  source_entity_id: string | null;
  conflict_entity_type: string | null;
  conflict_entity_id: string | null;
  resolution: string | null;
  resolution_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

@Injectable()
export class ConflictLogRepository extends BaseRepository<ConflictLogRow> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'conflict_logs');
  }

  findByProjectId(projectId: string): ConflictLogRow[] {
    return this.findByField('project_id', projectId);
  }

  /**
   * 获取未解决的冲突
   */
  getUnresolved(projectId: string): ConflictLogRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM conflict_logs
      WHERE project_id = ? AND resolution IS NULL
      ORDER BY priority ASC, created_at DESC
    `);
    return stmt.all(projectId) as unknown as ConflictLogRow[];
  }

  /**
   * 解决冲突
   */
  resolve(id: string, resolution: string, resolvedBy: string): ConflictLogRow | undefined {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE conflict_logs SET resolution = ?, resolution_by = ?, resolved_at = ? WHERE id = ?
    `).run(resolution, resolvedBy, now, id);
    return this.findById(id);
  }

  /**
   * 按章节查询冲�?   */
  findByChapter(chapterId: string): ConflictLogRow[] {
    return this.findByField('chapter_id', chapterId);
  }
}
