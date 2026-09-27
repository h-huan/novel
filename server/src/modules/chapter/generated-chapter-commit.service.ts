import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { GeneratedCanonGuardService } from '../generation-metrics/generated-canon-guard.service';
import { ChapterService, type ChapterResponse } from './chapter.service';

/**
 * 唯一的 AI 正文落 Canon 边界。
 *
 * 客户端不能声明“这是 AI 生成”来获得特殊写权限。这里只接受正文主链产出的完整文本：
 * 先定位同项目、同章节、同全文的 generation run，再把 Gate PASS / current / output 一致性
 * 统一交给 GeneratedCanonGuardService 验证。真正写库仍复用 ChapterService，避免第二套持久化/同步实现。
 */
@Injectable()
export class GeneratedChapterCommitService {
  constructor(
    private readonly database: DatabaseService,
    private readonly generatedCanonGuard: GeneratedCanonGuardService,
    private readonly chapters: ChapterService,
  ) {}

  async commit(projectId: string, chapterId: string, content: string): Promise<ChapterResponse> {
    // Provenance is byte-for-byte: never normalize the submitted body before
    // matching the final PASS run. trim() is used only to reject blank content.
    // Otherwise a harmless leading/trailing newline can turn a valid gated body
    // into an unmatchable payload, producing "Gate passed but save failed".
    const canonicalContent = String(content ?? '');
    if (!canonicalContent.trim()) throw new BadRequestException('AI 正文为空，禁止写入 Canon');

    const db = this.database.getDb();
    const chapter = db.prepare(`
      SELECT id, project_id, chapter_index, status
      FROM chapters
      WHERE id=? AND project_id=?
    `).get(chapterId, projectId) as {
      id: string;
      project_id: string;
      chapter_index: number;
      status: string;
    } | undefined;

    if (!chapter) throw new NotFoundException(`Chapter ${chapterId} not found in project ${projectId}`);
    if (chapter.status === 'locked') throw new BadRequestException('Cannot replace a locked chapter');

    // 这里只负责定位“哪次运行声称产出了这份完整正文”。是否真正可落 Canon 的所有判据
    // （success / Gate PASS / current / exact output）只在 GeneratedCanonGuardService 维护一份。
    const run = db.prepare(`
      SELECT id
      FROM generation_runs
      WHERE project_id=?
        AND chapter_index=?
        AND stage='chapter'
        AND output_text=?
      ORDER BY started_at DESC
      LIMIT 1
    `).get(projectId, chapter.chapter_index, canonicalContent) as { id: string } | undefined;

    if (!run) {
      throw new BadRequestException(
        '该 AI 正文没有匹配的最终生成记录，禁止绕过主链写入 Canon',
      );
    }

    this.generatedCanonGuard.assertCanCommit({
      projectId,
      runId: run.id,
      outputText: canonicalContent,
      expectedStages: ['chapter'],
    });

    // ChapterService 是唯一章节持久化实现：版本快照、原创检测、派生同步均从这里执行。
    // 不把 runId/content 来源重新暴露给通用 PUT，避免形成第二条 AI 写路径。
    return this.chapters.update(chapterId, { content: canonicalContent });
  }
}
