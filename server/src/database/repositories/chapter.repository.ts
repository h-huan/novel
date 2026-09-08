/**
 * 章节 Repository
 */
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { BaseRepository } from './base.repository';

export interface ChapterRow {
  id: string;
  project_id: string;
  outline_id: string | null;
  volume_index: number;
  chapter_index: number;
  title: string;
  content: string;
  word_count: number;
  status: string;
  model_config: string | null;
  hook_type: string | null;
  transition_mode: string | null;
  transition_context: string | null;
  authors_notes: string | null;
  quality_score: string | null;
  checksum: string | null;
  file_path: string | null;
  created_at: string;
  updated_at: string;
  locked_at: string | null;
  // 自动质检可观测状态：running/ok/failed/NULL
  auto_quality_status: string | null;
  auto_quality_message: string | null;
  auto_quality_at: string | null;
}

@Injectable()
export class ChapterRepository extends BaseRepository<ChapterRow> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'chapters');
  }

  findOutlineTargetWords(outlineId: string | null): number | undefined {
    if (!outlineId) return undefined;
    const row = this.db.prepare('SELECT target_words FROM outlines WHERE id = ?').get(outlineId) as { target_words?: number } | undefined;
    return row?.target_words == null ? undefined : Number(row.target_words);
  }

  /**
   * 按项目ID查询
   */
  findByProjectId(projectId: string): ChapterRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM chapters
      WHERE project_id = ?
      ORDER BY volume_index ASC, chapter_index ASC
    `);
    return stmt.all(projectId) as unknown as ChapterRow[];
  }

  /**
   * 一次性取项目内「每章最新一条质检报告」的综合分，供章节列表带出（避免 N+1）。
   * 旧报告在新报告产生时已标 superseded 且 created_at 更早，MAX(created_at) 选中的即当前有效报告。
   */
  latestQualityScoreByProject(projectId: string): Map<string, number> {
    const rows = this.db.prepare(`
      SELECT r.chapter_id AS cid, r.overall_score AS score
      FROM writing_quality_reports r
      WHERE r.project_id = ?
        AND r.created_at = (
          SELECT MAX(x.created_at) FROM writing_quality_reports x WHERE x.chapter_id = r.chapter_id
        )
    `).all(projectId) as Array<{ cid: string; score: number | null }>;
    const map = new Map<string, number>();
    for (const row of rows) {
      if (row.score != null && Number.isFinite(Number(row.score))) map.set(row.cid, Number(row.score));
    }
    return map;
  }

  /**
   * 按卷号 / 章序号获取章节。 */
  findByVolumeChapter(projectId: string, volumeIndex: number, chapterIndex: number): ChapterRow | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM chapters
      WHERE project_id = ? AND volume_index = ? AND chapter_index = ?
    `);
    return stmt.get(projectId, volumeIndex, chapterIndex) as unknown as ChapterRow | undefined;
  }

  /**
   * 获取某一卷内的所有章节（按章序号升序）。 */
  findByVolume(projectId: string, volumeIndex: number): ChapterRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM chapters
      WHERE project_id = ? AND volume_index = ?
      ORDER BY chapter_index ASC
    `);
    return stmt.all(projectId, volumeIndex) as unknown as ChapterRow[];
  }

  /**
   * 锁定章节
   */
  lockChapter(id: string): ChapterRow | undefined {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE chapters SET status = 'locked', locked_at = ?, updated_at = ? WHERE id = ? AND status = 'reviewing'
    `).run(now, now, id);
    const chapter = this.findById(id);
    if (chapter?.status === 'locked' && chapter.outline_id) {
      this.db.prepare(`UPDATE outlines SET status = 'locked', updated_at = ? WHERE id = ?`).run(now, chapter.outline_id);
    }
    return chapter;
  }

  /** Lock a draft directly after the service has completed required synchronization and gates. */
  lockChapterDirect(id: string): ChapterRow | undefined {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE chapters SET status = 'locked', locked_at = ?, updated_at = ? WHERE id = ? AND status = 'draft'
    `).run(now, now, id);
    const chapter = this.findById(id);
    if (chapter?.status === 'locked' && chapter.outline_id) {
      this.db.prepare(`UPDATE outlines SET status = 'locked', updated_at = ? WHERE id = ?`).run(now, chapter.outline_id);
    }
    return chapter;
  }

  /**
   * 解锁章节
   */
  unlockChapter(id: string): ChapterRow | undefined {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE chapters SET status = 'draft', locked_at = NULL, updated_at = ? WHERE id = ? AND status = 'locked'
    `).run(now, id);
    const chapter = this.findById(id);
    if (chapter?.status === 'draft' && chapter.outline_id) {
      this.db.prepare(`UPDATE outlines SET status = 'planned', updated_at = ? WHERE id = ?`).run(now, chapter.outline_id);
    }
    return chapter;
  }

  returnReviewToDraft(id: string): ChapterRow | undefined {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE chapters SET status = 'draft', updated_at = ? WHERE id = ? AND status = 'reviewing'
    `).run(now, id);
    return this.findById(id);
  }

  /**
   * 提交审核（draft → reviewing）。
   */
  submitForReview(id: string): ChapterRow | undefined {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE chapters SET status = 'reviewing', updated_at = ? WHERE id = ? AND status = 'draft'
    `).run(now, id);
    return this.findById(id);
  }

  /**
   * 更新章节内容
   */
  updateContent(id: string, content: string, wordCount: number): ChapterRow | undefined {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE chapters SET content = ?, word_count = ?, updated_at = ? WHERE id = ?
    `).run(content, wordCount, now, id);
    return this.findById(id);
  }

  /**
   * 获取上一章（用于章节衔接）；若当前为本卷第一章，则回退到上一卷末章。
   */
  getPrevChapter(projectId: string, volumeIndex: number, chapterIndex: number): ChapterRow | undefined {
    if (chapterIndex <= 1) {
      // 当前为本卷第一章：回退查找上一卷的末章
      if (volumeIndex > 1) {
        const stmt = this.db.prepare(`
          SELECT * FROM chapters
          WHERE project_id = ? AND volume_index = ?
          ORDER BY chapter_index DESC LIMIT 1
        `);
        return stmt.get(projectId, volumeIndex - 1) as unknown as ChapterRow | undefined;
      }
      return undefined;
    }

    const stmt = this.db.prepare(`
      SELECT * FROM chapters
      WHERE project_id = ? AND volume_index = ? AND chapter_index = ?
    `);
    return stmt.get(projectId, volumeIndex, chapterIndex - 1) as unknown as ChapterRow | undefined;
  }

  /**
   * 统计各状态的章节数
   */
  getStatusStats(projectId: string): Record<string, number> {
    const rows = this.db.prepare(`
      SELECT status, COUNT(*) as count FROM chapters
      WHERE project_id = ? GROUP BY status
    `).all(projectId) as { status: string; count: number }[];
    return rows.reduce((acc, r) => ({ ...acc, [r.status]: r.count }), {});
  }

  /**
   * 计算总字数
   */
  totalWordCount(projectId: string): number {
    const result = this.db.prepare(`
      SELECT COALESCE(SUM(word_count), 0) as total FROM chapters
      WHERE project_id = ?
    `).get(projectId) as { total: number };
    return result.total;
  }

  /**
   * 回写章节自动质检状态（running/ok/failed），让前端与看板能看到质检是否真正跑成。
   */
  markAutoQuality(id: string, status: 'running' | 'ok' | 'failed', message: string | null): ChapterRow | undefined {
    const now = new Date().toISOString();
    this.db.prepare(
      'UPDATE chapters SET auto_quality_status = ?, auto_quality_message = ?, auto_quality_at = ?, updated_at = ? WHERE id = ?',
    ).run(status, message, now, now, id);
    return this.findById(id);
  }
}
