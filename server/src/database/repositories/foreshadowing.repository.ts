/**
 * 浼忕瑪 Repository
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
  recovery_window_start: number | null;
  recovery_window_end: number | null;
  evidence_text: string | null;
  risk_level: string | null;
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
   * 鎸夐」鐩甀D鏌ヨ
   */
  findByProjectId(projectId: string): ForeshadowingRow[] {
    return this.findByField('project_id', projectId);
  }

  /**
   * 鎸夌姸鎬佹煡璇?   */
  findByStatus(projectId: string, status: string): ForeshadowingRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM foreshadowings WHERE project_id = ? AND status = ?
      ORDER BY importance ASC, created_at ASC
    `);
    return stmt.all(projectId, status) as unknown as ForeshadowingRow[];
  }

  /**
   * 鑾峰彇寰呭洖鏀剁殑浼忕瑪 (pending鐘舵€?
   */
  getPending(projectId: string): ForeshadowingRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM foreshadowings
      WHERE project_id = ? AND status IN ('active', 'reminder', 'pending')
      ORDER BY importance ASC, created_at ASC
    `);
    return stmt.all(projectId) as unknown as ForeshadowingRow[];
  }

  /**
   * 鍥炴敹浼忕瑪
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
   * 鍙栨秷浼忕瑪
   */
  cancelForeshadowing(id: string): ForeshadowingRow | undefined {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE foreshadowings SET status = 'cancelled', updated_at = ? WHERE id = ?
    `).run(now, id);
    return this.findById(id);
  }

  /**
   * 鑾峰彇杩囨湡棰勮鐨勪紡绗?(鎺ヨ繎璁″垝鍥炴敹绔犺妭浣嗘湭鍥炴敹)
   */
  getOverdueWarnings(projectId: string, currentChapterIndex: number): ForeshadowingRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM foreshadowings
      WHERE project_id = ?
        AND status IN ('active', 'reminder', 'pending')
        AND COALESCE(recovery_window_end, planned_recovery_chapter_index) IS NOT NULL
        AND (COALESCE(recovery_window_end, planned_recovery_chapter_index) - ?) <= overdue_threshold
      ORDER BY COALESCE(recovery_window_end, planned_recovery_chapter_index) ASC
    `);
    return stmt.all(projectId, currentChapterIndex) as unknown as ForeshadowingRow[];
  }

  /**
   * 鎸夎鑹睮D鏌ヨ浼忕瑪
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
   * 鎸夊叧鑱旂珷鑺傛煡璇?   */
  findByChapterIndex(projectId: string, chapterIndex: number): ForeshadowingRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM foreshadowings
      WHERE project_id = ? AND buried_chapter_index = ?
    `);
    return stmt.all(projectId, chapterIndex) as unknown as ForeshadowingRow[];
  }

  /**
   * 鑾峰彇浼忕瑪缁熻
   */
  getStats(projectId: string): {
    total: number;
    buried: number;
    active: number;
    reminder: number;
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
      active: byStatus.active || 0,
      reminder: byStatus.reminder || 0,
      pending: byStatus.pending || 0,
      recovered: byStatus.recovered || 0,
      cancelled: byStatus.cancelled || 0,
      overdueCount: 0, // 闇€瑕?currentChapterIndex 鍙傛暟
      byImportance,
      byType,
    };
  }
}
