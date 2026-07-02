/**
 * 角色 Repository
 */
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { BaseRepository } from './base.repository';

export interface CharacterRow {
  id: string;
  project_id: string;
  name: string;
  aliases: string | null;
  age: number | null;
  gender: string | null;
  identity: string | null;
  appearance: string | null;
  background: string | null;
  personality: string;
  abilities: string;
  relationships: string;
  arc: string;
  dialogue_style: string | null;
  dialogue_patterns: string | null;
  is_pov_character: number;
  role: string | null;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class CharacterRepository extends BaseRepository<CharacterRow> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'characters');
  }

  /**
   * 按项目ID查询
   */
  findByProjectId(projectId: string): CharacterRow[] {
    return this.findByField('project_id', projectId);
  }

  /**
   * 查询POV角色
   */
  findPovCharacters(projectId: string): CharacterRow[] {
    const stmt = this.db.prepare(
      'SELECT * FROM characters WHERE project_id = ? AND is_pov_character = 1'
    );
    return stmt.all(projectId) as unknown as CharacterRow[];
  }

  /**
   * 添加关系
   */
  addRelationship(characterId: string, relationship: unknown): CharacterRow | undefined {
    const row = this.findById(characterId);
    if (!row) return undefined;

    const relationships = JSON.parse(row.relationships || '[]');
    relationships.push(relationship);

    this.db.prepare(
      `UPDATE characters SET relationships = ?, updated_at = ? WHERE id = ?`
    ).run(JSON.stringify(relationships), new Date().toISOString(), characterId);

    return this.findById(characterId);
  }

  /**
   * 删除关系
   */
  removeRelationship(characterId: string, targetId: string): CharacterRow | undefined {
    const row = this.findById(characterId);
    if (!row) return undefined;

    const relationships = JSON.parse(row.relationships || '[]');
    const filtered = relationships.filter((r: any) => r.targetCharacterId !== targetId);

    this.db.prepare(
      `UPDATE characters SET relationships = ?, updated_at = ? WHERE id = ?`
    ).run(JSON.stringify(filtered), new Date().toISOString(), characterId);

    return this.findById(characterId);
  }

  /**
   * 搜索角色
   */
  search(projectId: string, query: string): CharacterRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM characters
      WHERE project_id = ? AND (name LIKE ? OR identity LIKE ?)
      ORDER BY name ASC
    `);
    const pattern = `%${query}%`;
    return stmt.all(projectId, pattern, pattern) as unknown as CharacterRow[];
  }
}
