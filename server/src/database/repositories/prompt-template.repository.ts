/**
 * 提示词模�?Repository
 */
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { BaseRepository } from './base.repository';

export interface PromptTemplateRow {
  id: string;
  project_id: string | null;
  name: string;
  type: string;
  template: string;
  variables: string;
  description: string | null;
  version: number;
  is_builtin: number;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class PromptTemplateRepository extends BaseRepository<PromptTemplateRow> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'prompt_templates');
  }

  findByProjectId(projectId: string): PromptTemplateRow[] {
    return this.findByField('project_id', projectId);
  }

  /**
   * 获取内置模板 + 项目自定义模�?   */
  findByProjectOrBuiltin(projectId: string): PromptTemplateRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM prompt_templates
      WHERE project_id = ? OR is_builtin = 1
      ORDER BY is_builtin DESC, name ASC
    `);
    return stmt.all(projectId) as unknown as PromptTemplateRow[];
  }

  /**
   * 按类型查�?   */
  findByType(projectId: string, type: string): PromptTemplateRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM prompt_templates
      WHERE (project_id = ? OR is_builtin = 1) AND type = ?
      ORDER BY name ASC
    `);
    return stmt.all(projectId, type) as unknown as PromptTemplateRow[];
  }
}
