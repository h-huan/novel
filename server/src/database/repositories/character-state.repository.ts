/**
 * 角色状�?Repository
 */
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { BaseRepository } from './base.repository';

export interface CharacterStateRow {
  id: string;
  character_id: string;
  project_id: string;
  chapter_id: string | null;
  timestamp: string;
  snapshot_order: number;
  states_json: string;
  changed_dimensions: string | null;
  previous_snapshot_id: string | null;
  change_summary: string | null;
  confidence: number;
  needs_review: number;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_by: string;
  created_at: string;
}

@Injectable()
export class CharacterStateRepository extends BaseRepository<CharacterStateRow> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'character_states');
  }

  /**
   * 获取角色最新状态快�?   */
  getLatestState(characterId: string): CharacterStateRow | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM character_states
      WHERE character_id = ?
      ORDER BY snapshot_order DESC
      LIMIT 1
    `);
    return stmt.get(characterId) as unknown as CharacterStateRow | undefined;
  }

  /**
   * 获取角色的所有快�?   */
  getStateHistory(characterId: string): CharacterStateRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM character_states
      WHERE character_id = ?
      ORDER BY snapshot_order ASC
    `);
    return stmt.all(characterId) as unknown as CharacterStateRow[];
  }

  /**
   * 获取需要审核的快照
   */
  getNeedingReview(projectId: string): CharacterStateRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM character_states
      WHERE project_id = ? AND needs_review = 1
      ORDER BY created_at DESC
    `);
    return stmt.all(projectId) as unknown as CharacterStateRow[];
  }

  /**
   * 根据章节获取相关状态快�?   */
  getByChapter(chapterId: string): CharacterStateRow[] {
    return this.findByField('chapter_id', chapterId);
  }

  /**
   * 获取下一个快照序�?   */
  getNextSnapshotOrder(characterId: string): number {
    const stmt = this.db.prepare(`
      SELECT COALESCE(MAX(snapshot_order), 0) as max_order
      FROM character_states WHERE character_id = ?
    `);
    const result = stmt.get(characterId) as unknown as { max_order: number };
    return result.max_order + 1;
  }
}
