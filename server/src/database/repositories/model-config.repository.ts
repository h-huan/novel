/**
 * 模型配置 Repository
 */
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { BaseRepository } from './base.repository';

export interface ModelConfigRow {
  id: string;
  project_id: string | null;
  name: string;
  provider: string;
  model_name: string;
  role: string;
  context_window: number;
  max_output_tokens: number;
  supports_streaming: number;
  cost_level: string;
  temperature: number;
  top_p: number;
  max_tokens: number;
  estimated_cost: number;
  actual_cost: number;
  api_key_id: string | null;
  is_default: number;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class ModelConfigRepository extends BaseRepository<ModelConfigRow> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'model_configs');
  }

  findByProjectId(projectId: string): ModelConfigRow[] {
    return this.findByField('project_id', projectId);
  }

  findByRole(projectId: string, role: string): ModelConfigRow[] {
    const stmt = this.db.prepare(
      'SELECT * FROM model_configs WHERE (project_id = ? OR project_id IS NULL) AND role = ?'
    );
    return stmt.all(projectId, role) as unknown as ModelConfigRow[];
  }

  /**
   * 获取默认配置
   */
  getDefault(projectId: string): ModelConfigRow | undefined {
    const stmt = this.db.prepare(
      'SELECT * FROM model_configs WHERE project_id = ? AND is_default = 1 LIMIT 1'
    );
    return stmt.get(projectId) as unknown as ModelConfigRow | undefined;
  }

  /**
   * 设置为默�?   */
  setDefault(projectId: string, configId: string): void {
    try {
      this.db.exec('BEGIN');
      this.db.prepare('UPDATE model_configs SET is_default = 0 WHERE project_id = ?').run(projectId);
      this.db.prepare('UPDATE model_configs SET is_default = 1 WHERE id = ?').run(configId);
      this.db.exec('COMMIT');
    } catch {
      try { this.db.exec('ROLLBACK'); } catch { /* ignore */ }
    }
  }

  /**
   * 累加成本
   */
  addCost(id: string, cost: number): void {
    this.db.prepare(
      'UPDATE model_configs SET actual_cost = actual_cost + ?, updated_at = ? WHERE id = ?'
    ).run(cost, new Date().toISOString(), id);
  }
}
