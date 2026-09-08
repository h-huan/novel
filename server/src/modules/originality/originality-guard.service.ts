/**
 * OriginalityGuardService — 原创性后置检测（横切）
 *
 * 前置：各创作场景已通过 standardDirectiveCache 注入"原创性（横切）标准"，从生成源头要求原创。
 * 后置：正文每次经唯一持久化收口 ChapterService.update 落库后，用知名作品库做标题/内容/角色撞名相似检测，
 *       high/medium 命中写入统一 QualityIssue，在矛盾面板可见、可处理。
 *
 * 解耦：CopyrightCheckService 构造无参、仅依赖纯数据 KNOWN_WORKS，这里直接实例化，
 *       避免 OriginalityModule → RefinementModule → ChainModule 的模块循环依赖。
 */
import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { CopyrightCheckService } from '../refinement/copyright-check.service';
import type { CopyrightMatch } from '../refinement/dto/refinement.dto';
import { replaceQualityIssues } from '../writing-quality/quality-issue';

@Injectable()
export class OriginalityGuardService {
  private readonly logger = new Logger(OriginalityGuardService.name);
  private readonly copyright = new CopyrightCheckService();

  constructor(private readonly database: DatabaseService) {}

  /**
   * 章节正文落库后的原创检测，把风险写入矛盾表。返回检测结果（调用方可选用）。
   * 任何异常都吞掉并返回 null，绝不影响章节保存主流程。
   */
  checkChapter(params: {
    projectId: string;
    chapterIndex: number;
    title?: string | null;
    content: string;
    characterNames?: string[];
  }): { risk: string; matches: CopyrightMatch[] } | null {
    const { projectId, chapterIndex, title, content, characterNames } = params;
    try {
      if (!content || content.trim().length < 50) return null; // 过短内容无检测意义
      const result = this.copyright.checkFull(content, title || undefined, characterNames);
      const notable = result.matches.filter(m => m.risk === 'high' || m.risk === 'medium');
      const db = this.database.getDb();
      const chapter = db.prepare('SELECT id FROM chapters WHERE project_id=? AND chapter_index=? ORDER BY created_at DESC LIMIT 1')
        .get(projectId, chapterIndex) as { id: string } | undefined;
      replaceQualityIssues(db, {
        projectId,
        stage: 'chapter',
        source: 'originality_check',
        scopeKey: `chapter:${chapter?.id || chapterIndex}`,
        chapterId: chapter?.id ?? null,
        title: `第${chapterIndex}章原创性检查`,
        issues: notable.slice(0, 10).map(m => {
        const typeLabel = m.type === 'title' ? '标题撞名' : m.type === 'content' ? '内容相似' : '角色撞名';
        const message = `【原创性·后置检测·${typeLabel}】${m.suggestion || m.matchedItem}（相似度${m.similarity}%，来源：${m.source || '知名作品库'}）。原创要求：类型母题可用，但具体设定/人物/情节/表达必须差异化原创。`;
          return {
            ruleId: 'originality',
            severity: m.risk === 'high' ? 'blocking' : 'medium',
            message,
            quote: m.matchedItem,
            evidenceVerified: true,
            suggestion: m.suggestion,
            details: { chapterIndex, matchedItem: m.matchedItem, similarity: m.similarity, risk: m.risk, matchType: m.type, referenceSource: m.source },
          };
        }),
      });
      return { risk: result.risk, matches: notable };
    } catch (err) {
      this.logger.warn?.(`原创后置检测失败（不阻断保存）: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /** 标题生成后检测：只返回撞名命中，由标题接口透出提示，不写库、不阻断。 */
  checkTitle(title: string): CopyrightMatch[] {
    try {
      if (!title || !title.trim()) return [];
      return this.copyright.checkTitle(title).filter(m => m.risk === 'high' || m.risk === 'medium');
    } catch {
      return [];
    }
  }
}
