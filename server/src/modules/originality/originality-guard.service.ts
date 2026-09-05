/**
 * OriginalityGuardService — 原创性后置检测（横切）
 *
 * 前置：各创作场景已通过 standardDirectiveCache 注入"原创性（横切）标准"，从生成源头要求原创。
 * 后置：正文每次经唯一持久化收口 ChapterService.update 落库后，用知名作品库做标题/内容/角色撞名相似检测，
 *       high/medium 命中写入 consistency_checks（source=originality_check），在矛盾面板可见、可处理；检测永不阻断保存。
 *
 * 解耦：CopyrightCheckService 构造无参、仅依赖纯数据 KNOWN_WORKS，这里直接实例化，
 *       避免 OriginalityModule → RefinementModule → ChainModule 的模块循环依赖。
 */
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../../database/database.service';
import { CopyrightCheckService } from '../refinement/copyright-check.service';
import type { CopyrightMatch } from '../refinement/dto/refinement.dto';

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
      if (notable.length === 0) return { risk: result.risk, matches: [] };
      const db = this.database.getDb();
      const now = new Date().toISOString();
      const ins = db.prepare(
        `INSERT INTO consistency_checks
          (id, project_id, check_type, status, message, severity, detected_at, chapter_index, details, resolved, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,0,?)`,
      );
      // 同一章同一命中项去重：先清掉本章该项未解决的旧记录，避免重复保存叠加
      const dedup = db.prepare(
        `DELETE FROM consistency_checks WHERE project_id=? AND chapter_index=? AND check_type='originality' AND status IN ('warning','error')`,
      );
      dedup.run(projectId, chapterIndex);
      for (const m of notable.slice(0, 10)) {
        const status = m.risk === 'high' ? 'error' : 'warning';
        const severity = m.risk === 'high' ? 'high' : 'medium';
        const typeLabel = m.type === 'title' ? '标题撞名' : m.type === 'content' ? '内容相似' : '角色撞名';
        const message = `【原创性·后置检测·${typeLabel}】${m.suggestion || m.matchedItem}（相似度${m.similarity}%，来源：${m.source || '知名作品库'}）。原创要求：类型母题可用，但具体设定/人物/情节/表达必须差异化原创。`;
        ins.run(
          randomUUID(), projectId, 'originality', status, message, severity, now, chapterIndex,
          JSON.stringify({ source: 'originality_check', matchedItem: m.matchedItem, similarity: m.similarity, risk: m.risk, matchType: m.type, referenceSource: m.source }),
          now,
        );
      }
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
