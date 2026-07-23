/**
 * IdeaDraftRepository - 想法草稿数据访问层
 */
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { BaseRepository } from './base.repository';

export interface IdeaDraftRow {
  id: string;
  raw_idea: string;
  title: string;
  project_type: string;
  target_platform: string;
  target_words: number;
  description: string;
  settings_json: string;
  status: string;
  questions_json: string;
  answers_json: string;
  refined_idea_json: string;
  maturity_score: number;
  maturity_report_json: string;
  confirmed_idea: string;
  converted_project_id: string | null;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class IdeaDraftRepository extends BaseRepository<IdeaDraftRow> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'idea_drafts');
  }

  /**
   * 按状态查询草稿列表
   */
  findByStatus(status: string): IdeaDraftRow[] {
    return this.findByField('status', status);
  }

  /**
   * 按转换项目ID查询
   */
  findByConvertedProjectId(projectId: string): IdeaDraftRow | undefined {
    const stmt = this.db.prepare(
      `SELECT * FROM idea_drafts WHERE converted_project_id = ?`
    );
    return stmt.get(projectId) as IdeaDraftRow | undefined;
  }

  /**
   * 更新草稿状态
   */
  updateStatus(id: string, status: string): void {
    this.db.prepare(
      `UPDATE idea_drafts SET status = ?, updated_at = ? WHERE id = ?`
    ).run(status, new Date().toISOString(), id);
  }
}
