/**
 * 项目 Repository
 */
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { BaseRepository } from './base.repository';

export interface ProjectRow {
  id: string;
  type: string;
  title: string;
  status: string;
  target_words: number;
  current_words: number;
  platform_style: string;
  description: string | null;
  writing_style: string | null;
  settings: string;
  creation_source: string;
  target_platform: string;
  current_workflow_stage: string | null;
  idea_status: string;
  idea_seed: string | null;
  confirmed_idea: string | null;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class ProjectRepository extends BaseRepository<ProjectRow> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'projects');
  }

  /**
   * 按状态查�?   */
  findByStatus(status: string): ProjectRow[] {
    return this.findByField('status', status);
  }

  /**
   * 搜索项目 (标题/描述模糊匹配)
   */
  search(query: string, limit = 20, offset = 0): ProjectRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM projects
      WHERE title LIKE ? OR description LIKE ?
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `);
    const pattern = `%${query}%`;
    return stmt.all(pattern, pattern, limit, offset) as unknown as ProjectRow[];
  }

  /**
   * 搜索计数
   */
  searchCount(query: string): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM projects
      WHERE title LIKE ? OR description LIKE ?
    `);
    const pattern = `%${query}%`;
    return (stmt.get(pattern, pattern) as unknown as { count: number }).count;
  }

  /**
   * 统计各状态项目数
   */
  countByStatus(): Record<string, number> {
    const rows = this.db.prepare(`
      SELECT status, COUNT(*) as count FROM projects GROUP BY status
    `).all() as { status: string; count: number }[];
    return rows.reduce((acc, r) => ({ ...acc, [r.status]: r.count }), {});
  }

  /**
   * 统计总字�?   */
  totalWords(): number {
    const result = this.db.prepare(`
      SELECT COALESCE(SUM(current_words), 0) as total FROM projects
    `).get() as { total: number };
    return result.total;
  }

  /**
   * 更新项目字数
   */
  updateWordCount(id: string, wordCount: number): void {
    this.db.prepare(
      `UPDATE projects SET current_words = ?, updated_at = ? WHERE id = ?`
    ).run(wordCount, new Date().toISOString(), id);
  }

  /**
   * 更新项目状�?   */
  updateStatus(id: string, status: string): void {
    this.db.prepare(
      `UPDATE projects SET status = ?, updated_at = ? WHERE id = ?`
    ).run(status, new Date().toISOString(), id);
  }

  /**
   * 获取项目完整统计
   */
  getProjectStats(projectId: string): any {
    const db = this.db;

    const characters = db.prepare(
      'SELECT COUNT(*) as count FROM characters WHERE project_id = ?'
    ).get(projectId) as unknown as { count: number };

    const outlines = db.prepare(
      'SELECT COUNT(*) as count FROM outlines WHERE project_id = ?'
    ).get(projectId) as unknown as { count: number };

    const chapters = db.prepare(
      'SELECT COUNT(*) as count FROM chapters WHERE project_id = ?'
    ).get(projectId) as unknown as { count: number };

    const drafts = db.prepare(
      "SELECT COUNT(*) as count FROM chapters WHERE project_id = ? AND status = 'draft'"
    ).get(projectId) as unknown as { count: number };

    const locked = db.prepare(
      "SELECT COUNT(*) as count FROM chapters WHERE project_id = ? AND status = 'locked'"
    ).get(projectId) as unknown as { count: number };

    const foreshadows = db.prepare(
      'SELECT COUNT(*) as count FROM foreshadowings WHERE project_id = ?'
    ).get(projectId) as unknown as { count: number };

    const pendingForeshadows = db.prepare(
      "SELECT COUNT(*) as count FROM foreshadowings WHERE project_id = ? AND status = 'pending'"
    ).get(projectId) as unknown as { count: number };

    return {
      projectId,
      characters: characters.count,
      outlines: outlines.count,
      chapters: chapters.count,
      chaptersDraft: drafts.count,
      chaptersLocked: locked.count,
      foreshadowings: foreshadows.count,
      foreshadowingsPending: pendingForeshadows.count,
    };
  }
}
