import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { GenerationMetricsService } from '../generation-metrics/generation-metrics.service';
import { ChapterService, type ChapterResponse } from './chapter.service';

/**
 * 唯一的 AI 正文落 Canon 边界。
 *
 * 客户端不能声明“这是 AI 生成”来获得特殊写权限。这里只接受已经由正文主链完成最终 Gate 的
 * 完整文本，并用 generation_runs 反查同项目、同章节、同全文的 passed 记录；随后再次确认该 run
 * 的创作宪法和上下文仍为当前版本。真正写库仍复用 ChapterService，避免第二套持久化/同步实现。
 */
@Injectable()
export class GeneratedChapterCommitService {
  constructor(
    private readonly database: DatabaseService,
    private readonly metrics: GenerationMetricsService,
    private readonly chapters: ChapterService,
  ) {}

  async commit(projectId: string, chapterId: string, content: string): Promise<ChapterResponse> {
    const canonicalContent = String(content || '').trim();
    if (!canonicalContent) throw new BadRequestException('AI 正文为空，禁止写入 Canon');

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

    const run = db.prepare(`
      SELECT id
      FROM generation_runs
      WHERE project_id=?
        AND chapter_index=?
        AND stage='chapter'
        AND status='success'
        AND gate_status='passed'
        AND output_text=?
      ORDER BY started_at DESC
      LIMIT 1
    `).get(projectId, chapter.chapter_index, canonicalContent) as { id: string } | undefined;

    if (!run) {
      throw new BadRequestException(
        '该 AI 正文没有匹配的最终 Gate PASS 生成记录，禁止绕过主链写入 Canon',
      );
    }

    if (!this.metrics.runIsCurrent(run.id, projectId)) {
      throw new ConflictException(
        '该 AI 正文生成后，项目创作宪法或依赖上下文已经变化；旧结果禁止写入 Canon，请按当前上下文重新生成',
      );
    }

    // ChapterService 是唯一章节持久化实现：版本快照、原创检测、派生同步均从这里执行。
    // 不把 runId/content 来源重新暴露给通用 PUT，避免形成第二条 AI 写路径。
    return this.chapters.update(chapterId, { content: canonicalContent });
  }
}
