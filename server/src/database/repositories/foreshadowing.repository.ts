/**
 * 伏笔 Repository
 */
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { BaseRepository } from './base.repository';

export interface ForeshadowingRow {
  id: string;
  project_id: string;
  content: string;
  status: string;
  type: string;
  importance: number;
  buried_at: string | null;
  buried_chapter_index: number;
  planned_recovery_at: string | null;
  planned_recovery_chapter_index: number | null;
  actual_recovery_at: string | null;
  actual_recovery_chapter_index: number | null;
  recovery_trigger: string | null;
  recovery_method: string | null;
  impact: number | null;
  related_character_ids: string;
  related_reversal_ids: string | null;
  overdue_threshold: number;
  scope: string | null;
  volume_index: number | null;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class ForeshadowingRepository extends BaseRepository<ForeshadowingRow> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'foreshadowings');
  }

  /**
   * 按项目ID查询
   */
  findByProjectId(projectId: string): ForeshadowingRow[] {
    return this.findByField('project_id', projectId);
  }

  /**
   * 按状态查�?   */
  findByStatus(projectId: string, status: string): ForeshadowingRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM foreshadowings WHERE project_id = ? AND status = ?
      ORDER BY importance ASC, created_at ASC
    `);
    return stmt.all(projectId, status) as unknown as ForeshadowingRow[];
  }

  /**
   * 获取待回收的伏笔 (pending状�?
   */
  getPending(projectId: string): ForeshadowingRow[] {
    return this.findByStatus(projectId, 'pending');
  }

  /**
   * 回收伏笔
   */
  recoverForeshadowing(id: string, chapterIndex: number, method: string, impact: number): ForeshadowingRow | undefined {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE foreshadowings
      SET status = 'recovered',
          actual_recovery_chapter_index = ?,
          actual_recovery_at = ?,
          recovery_method = ?,
          impact = ?,
          updated_at = ?
      WHERE id = ?
    `).run(chapterIndex, now, method, impact, now, id);
    return this.findById(id);
  }

  /**
   * 取消伏笔
   */
  cancelForeshadowing(id: string): ForeshadowingRow | undefined {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE foreshadowings SET status = 'cancelled', updated_at = ? WHERE id = ?
    `).run(now, id);
    return this.findById(id);
  }

  /**
   * 获取过期预警的伏�?(接近计划回收章节但未回收)
   */
  getOverdueWarnings(projectId: string, currentChapterIndex: number): ForeshadowingRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM foreshadowings
      WHERE project_id = ?
        AND status = 'pending'
        AND planned_recovery_chapter_index IS NOT NULL
        AND (planned_recovery_chapter_index - ?) <= overdue_threshold
      ORDER BY planned_recovery_chapter_index ASC
    `);
    return stmt.all(projectId, currentChapterIndex) as unknown as ForeshadowingRow[];
  }

  /**
   * 按角色ID查询伏笔
   */
  findByCharacterId(projectId: string, characterId: string): ForeshadowingRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM foreshadowings
      WHERE project_id = ? AND related_character_ids LIKE ?
      ORDER BY created_at DESC
    `);
    return stmt.all(projectId, `%${characterId}%`) as unknown as ForeshadowingRow[];
  }

  /**
   * 按关联章节查�?   */
  findByChapterIndex(projectId: string, chapterIndex: number): ForeshadowingRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM foreshadowings
      WHERE project_id = ? AND buried_chapter_index = ?
    `);
    return stmt.all(projectId, chapterIndex) as unknown as ForeshadowingRow[];
  }

  /**
   * 获取伏笔统计
   */
  getStats(projectId: string): {
    total: number;
    buried: number;
    pending: number;
    recovered: number;
    cancelled: number;
    overdueCount: number;
    byImportance: Record<number, number>;
    byType: Record<string, number>;
  } {
    const statusStats = this.db.prepare(`
      SELECT status, COUNT(*) as count FROM foreshadowings
      WHERE project_id = ? GROUP BY status
    `).all(projectId) as { status: string; count: number }[];

    const importanceStats = this.db.prepare(`
      SELECT importance, COUNT(*) as count FROM foreshadowings
      WHERE project_id = ? GROUP BY importance
    `).all(projectId) as { importance: number; count: number }[];

    const typeStats = this.db.prepare(`
      SELECT type, COUNT(*) as count FROM foreshadowings
      WHERE project_id = ? GROUP BY type
    `).all(projectId) as { type: string; count: number }[];

    const total = statusStats.reduce((sum, r) => sum + r.count, 0);
    const byStatus: Record<string, number> = {};
    statusStats.forEach((r) => (byStatus[r.status] = r.count));

    const byImportance: Record<number, number> = {};
    importanceStats.forEach((r) => (byImportance[r.importance] = r.count));

    const byType: Record<string, number> = {};
    typeStats.forEach((r) => (byType[r.type] = r.count));

    return {
      total,
      buried: byStatus.buried || 0,
      pending: byStatus.pending || 0,
      recovered: byStatus.recovered || 0,
      cancelled: byStatus.cancelled || 0,
      overdueCount: 0, // 需�?currentChapterIndex 参数
      byImportance,
      byType,
    };
  }
}
