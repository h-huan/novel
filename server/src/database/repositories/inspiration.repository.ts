/**
 * InspirationRepository - 灵感数据持久�? */
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { BaseRepository } from './base.repository';

export interface InspirationRow {
  id: string;
  project_id: string | null;
  title: string;
  platform: string;
  hook: string;
  description: string;
  tags: string;
  characters: string;
  setting: string;
  estimated_words: number;
  status: string;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class InspirationRepository extends BaseRepository<InspirationRow> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'inspirations');
  }

  findByStatus(status: string): InspirationRow[] {
    const stmt = this.db.prepare(
      `SELECT * FROM inspirations WHERE status = ? ORDER BY created_at DESC`
    );
    return stmt.all(status) as unknown as InspirationRow[];
  }

  findByPlatform(platform: string): InspirationRow[] {
    const stmt = this.db.prepare(
      `SELECT * FROM inspirations WHERE platform = ? ORDER BY created_at DESC`
    );
    return stmt.all(platform) as unknown as InspirationRow[];
  }

  findByProject(projectId: string): InspirationRow[] {
    const stmt = this.db.prepare(
      `SELECT * FROM inspirations WHERE project_id = ? ORDER BY created_at DESC`
    );
    return stmt.all(projectId) as unknown as InspirationRow[];
  }

  setProjectId(id: string, projectId: string): void {
    const stmt = this.db.prepare(
      `UPDATE inspirations SET project_id = ?, status = 'converted', updated_at = datetime('now') WHERE id = ?`
    );
    stmt.run(projectId, id);
  }
}
