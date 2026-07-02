/**
 * 鍦板浘鍦扮偣 Repository
 */
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { BaseRepository } from './base.repository';

export interface MapPointRow {
  id: string;
  project_id: string;
  name: string;
  type: string;
  description: string;
  parent_id: string | null;
  level: string;
  coordinates: string | null;
  linked_chapter_ids: string;
  linked_character_ids: string;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class MapPointRepository extends BaseRepository<MapPointRow> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'map_points');
  }

  /**
   * 鎸夐」鐩甀D鏌ヨ
   */
  findByProjectId(projectId: string): MapPointRow[] {
    return this.findByField('project_id', projectId);
  }

  /**
   * 鎸夊眰绾ф煡璇?   */
  findByLevel(projectId: string, level: string): MapPointRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM map_points WHERE project_id = ? AND level = ?
      ORDER BY created_at ASC
    `);
    return stmt.all(projectId, level) as unknown as MapPointRow[];
  }

  /**
   * 鎸夌埗鍦扮偣鏌ヨ瀛愬湴鐐?   */
  findByParentId(projectId: string, parentId: string): MapPointRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM map_points WHERE project_id = ? AND parent_id = ?
      ORDER BY created_at ASC
    `);
    return stmt.all(projectId, parentId) as unknown as MapPointRow[];
  }

  /**
   * 鏌ヨ鏍瑰湴鐐癸紙鏃犵埗鍦扮偣锛?   */
  findRoots(projectId: string): MapPointRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM map_points
      WHERE project_id = ? AND (parent_id IS NULL OR parent_id = '')
      ORDER BY created_at ASC
    `);
    return stmt.all(projectId) as unknown as MapPointRow[];
  }

  /**
   * 鎼滅储鍦扮偣
   */
  search(projectId: string, query: string): MapPointRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM map_points
      WHERE project_id = ? AND (name LIKE ? OR description LIKE ?)
      ORDER BY name ASC
    `);
    const pattern = `%${query}%`;
    return stmt.all(projectId, pattern, pattern) as unknown as MapPointRow[];
  }

  /**
   * 鎸夊叧鑱旇鑹叉煡璇?   */
  findByCharacterId(projectId: string, characterId: string): MapPointRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM map_points
      WHERE project_id = ? AND linked_character_ids LIKE ?
      ORDER BY created_at DESC
    `);
    return stmt.all(projectId, `%${characterId}%`) as unknown as MapPointRow[];
  }

  /**
   * 鎸夊叧鑱旂珷鑺傛煡璇?   */
  findByChapterId(projectId: string, chapterId: string): MapPointRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM map_points
      WHERE project_id = ? AND linked_chapter_ids LIKE ?
      ORDER BY created_at DESC
    `);
    return stmt.all(projectId, `%${chapterId}%`) as unknown as MapPointRow[];
  }
}
