/**
 * 绔犺妭 Repository
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
  tianlong_8steps: string | null;
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
   * 鎸夐」鐩甀D鏌ヨ
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
   * 鎸夊嵎/绔犲簭鍙疯幏鍙?   */
  findByVolumeChapter(projectId: string, volumeIndex: number, chapterIndex: number): ChapterRow | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM chapters
      WHERE project_id = ? AND volume_index = ? AND chapter_index = ?
    `);
    return stmt.get(projectId, volumeIndex, chapterIndex) as unknown as ChapterRow | undefined;
  }

  /**
   * 鑾峰彇鍗峰唴鎵€鏈夌珷鑺?   */
  findByVolume(projectId: string, volumeIndex: number): ChapterRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM chapters
      WHERE project_id = ? AND volume_index = ?
      ORDER BY chapter_index ASC
    `);
    return stmt.all(projectId, volumeIndex) as unknown as ChapterRow[];
  }

  /**
   * 閿佸畾绔犺妭
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
   * 瑙ｉ攣绔犺妭
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
   * 鎻愪氦瀹℃牳
   */
  submitForReview(id: string): ChapterRow | undefined {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE chapters SET status = 'reviewing', updated_at = ? WHERE id = ? AND status = 'draft'
    `).run(now, id);
    return this.findById(id);
  }

  /**
   * 鏇存柊绔犺妭鍐呭
   */
  updateContent(id: string, content: string, wordCount: number): ChapterRow | undefined {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE chapters SET content = ?, word_count = ?, updated_at = ? WHERE id = ?
    `).run(content, wordCount, now, id);
    return this.findById(id);
  }

  /**
   * 鑾峰彇涓婁竴绔犵殑涓婁笅鏂?(鐢ㄤ簬琛旀帴)
   */
  getPrevChapter(projectId: string, volumeIndex: number, chapterIndex: number): ChapterRow | undefined {
    if (chapterIndex <= 1) {
      // 妫€鏌ヤ笂涓€鍗?
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
   * 缁熻鍚勭姸鎬佺殑绔犺妭鏁?   */
  getStatusStats(projectId: string): Record<string, number> {
    const rows = this.db.prepare(`
      SELECT status, COUNT(*) as count FROM chapters
      WHERE project_id = ? GROUP BY status
    `).all(projectId) as { status: string; count: number }[];
    return rows.reduce((acc, r) => ({ ...acc, [r.status]: r.count }), {});
  }

  /**
   * 璁＄畻鎬诲瓧鏁?   */
  totalWordCount(projectId: string): number {
    const result = this.db.prepare(`
      SELECT COALESCE(SUM(word_count), 0) as total FROM chapters
      WHERE project_id = ?
    `).get(projectId) as { total: number };
    return result.total;
  }
}
