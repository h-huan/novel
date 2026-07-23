/**
 * WritingQualityService - Phase 6.2 稳定修复版
 *
 * 修复：
 * - buildProjectContext schema 兼容（world_settings/outlines/characters 实字段）
 * - listReports/getReport 补齐 issueCount/chapterLocked 等统计
 * - LLM JSON 解析失败时 payload 记录 parseWarning
 * - applyRevision 返回 needsStateReview
 */
import { Injectable, Logger, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { DatabaseService } from '../../database/database.service';
import { RealLLMService } from '../../chain/real-llm.service';
import { WRITING_QUALITY_TAGS } from '../../state/writing-quality-tags';
import { ChapterService } from '../chapter/chapter.service';
import type {
  AnalyzeChapterDto,
  AttentionCheckDto,
  ListReportsDto,
  RefineIssueDto,
  LLMQualityOutput,
  LLMRefineOutput,
  RecheckResult,
} from './dto/writing-quality.dto';

interface ReportRow {
  id: string;
  project_id: string;
  chapter_id: string;
  source_type: string;
  source_id: string;
  scope: string;
  title: string;
  summary: string;
  overall_level: string;
  overall_score: number;
  status: string;
  model: string;
  payload: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  attention_json?: string;
  view_state_json?: string;
}

interface IssueRow {
  id: string;
  report_id: string;
  project_id: string;
  chapter_id: string;
  issue_type: string;
  severity: string;
  title: string;
  summary: string;
  evidence: string;
  suggestion: string;
  paragraph_index: number;
  sentence_index: number;
  start_offset: number;
  end_offset: number;
  original_text: string;
  suggested_text: string;
  tags: string;
  status: string;
  payload: string;
  created_at: string;
  updated_at: string;
  resolved_at: string;
  resolved_by: string;
  latest_revision_id?: string;
  recheck_result_json?: string;
  navigation_json?: string;
  status_history_json?: string;
}

interface RevisionRow {
  id: string;
  project_id: string;
  chapter_id: string;
  issue_id: string;
  report_id: string;
  revision_type: string;
  before_text: string;
  after_text: string;
  diff_json: string;
  applied: number;
  applied_at: string;
  reverted: number;
  reverted_at: string;
  payload: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  recheck_result_json?: string;
  can_apply?: number;
}

interface IssueCounts {
  total: number;
  open: number;
  high: number;
  resolved: number;
}

@Injectable()
export class WritingQualityService {
  private readonly logger = new Logger(WritingQualityService.name);

  constructor(
    private readonly dbService: DatabaseService,
    @Optional() private readonly chapterService?: ChapterService,
    @Optional() private readonly realLLM?: RealLLMService,
  ) {}

  // ====================== 1. ANALYZE CHAPTER QUALITY ======================

  /**
   * The author-facing "submit quality review" action: create a real quality
   * report first, then let the chapter state machine run its consistency sync
   * and transition to reviewing. Neither failure may advance the state.
   */
  async submitChapterForQualityReview(projectId: string, dto: AnalyzeChapterDto) {
    if (!this.chapterService) throw new BadRequestException('Chapter service is not available');
    const report = await this.analyzeChapterQuality(projectId, { ...dto, scope: dto.scope || 'chapter' });
    const chapter = await this.chapterService.submitForReview(dto.chapterId);
    return { success: true, report, chapter };
  }

  async analyzeChapterQuality(projectId: string, dto: AnalyzeChapterDto) {
    const db = this.dbService.getDb();
    const chapterId = dto.chapterId;

    let content = dto.content;
    let chapterTitle = '';
    let chapterStatus = '';
    if (!content) {
      const chapterRow = db.prepare(
        'SELECT title, content, status FROM chapters WHERE id = ? AND project_id = ?',
      ).get(chapterId, projectId) as { title: string; content: string; status: string } | undefined;
      if (!chapterRow) throw new NotFoundException(`Chapter ${chapterId} not found`);
      content = chapterRow.content;
      chapterTitle = chapterRow.title;
      chapterStatus = chapterRow.status;
    } else {
      const chapterRow = db.prepare(
        'SELECT title, status FROM chapters WHERE id = ? AND project_id = ?',
      ).get(chapterId, projectId) as { title: string; status: string } | undefined;
      if (chapterRow) {
        chapterTitle = chapterRow.title;
        chapterStatus = chapterRow.status;
      }
    }

    if (!content || !content.trim()) {
      throw new BadRequestException('Chapter content is empty, cannot analyze');
    }

    const context = this.buildProjectContext(projectId, db);

    if (!this.realLLM) {
      throw new BadRequestException('LLM service is not available. Please configure an API key.');
    }

    // LLM 调用（失败时直接抛错，不写空报告）
    let llmResult: LLMQualityOutput;
    let parseWarning: string | null = null;
    let rawContentPreview: string | null = null;
    try {
      const response = await this.callQualityLLM(content, chapterTitle, context, dto);
      llmResult = response.result;
      parseWarning = response.parseWarning;
      rawContentPreview = response.rawPreview;
    } catch (err) {
      this.logger.error(`LLM quality analysis failed: ${err instanceof Error ? err.message : String(err)}`);
      throw new BadRequestException(`Quality analysis failed: ${err instanceof Error ? err.message : 'LLM call error'}`);
    }

    const now = new Date().toISOString();
    const reportId = uuid();
    const attention = this.buildAttentionAnalysis({
      title: chapterTitle,
      intro: context?.project?.description || '',
      content,
      mode: this.inferAttentionMode(context?.project),
    });

    const reportPayload: Record<string, any> = { attention };
    if (parseWarning) {
      reportPayload.parseWarning = true;
      reportPayload.rawContentPreview = rawContentPreview;
      reportPayload.reason = parseWarning;
    }

    const summary = parseWarning
      ? `质量诊断解析失败：${parseWarning}。请重试。`
      : llmResult.summary;
    const overallLevel = llmResult.overallLevel || 'medium';
    const overallScore = llmResult.overallScore ?? null;

    db.prepare(`
      INSERT INTO writing_quality_reports (
        id, project_id, chapter_id, source_type, source_id, scope, title, summary,
        overall_level, overall_score, model, payload, attention_json, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      reportId, projectId, chapterId, 'manual_check', null,
      dto.scope || 'chapter', `Chapter Quality: ${chapterTitle}`,
      summary, overallLevel, overallScore, 'llm',
      JSON.stringify(reportPayload), JSON.stringify(attention), 'system', now, now,
    );

    const issues: IssueRow[] = [];
    const validTags = new Set(WRITING_QUALITY_TAGS as readonly string[]);
    for (const issue of llmResult.issues || []) {
      const issueType = validTags.has(issue.issueType) ? issue.issueType : 'needs_hook';
      const tags = (issue.tags || []).filter(t => validTags.has(t));
      if (!tags.includes(issueType)) tags.unshift(issueType);

      const issueId = uuid();
      db.prepare(`
        INSERT INTO writing_quality_issues (
          id, report_id, project_id, chapter_id, issue_type, severity, title, summary,
          evidence, suggestion, paragraph_index, sentence_index, start_offset, end_offset,
          original_text, suggested_text, tags, status, payload, navigation_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        issueId, reportId, projectId, chapterId, issueType,
        issue.severity || 'medium', issue.title, issue.summary,
        issue.evidence || '', issue.suggestion || '',
        issue.paragraphIndex ?? null, issue.sentenceIndex ?? null,
        issue.startOffset ?? null, issue.endOffset ?? null,
        issue.originalText || '', issue.suggestedText || '',
        JSON.stringify(tags), 'open', '{}',
        JSON.stringify(this.buildIssueNavigation({
          projectId,
          chapterId,
          reportId,
          issueId,
          issueType,
          tags,
          evidence: issue.evidence || '',
          paragraphIndex: issue.paragraphIndex ?? null,
          sentenceIndex: issue.sentenceIndex ?? null,
        })),
        now, now,
      );

      issues.push({
        id: issueId, report_id: reportId, project_id: projectId,
        chapter_id: chapterId, issue_type: issueType,
        severity: issue.severity || 'medium', title: issue.title,
        summary: issue.summary, evidence: issue.evidence || '',
        suggestion: issue.suggestion || '',
        paragraph_index: issue.paragraphIndex ?? null as any,
        sentence_index: issue.sentenceIndex ?? null as any,
        start_offset: issue.startOffset ?? null as any,
        end_offset: issue.endOffset ?? null as any,
        original_text: issue.originalText || '',
        suggested_text: issue.suggestedText || '',
        tags: JSON.stringify(tags), status: 'open', payload: '{}',
        navigation_json: JSON.stringify(this.buildIssueNavigation({
          projectId,
          chapterId,
          reportId,
          issueId,
          issueType,
          tags,
          evidence: issue.evidence || '',
          paragraphIndex: issue.paragraphIndex ?? null,
          sentenceIndex: issue.sentenceIndex ?? null,
        })),
        created_at: now, updated_at: now,
        resolved_at: null as any, resolved_by: null as any,
      });
    }

    const counts = this.calcIssueCounts(issues);

    return {
      success: true,
      report: {
        id: reportId, projectId, chapterId,
        title: `Chapter Quality: ${chapterTitle}`,
        summary, overallLevel, overallScore,
        status: 'open',
        issueCount: counts.total,
        openIssueCount: counts.open,
        highIssueCount: counts.high,
        resolvedIssueCount: counts.resolved,
        chapterLocked: chapterStatus === 'locked',
        createdAt: now,
      },
      issues: issues.map(i => this.issueRowToResponse(i)),
    };
  }

  checkAttention(projectId: string, dto: AttentionCheckDto) {
    const db = this.dbService.getDb();
    let title = dto.title || '';
    let intro = dto.intro || '';
    let content = dto.content || '';
    let chapterStatus = '';

    if (dto.chapterId) {
      const chapter = db.prepare(
        'SELECT title, content, status FROM chapters WHERE id = ? AND project_id = ?',
      ).get(dto.chapterId, projectId) as { title: string; content: string; status: string } | undefined;
      if (!chapter) throw new NotFoundException(`Chapter ${dto.chapterId} not found`);
      title = title || chapter.title;
      content = content || chapter.content || '';
      chapterStatus = chapter.status || '';
    }

    const project = db.prepare(
      'SELECT title, description, type, target_words, platform_style FROM projects WHERE id = ?',
    ).get(projectId) as Record<string, any> | undefined;

    const result = this.buildAttentionAnalysis({
      title: title || project?.title || '',
      intro: intro || project?.description || '',
      content,
      mode: dto.mode === 'auto' || !dto.mode ? this.inferAttentionMode({ project }) : dto.mode,
    });

    const report = dto.persist && dto.chapterId
      ? this.persistAttentionReport(db, projectId, dto, {
          title: title || project?.title || '',
          chapterId: dto.chapterId,
          attention: result,
          chapterLocked: chapterStatus === 'locked',
        })
      : null;

    return { success: true, attention: result, report };
  }

  // ====================== 2. LIST REPORTS ======================

  listReports(projectId: string, query: ListReportsDto) {
    const db = this.dbService.getDb();
    const clauses = ['project_id = ?'];
    const params: any[] = [projectId];

    if (query.chapterId) {
      clauses.push('chapter_id = ?');
      params.push(query.chapterId);
    }
    if (query.status) {
      clauses.push('status = ?');
      params.push(query.status);
    }

    const limit = Math.min(Math.max(Number(query.limit || 50) || 50, 1), 200);
    const sql = `SELECT * FROM writing_quality_reports WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    const rows = db.prepare(sql).all(...params) as unknown as ReportRow[];

    // 批量查询每个 report 的 issue 统计
    const reportIds = rows.map(r => r.id);
    const issueCountMap = new Map<string, IssueCounts>();
    const chapterLockedMap = new Map<string, boolean>();

    if (reportIds.length > 0) {
      // 批量获取 issue 统计
      for (const rid of reportIds) {
        issueCountMap.set(rid, { total: 0, open: 0, high: 0, resolved: 0 });
      }
      try {
        const issueStatsStmt = db.prepare(`
          SELECT report_id, status, severity, COUNT(*) as cnt
          FROM writing_quality_issues
          WHERE report_id IN (${reportIds.map(() => '?').join(',')})
          GROUP BY report_id, status, severity
        `);
        const issueStats = issueStatsStmt.all(...reportIds) as Array<{ report_id: string; status: string; severity: string; cnt: number }>;
        for (const stat of issueStats) {
          const entry = issueCountMap.get(stat.report_id);
          if (!entry) continue;
          entry.total += stat.cnt;
          if (this.isOpenIssueStatus(stat.status)) {
            entry.open += stat.cnt;
            if (stat.severity === 'high' || stat.severity === 'critical') {
              entry.high += stat.cnt;
            }
          }
          if (this.isClosedIssueStatus(stat.status)) entry.resolved += stat.cnt;
        }
      } catch (err) {
        this.logger.warn(`Failed to load issue stats for reports: ${err instanceof Error ? err.message : String(err)}`);
      }

      // 批量获取 locked 状态
      const uniqueChapterIds = [...new Set(rows.map(r => r.chapter_id).filter(Boolean))];
      if (uniqueChapterIds.length > 0) {
        try {
          const chapterStmt = db.prepare(`
            SELECT id, status FROM chapters
            WHERE id IN (${uniqueChapterIds.map(() => '?').join(',')})
          `);
          const chapterRows = chapterStmt.all(...uniqueChapterIds) as Array<{ id: string; status: string }>;
          for (const cr of chapterRows) {
            chapterLockedMap.set(cr.id, cr.status === 'locked');
          }
        } catch (err) {
          this.logger.warn(`Failed to load chapter status for reports: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    return rows.map(r => {
      const counts = issueCountMap.get(r.id) || { total: 0, open: 0, high: 0, resolved: 0 };
      return {
        ...this.reportRowToResponse(r),
        issueCount: counts.total,
        openIssueCount: counts.open,
        highIssueCount: counts.high,
        resolvedIssueCount: counts.resolved,
        chapterLocked: r.chapter_id ? (chapterLockedMap.get(r.chapter_id) || false) : false,
      };
    });
  }

  // ====================== 3. GET REPORT ======================

  getReport(reportId: string) {
    const db = this.dbService.getDb();
    const report = db.prepare('SELECT * FROM writing_quality_reports WHERE id = ?').get(reportId) as ReportRow | undefined;
    if (!report) throw new NotFoundException(`Report ${reportId} not found`);

    const issueRows = db.prepare(
      'SELECT * FROM writing_quality_issues WHERE report_id = ? ORDER BY severity DESC, created_at ASC',
    ).all(reportId) as unknown as IssueRow[];
    const revisionRows = db.prepare(
      'SELECT * FROM writing_revision_records WHERE report_id = ? ORDER BY created_at ASC',
    ).all(reportId) as unknown as RevisionRow[];
    const revisionsByIssue = new Map<string, RevisionRow[]>();
    for (const revision of revisionRows) {
      if (!revision.issue_id) continue;
      const list = revisionsByIssue.get(revision.issue_id) || [];
      list.push(revision);
      revisionsByIssue.set(revision.issue_id, list);
    }

    const counts = this.calcIssueCounts(issueRows);
    let chapterLocked = false;
    if (report.chapter_id) {
      try {
        const cr = db.prepare('SELECT status FROM chapters WHERE id = ?').get(report.chapter_id) as { status: string } | undefined;
        chapterLocked = cr?.status === 'locked';
      } catch { /* ignore */ }
    }

    return {
      report: {
        ...this.reportRowToResponse(report),
        issueCount: counts.total,
        openIssueCount: counts.open,
        highIssueCount: counts.high,
        resolvedIssueCount: counts.resolved,
        chapterLocked,
      },
      issues: issueRows.map(i => {
        const revisions = revisionsByIssue.get(i.id) || [];
        const latest = revisions.length > 0 ? revisions[revisions.length - 1] : null;
        return {
          ...this.issueRowToResponse(i),
          revisions: revisions.map(r => this.revisionRowToResponse(r)),
          latestRevision: latest ? this.revisionRowToResponse(latest) : null,
          recheckResult: safeJsonParse(i.recheck_result_json || '{}'),
        };
      }),
      revisions: revisionRows.map(r => this.revisionRowToResponse(r)),
    };
  }

  // ====================== 4. MARK ISSUE RESOLVED ======================

  markIssueResolved(issueId: string, resolvedBy: string = 'author') {
    const db = this.dbService.getDb();
    const issue = db.prepare('SELECT * FROM writing_quality_issues WHERE id = ?').get(issueId) as IssueRow | undefined;
    if (!issue) throw new NotFoundException(`Issue ${issueId} not found`);

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE writing_quality_issues
      SET status = 'resolved', resolved_at = ?, resolved_by = ?, updated_at = ?
      WHERE id = ?
    `).run(now, resolvedBy, now, issueId);

    return { success: true, issue: { id: issueId, status: 'resolved', resolvedAt: now, resolvedBy } };
  }

  updateIssueStatus(projectId: string, issueId: string, status: string, reason?: string) {
    const db = this.dbService.getDb();
    const issue = db.prepare(
      'SELECT * FROM writing_quality_issues WHERE id = ? AND project_id = ?',
    ).get(issueId, projectId) as IssueRow | undefined;
    if (!issue) throw new NotFoundException(`Issue ${issueId} not found`);

    const allowed = new Set([
      'open', 'planned', 'refined', 'applied', 'recheck_passed',
      'recheck_failed', 'ignored', 'archived', 'resolved',
    ]);
    if (!allowed.has(status)) {
      throw new BadRequestException(`Unsupported issue status: ${status}`);
    }

    const now = new Date().toISOString();
    const history = safeJsonParse(issue.status_history_json || '[]', []);
    history.push({ from: issue.status, to: status, reason: reason || '', at: now });

    const resolvedAt = this.isClosedIssueStatus(status) ? now : null;
    db.prepare(`
      UPDATE writing_quality_issues
      SET status = ?, status_history_json = ?, resolved_at = COALESCE(?, resolved_at), updated_at = ?
      WHERE id = ?
    `).run(status, JSON.stringify(history), resolvedAt, now, issueId);

    return { success: true, issue: { id: issueId, status, updatedAt: now } };
  }

  // ====================== 5. REFINE ISSUE ======================

  async refineIssue(projectId: string, issueId: string, dto: RefineIssueDto) {
    const db = this.dbService.getDb();
    const issue = db.prepare(
      'SELECT * FROM writing_quality_issues WHERE id = ? AND project_id = ?',
    ).get(issueId, projectId) as IssueRow | undefined;
    if (!issue) throw new NotFoundException(`Issue ${issueId} not found`);

    const chapterRow = db.prepare(
      'SELECT id, title, content, status FROM chapters WHERE id = ?',
    ).get(issue.chapter_id) as { id: string; title: string; content: string; status: string } | undefined;
    if (!chapterRow) throw new NotFoundException(`Chapter ${issue.chapter_id} not found`);

    const isLocked = chapterRow.status === 'locked';
    const mode = dto.mode || 'suggest_only';
    const contextText = this.getChapterContext(chapterRow.content, issue);

    if (!this.realLLM) {
      throw new BadRequestException('LLM service is not available');
    }

    const refineResult = await this.callRefineLLM(issue, chapterRow.content, contextText, dto.instruction);

    const now = new Date().toISOString();
    const revisionId = uuid();
    db.prepare(`
      INSERT INTO writing_revision_records (
        id, project_id, chapter_id, issue_id, report_id, revision_type,
        before_text, after_text, diff_json, applied, payload, can_apply, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      revisionId, projectId, issue.chapter_id, issueId, issue.report_id,
      'local_refine', refineResult.beforeText, refineResult.afterText,
      JSON.stringify(refineResult.diff), 0,
      JSON.stringify({ reason: refineResult.reason, remainingRisk: refineResult.remainingRisk, locked: isLocked }),
      mode !== 'suggest_only' && !isLocked ? 1 : 0,
      'system', now, now,
    );
    const history = safeJsonParse(issue.status_history_json || '[]', []);
    history.push({ from: issue.status, to: 'refined', reason: 'generate_patch', at: now });
    db.prepare(`
      UPDATE writing_quality_issues
      SET status = 'refined', latest_revision_id = ?, status_history_json = ?, updated_at = ?
      WHERE id = ?
    `).run(revisionId, JSON.stringify(history), now, issueId);

    return {
      success: true,
      revision: {
        id: revisionId, issueId, projectId, chapterId: issue.chapter_id,
        beforeText: refineResult.beforeText, afterText: refineResult.afterText,
        reason: refineResult.reason, diff: refineResult.diff,
        remainingRisk: refineResult.remainingRisk,
        canApply: mode !== 'suggest_only' && !isLocked,
        locked: isLocked, applied: false,
      },
      canApply: mode !== 'suggest_only' && !isLocked,
      locked: isLocked,
    };
  }

  // ====================== 6. APPLY REVISION ======================

  applyRevision(projectId: string, revisionId: string) {
    const db = this.dbService.getDb();
    const revision = db.prepare(
      'SELECT * FROM writing_revision_records WHERE id = ? AND project_id = ?',
    ).get(revisionId, projectId) as RevisionRow | undefined;
    if (!revision) throw new NotFoundException(`Revision ${revisionId} not found`);

    if (revision.applied === 1) {
      throw new BadRequestException('Revision already applied');
    }

    const chapterRow = db.prepare(
      'SELECT id, content, word_count, status FROM chapters WHERE id = ?',
    ).get(revision.chapter_id) as { id: string; content: string; word_count: number; status: string } | undefined;
    if (!chapterRow) throw new NotFoundException(`Chapter ${revision.chapter_id} not found`);

    if (chapterRow.status === 'locked') {
      throw new BadRequestException('Cannot apply revision to locked chapter');
    }

    const beforeText = revision.before_text;
    const afterText = revision.after_text;
    const currentContent = chapterRow.content;

    if (!currentContent.includes(beforeText)) {
      throw new BadRequestException(
        'Cannot apply revision: original text not found in chapter. The chapter may have been modified since the revision was created.',
      );
    }

    const newContent = currentContent.replace(beforeText, afterText);
    const chineseChars = (newContent.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g) || []).length;
    const englishWords = newContent.replace(/[^\x00-\xff]/g, '').split(/\s+/).filter(w => w.length > 0).length;
    const newWordCount = chineseChars + englishWords;
    const now = new Date().toISOString();

    // Writing quality revisions are local prose fixes. They must not enter the
    // state extraction pipeline, otherwise quality issues can create state_items.
    db.prepare('UPDATE chapters SET content = ?, word_count = ?, updated_at = ? WHERE id = ?')
      .run(newContent, newWordCount, now, revision.chapter_id);

    // 更新 revision 记录
    db.prepare(`
      UPDATE writing_revision_records
      SET applied = 1, applied_at = ?, updated_at = ?
      WHERE id = ?
    `).run(now, now, revisionId);

    if (revision.issue_id) {
      const issue = db.prepare('SELECT * FROM writing_quality_issues WHERE id = ?').get(revision.issue_id) as IssueRow | undefined;
      const history = issue ? safeJsonParse(issue.status_history_json || '[]', []) : [];
      if (issue) history.push({ from: issue.status, to: 'applied', reason: 'revision_applied', at: now });
      db.prepare(`
        UPDATE writing_quality_issues
        SET status = 'applied', latest_revision_id = ?, status_history_json = ?, resolved_at = ?, resolved_by = 'system', updated_at = ?
        WHERE id = ?
      `).run(revisionId, JSON.stringify(history), now, now, revision.issue_id);
    }

    return {
      success: true,
      revision: { id: revisionId, applied: true, appliedAt: now },
      chapter: { id: revision.chapter_id, wordCount: newWordCount },
      needsRecheck: true,
      needsStateReview: false,
      stateSyncWarning: null,
    };
  }

  // ====================== 7. RECHECK AFTER REVISION ======================

  async recheckAfterRevision(projectId: string, revisionId: string): Promise<{ success: boolean; result: RecheckResult }> {
    const db = this.dbService.getDb();
    const revision = db.prepare(
      'SELECT * FROM writing_revision_records WHERE id = ? AND project_id = ?',
    ).get(revisionId, projectId) as RevisionRow | undefined;
    if (!revision) throw new NotFoundException(`Revision ${revisionId} not found`);

    const issue = revision.issue_id
      ? db.prepare('SELECT * FROM writing_quality_issues WHERE id = ?').get(revision.issue_id) as IssueRow | undefined
      : null;

    const remainingCount = issue
      ? (db.prepare(
          'SELECT COUNT(*) as cnt FROM writing_quality_issues WHERE chapter_id = ? AND status = ?',
        ).get(issue.chapter_id, 'open') as { cnt: number }).cnt
      : 0;

    let result: RecheckResult;
    if (this.realLLM && issue) {
      try {
        const chapterRow = db.prepare(
          'SELECT content FROM chapters WHERE id = ?',
        ).get(revision.chapter_id) as { content: string } | undefined;
        const content = chapterRow?.content || '';
        result = await this.callRecheckLLM(issue, revision.after_text, content);
      } catch (err) {
        this.logger.warn(`LLM recheck failed, fallback: ${err instanceof Error ? err.message : String(err)}`);
        result = this.simpleRecheck(remainingCount);
      }
    } else {
      result = this.simpleRecheck(remainingCount);
    }

    this.persistRecheckResult(db, revision, issue || null, result);
    return { success: true, result };
  }

  async recheckIssue(projectId: string, issueId: string): Promise<{ success: boolean; result: RecheckResult; revisionId: string | null }> {
    const db = this.dbService.getDb();
    const issue = db.prepare(
      'SELECT * FROM writing_quality_issues WHERE id = ? AND project_id = ?',
    ).get(issueId, projectId) as IssueRow | undefined;
    if (!issue) throw new NotFoundException(`Issue ${issueId} not found`);

    const revision = issue.latest_revision_id
      ? db.prepare('SELECT * FROM writing_revision_records WHERE id = ? AND project_id = ?').get(issue.latest_revision_id, projectId) as RevisionRow | undefined
      : db.prepare('SELECT * FROM writing_revision_records WHERE issue_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 1').get(issueId, projectId) as RevisionRow | undefined;

    if (revision) {
      return this.recheckAfterRevision(projectId, revision.id).then(res => ({
        ...res,
        revisionId: revision.id,
      }));
    }

    const openCount = (db.prepare(
      'SELECT COUNT(*) as cnt FROM writing_quality_issues WHERE chapter_id = ? AND status IN (?, ?, ?, ?)',
    ).get(issue.chapter_id, 'open', 'planned', 'refined', 'recheck_failed') as { cnt: number }).cnt;
    const result = this.simpleRecheck(openCount);
    const now = new Date().toISOString();
    const nextStatus = result.pass ? 'recheck_passed' : 'recheck_failed';
    const history = safeJsonParse(issue.status_history_json || '[]', []);
    history.push({ from: issue.status, to: nextStatus, reason: 'issue_recheck', at: now });
    db.prepare(`
      UPDATE writing_quality_issues
      SET status = ?, recheck_result_json = ?, status_history_json = ?, updated_at = ?
      WHERE id = ?
    `).run(nextStatus, JSON.stringify(result), JSON.stringify(history), now, issueId);
    return { success: true, result, revisionId: null };
  }

  // ====================== HELPER: Project Context ======================

  private buildProjectContext(projectId: string, db: any): Record<string, any> {
    const context: Record<string, any> = {
      project: null,
      outlines: [],
      characters: [],
      worldSettings: [],
      stateItems: [],
    };

    // 项目信息（兼容实际 schema）
    try {
      const project = db.prepare(
        'SELECT title, description, platform_style, type, target_words FROM projects WHERE id = ?',
      ).get(projectId);
      if (project) context.project = project;
    } catch (err) {
      this.logger.warn(`buildProjectContext: failed to query projects - ${err instanceof Error ? err.message : String(err)}`);
    }

    // 大纲（兼容实际 schema：outlines 表有 title/content/level/chapter_function 等）
    try {
      const outlines = db.prepare(
        'SELECT title, content, level, chapter_function, status FROM outlines WHERE project_id = ? ORDER BY "order"',
      ).all(projectId);
      context.outlines = outlines || [];
    } catch (err) {
      this.logger.warn(`buildProjectContext: failed to query outlines - ${err instanceof Error ? err.message : String(err)}`);
    }

    // 角色（兼容实际 schema：characters 表有 name/identity/personality 等，没有 role_type）
    try {
      const characters = db.prepare(
        'SELECT name, identity, personality, dialogue_style, is_pov_character FROM characters WHERE project_id = ?',
      ).all(projectId);
      context.characters = characters || [];
    } catch (err) {
      this.logger.warn(`buildProjectContext: failed to query characters - ${err instanceof Error ? err.message : String(err)}`);
    }

    // 世界观（兼容实际 schema：world_settings 表有 name/era/geography/factions/power_system 等）
    try {
      const worldSettings = db.prepare(
        'SELECT name, era, geography, factions, power_system, economy, society FROM world_settings WHERE project_id = ?',
      ).all(projectId);
      context.worldSettings = worldSettings || [];
    } catch (err) {
      this.logger.warn(`buildProjectContext: failed to query world_settings - ${err instanceof Error ? err.message : String(err)}`);
    }

    // state_items（仅查询 confirmed 和 pending）
    try {
      const stateItems = db.prepare(
        'SELECT title, summary, target_type, status FROM state_items WHERE project_id = ? AND status IN (?, ?)',
      ).all(projectId, 'confirmed', 'pending');
      context.stateItems = stateItems || [];
    } catch (err) {
      this.logger.warn(`buildProjectContext: failed to query state_items - ${err instanceof Error ? err.message : String(err)}`);
    }

    return context;
  }

  // ====================== HELPER: LLM Calls ======================

  private async callQualityLLM(
    content: string,
    chapterTitle: string,
    context: Record<string, any>,
    _dto: AnalyzeChapterDto,
  ): Promise<{ result: LLMQualityOutput; parseWarning: string | null; rawPreview: string | null }> {
    const tagsList = WRITING_QUALITY_TAGS.join(', ');
    const timelineCheck = `
额外检查时间线与因果链：
- 时间顺序冲突：使用 issueType timeline_conflict 或 time_order_error。
- 因果链断裂：使用 issueType causality_gap。
- 事件先后矛盾或读者得知顺序混乱：使用 issueType event_sequence_risk。
这些问题需要保留在 tags 中，便于跳转到时间线页面。`;
    const systemPrompt = `你是一位专业的网络小说编辑和质量诊断专家。你的任务是对网文章节进行深度质量诊断。

诊断维度：
- 章节开头钩子（reader_hook / chapter_hook）
- 段落节奏（pacing_risk）
- 冲突推进
- 情绪回报（emotional_payoff / low_retention）
- 爽点/记忆点（meme_point / retention_point）
- 对话区分度（flat_dialogue / same_voice_characters）
- 角色声音（needs_character_voice / needs_asymmetry）
- AI模板感（ai_pattern_risk / template_repetition）
- 解释过度（too_expository / over_explained）
- 抽象空泛（too_abstract / low_specificity）
- 细节密度（needs_detail）
- 结尾钩子（needs_hook / needs_payoff）
- 潜台词缺乏（lack_of_subtext / repeated_emotion_action）

可用质量标签：${tagsList}
${timelineCheck}

你必须只输出严格JSON，不输出任何其他内容。`;

    const contextSerialized = JSON.stringify(context, null, 0);
    const prompt = `请对以下网文章节进行专业质量诊断。

章节标题：${chapterTitle}

项目上下文（大纲/角色/世界观等）：${contextSerialized}

章节正文：
${content.slice(0, 15000)}

请输出严格JSON：
{
  "summary": "本章质量总评，控制在120字内",
  "overallLevel": "low|medium|high|critical",
  "overallScore": 0-100,
  "issues": [
    {
      "issueType": "reader_hook",
      "severity": "low|medium|high|critical",
      "title": "问题标题",
      "summary": "问题说明",
      "evidence": "正文中的证据片段",
      "suggestion": "具体修复建议",
      "paragraphIndex": 0,
      "sentenceIndex": 0,
      "startOffset": 0,
      "endOffset": 0,
      "originalText": "原文片段",
      "suggestedText": "建议改写片段",
      "tags": ["needs_hook"]
    }
  ]
}`;

    const response = await this.realLLM!.generate({
      prompt, systemPrompt, temperature: 0.3, scenario: 'quality_check',
    } as any);

    const rawContent = response.content || '';
    const parsed = this.parseJson<LLMQualityOutput>(rawContent);

    if (!parsed) {
      this.logger.warn('Failed to parse LLM quality output JSON');
      return {
        result: {
          summary: '质量诊断解析失败，请重试',
          overallLevel: 'medium',
          overallScore: 60,
          issues: [],
        },
        parseWarning: 'LLM returned non-JSON or malformed JSON output',
        rawPreview: rawContent.slice(0, 1000),
      };
    }

    parsed.overallLevel = ['low', 'medium', 'high', 'critical'].includes(parsed.overallLevel)
      ? parsed.overallLevel : 'medium';
    parsed.overallScore = typeof parsed.overallScore === 'number'
      ? Math.max(0, Math.min(100, Math.round(parsed.overallScore))) : 60;
    parsed.summary = String(parsed.summary || '').slice(0, 200);

    return { result: parsed, parseWarning: null, rawPreview: null };
  }

  private async callRefineLLM(
    issue: IssueRow,
    fullContent: string,
    contextText: string,
    instruction?: string,
  ): Promise<LLMRefineOutput> {
    const systemPrompt = `你是一位专业的网络小说文本精修专家。你的任务是对指定的问题段落进行局部精修。

要求：
1. 只修改问题相关的段落，不要全文重写。
2. 不要扩大修改范围。
3. 保持原章节人物、时间线、状态一致。
4. 不要擅自新增长期设定。
5. 不要擅自解决伏笔或改变剧情走向。
6. 如果需要改变剧情事实，在 remainingRisk 标记为 high。
只输出严格JSON。`;

    const prompt = `请对以下质量问题进行局部精修。

问题类型：${issue.issue_type}
严重程度：${issue.severity}
标题：${issue.title}
问题描述：${issue.summary}
原文证据：${issue.evidence || '无'}
建议方向：${issue.suggestion || '无'}
${instruction ? `额外指示：${instruction}` : ''}

章节上下文（片段）：
${contextText.slice(0, 3000)}

请输出严格JSON：
{
  "beforeText": "需要修改的原文片段（与原文完全一致）",
  "afterText": "修改后的文本",
  "reason": "为什么这样改，控制在80字内",
  "diff": [
    { "type": "keep|delete|insert|replace", "before": "原文本", "after": "新文本" }
  ],
  "remainingRisk": "none|low|medium|high"
}`;

    const response = await this.realLLM!.generate({
      prompt, systemPrompt, temperature: 0.4, scenario: 'quality_refine',
    } as any);

    const result = this.parseJson<LLMRefineOutput>(response.content);
    if (!result) {
      return {
        beforeText: issue.original_text || issue.evidence || '',
        afterText: issue.suggested_text || issue.evidence || '',
        reason: 'LLM 精修解析失败',
        diff: [],
        remainingRisk: 'high',
      };
    }

    result.beforeText = result.beforeText || issue.original_text || issue.evidence || '';
    result.afterText = result.afterText || result.beforeText;
    result.reason = String(result.reason || '').slice(0, 200);
    result.remainingRisk = ['none', 'low', 'medium', 'high'].includes(result.remainingRisk)
      ? result.remainingRisk : 'medium';
    result.diff = Array.isArray(result.diff) ? result.diff : [];
    return result;
  }

  private async callRecheckLLM(
    issue: IssueRow, revisedText: string, fullContent: string,
  ): Promise<RecheckResult> {
    const fixText = revisedText.slice(0, 2000);
    const prompt = `请复查以下精修结果。

原始问题：${issue.title}
问题类型：${issue.issue_type}
修改后文本：
${fixText}

章节当前内容（片段）：
${fullContent.slice(0, 3000)}

请判断问题是否已修复、是否引入新问题、修改是否符合写作质量要求。
输出严格JSON：
{ "pass": true/false, "level": "pass|warning|fail", "remainingIssues": 0, "newIssues": 0, "summary": "复查总结，80字内" }`;

    const response = await this.realLLM!.generate({
      prompt, temperature: 0.2, scenario: 'quality_check',
    } as any);

    const raw = this.parseJson<Record<string, any>>(response.content);
    if (raw) {
      return {
        pass: Boolean(raw.pass) || raw.level === 'pass',
        level: ['pass', 'warning', 'fail'].includes(raw.level) ? raw.level : 'warning',
        remainingIssues: Number(raw.remainingIssues) || 0,
        newIssues: Number(raw.newIssues) || 0,
        summary: String(raw.summary || '复查完成').slice(0, 120),
      };
    }
    return { pass: true, level: 'pass', remainingIssues: 0, newIssues: 0, summary: '复查完成（自动判断）' };
  }

  // ====================== HELPERS ======================

  private persistAttentionReport(
    db: any,
    projectId: string,
    dto: AttentionCheckDto,
    input: { title: string; chapterId: string; attention: any; chapterLocked: boolean },
  ) {
    const now = new Date().toISOString();
    const level = input.attention.slipAwayRiskScore >= 85
      ? 'critical'
      : input.attention.slipAwayRiskScore >= 70
        ? 'high'
        : input.attention.slipAwayRiskScore >= 45
          ? 'medium'
          : 'low';
    const summary = input.attention.reasons?.length
      ? `滑走风险 ${input.attention.slipAwayRiskScore}：${input.attention.reasons.slice(0, 2).join('；')}`
      : `滑走风险 ${input.attention.slipAwayRiskScore}，前三屏注意力基础通过。`;
    const payload = { attention: input.attention, mode: dto.mode || 'auto' };

    if (dto.reportId) {
      const existing = db.prepare(
        'SELECT * FROM writing_quality_reports WHERE id = ? AND project_id = ?',
      ).get(dto.reportId, projectId) as ReportRow | undefined;
      if (existing) {
        const oldPayload = safeJsonParse(existing.payload || '{}', {});
        db.prepare(`
          UPDATE writing_quality_reports
          SET summary = ?, overall_level = ?, overall_score = ?, payload = ?, attention_json = ?, updated_at = ?
          WHERE id = ?
        `).run(
          summary,
          level,
          Math.max(0, 100 - Number(input.attention.slipAwayRiskScore || 0)),
          JSON.stringify({ ...oldPayload, ...payload }),
          JSON.stringify(input.attention),
          now,
          dto.reportId,
        );
        const updated = db.prepare('SELECT * FROM writing_quality_reports WHERE id = ?').get(dto.reportId) as ReportRow;
        return {
          ...this.reportRowToResponse(updated),
          issueCount: 0,
          openIssueCount: 0,
          highIssueCount: 0,
          resolvedIssueCount: 0,
          chapterLocked: input.chapterLocked,
        };
      }
    }

    const reportId = uuid();
    db.prepare(`
      INSERT INTO writing_quality_reports (
        id, project_id, chapter_id, source_type, source_id, scope, title, summary,
        overall_level, overall_score, model, payload, attention_json, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      reportId,
      projectId,
      input.chapterId,
      'attention_check',
      input.chapterId,
      'attention',
      `Attention Check: ${input.title}`,
      summary,
      level,
      Math.max(0, 100 - Number(input.attention.slipAwayRiskScore || 0)),
      'rule',
      JSON.stringify(payload),
      JSON.stringify(input.attention),
      'system',
      now,
      now,
    );
    const created = db.prepare('SELECT * FROM writing_quality_reports WHERE id = ?').get(reportId) as ReportRow;
    return {
      ...this.reportRowToResponse(created),
      issueCount: 0,
      openIssueCount: 0,
      highIssueCount: 0,
      resolvedIssueCount: 0,
      chapterLocked: input.chapterLocked,
    };
  }

  private buildAttentionAnalysis(input: { title: string; intro: string; content: string; mode: string }) {
    const content = (input.content || '').trim();
    const title = (input.title || '').trim();
    const intro = (input.intro || '').trim();
    const slices = [
      { key: 'first50', label: '前50字', text: content.slice(0, 50) },
      { key: 'first100', label: '前100字', text: content.slice(0, 100) },
      { key: 'first300', label: '前300字', text: content.slice(0, 300) },
      { key: 'first500', label: '前500字', text: content.slice(0, 500) },
    ];
    const hookWords = ['死', '血', '骗', '秘密', '崩', '逃', '杀', '债', '失踪', '背叛', '规则', '代价', '真相', '不能', '必须', '突然', '只有', '为什么', '？', '?'];
    const emotionWords = ['怕', '怒', '痛', '恨', '哭', '笑', '悔', '疯', '冷', '羞', '爽', '惊'];
    const conflictWords = ['冲突', '威胁', '追', '抢', '逼', '拒绝', '争', '输', '赢', '赌', '陷阱'];
    const scoreText = (text: string) => {
      const hits = [...hookWords, ...emotionWords, ...conflictWords].filter(word => text.includes(word)).length;
      const hasDialogue = /[“”"]/.test(text);
      const hasQuestion = /[?？]/.test(text);
      const hasAction = /[，。！？!?]/.test(text) && text.length > 20;
      return Math.min(100, hits * 12 + (hasDialogue ? 12 : 0) + (hasQuestion ? 10 : 0) + (hasAction ? 10 : 0));
    };

    const checkpoints = [
      { name: '标题', text: title, score: title ? scoreText(title) + 15 : 0 },
      { name: '简介', text: intro, score: intro ? scoreText(intro) + 10 : 0 },
      ...slices.map(slice => ({ name: slice.label, text: slice.text, score: scoreText(slice.text) })),
    ].map(item => ({
      ...item,
      pass: item.score >= 45,
      issue: item.score >= 45 ? '' : `${item.name}缺少明确疑点、冲突、情绪或信息变化。`,
    }));

    const windows: Array<{ start: number; end: number; score: number; risk: string }> = [];
    for (let start = 0; start < Math.min(content.length, 3000); start += 300) {
      const text = content.slice(start, start + 300);
      if (!text) break;
      const score = scoreText(text);
      windows.push({
        start,
        end: start + text.length,
        score,
        risk: score >= 45 ? 'ok' : 'needs_question_or_turn',
      });
    }

    const longPromises = ['主线目标', '核心谜题', '关系张力', '升级空间'].map(name => ({
      name,
      present: scoreText(content.slice(0, 2500)) >= (name === '升级空间' ? 55 : 35),
      suggestion: `${name}需要在首章、前三章或前十章内给出可追读承诺。`,
    }));
    const failures = checkpoints.filter(item => !item.pass).length + windows.filter(item => item.score < 45).length;
    const slipAwayRiskScore = Math.max(0, Math.min(100, 30 + failures * 8 - Math.floor(scoreText(content.slice(0, 500)) / 4)));
    const reasons = [
      ...checkpoints.filter(item => !item.pass).map(item => item.issue),
      ...windows.filter(item => item.score < 45).slice(0, 5).map(item => `${item.start}-${item.end}字缺少新的疑点、冲突、信息变化或情绪推进。`),
    ];

    return {
      mode: input.mode,
      slipAwayRiskScore,
      level: slipAwayRiskScore >= 75 ? 'high' : slipAwayRiskScore >= 50 ? 'medium' : 'low',
      checkpoints,
      shortStoryWindows: windows,
      longReadThroughPromises: longPromises,
      reasons,
      revisionPlan: [
        '前50字放入不可忽略的异常、危机或强情绪反应。',
        '前300字完成一次信息变化：误判、反转、身份差或明确代价。',
        '前500字给出本章目标和继续读下去的承诺。',
      ],
      alternativeOpenings: [
        `如果从冲突开场：${title || '本章'}可以先写主角被迫做出一个会付出代价的选择。`,
        `如果从疑点开场：先展示一个违反常识的结果，再倒推原因。`,
        `如果从情绪开场：用具体动作呈现恐惧、愤怒或羞耻，不先解释设定。`,
      ],
    };
  }

  private inferAttentionMode(project: any): 'short' | 'long' {
    const raw = project?.project || project || {};
    const type = String(raw.type || '').toLowerCase();
    const targetWords = Number(raw.target_words || 0);
    if (type.includes('short') || targetWords > 0 && targetWords <= 50000) return 'short';
    return 'long';
  }

  private buildIssueNavigation(input: {
    projectId: string;
    chapterId: string;
    reportId: string;
    issueId: string;
    issueType: string;
    tags: string[];
    evidence?: string;
    paragraphIndex?: number | null;
    sentenceIndex?: number | null;
  }) {
    const all = new Set([input.issueType, ...input.tags]);
    const timelineTags = ['timeline_conflict', 'causality_gap', 'time_order_error', 'event_sequence_risk'];
    const target = timelineTags.some(tag => all.has(tag))
      ? { target: 'timeline', label: '时间线', pathBase: `/project/${input.projectId}/timeline` }
      : all.has('needs_character_voice') || all.has('same_voice_characters') || all.has('needs_asymmetry')
        ? { target: 'character', label: '角色', pathBase: `/project/${input.projectId}/characters` }
        : all.has('logic_gap') || all.has('too_expository')
          ? { target: 'world', label: '世界观', pathBase: `/project/${input.projectId}/world` }
          : all.has('needs_payoff') || all.has('needs_hook')
            ? { target: 'foreshadowing', label: '伏笔', pathBase: `/project/${input.projectId}/foreshadowing` }
            : all.has('pacing_risk') || all.has('chapter_hook')
              ? { target: 'outline', label: '大纲章节', pathBase: `/project/${input.projectId}/outline` }
              : { target: 'writing', label: '正文定位', pathBase: `/project/${input.projectId}/writing` };
    const evidencePreview = (input.evidence || '').replace(/\s+/g, ' ').slice(0, 80);
    const params = new URLSearchParams({
      source: 'writing-quality',
      reportId: input.reportId,
      issueId: input.issueId,
      chapterId: input.chapterId,
      target: target.target,
    });
    if (input.paragraphIndex !== null && input.paragraphIndex !== undefined) {
      params.set('paragraphIndex', String(input.paragraphIndex));
    }
    if (evidencePreview) params.set('evidencePreview', evidencePreview);
    const context = {
      source: 'writing-quality',
      reportId: input.reportId,
      issueId: input.issueId,
      chapterId: input.chapterId,
      evidence: input.evidence || '',
      evidencePreview,
      paragraphIndex: input.paragraphIndex ?? null,
      sentenceIndex: input.sentenceIndex ?? null,
      issueType: input.issueType,
    };
    return {
      target: target.target,
      label: target.label,
      path: `${target.pathBase}?${params.toString()}`,
      context,
    };
  }

  private persistRecheckResult(db: any, revision: RevisionRow, issue: IssueRow | null, result: RecheckResult) {
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE writing_revision_records
      SET recheck_result_json = ?, updated_at = ?
      WHERE id = ?
    `).run(JSON.stringify(result), now, revision.id);

    if (!issue) return;
    const nextStatus = result.pass ? 'recheck_passed' : 'recheck_failed';
    const history = safeJsonParse(issue.status_history_json || '[]', []);
    history.push({ from: issue.status, to: nextStatus, reason: 'revision_recheck', at: now });
    db.prepare(`
      UPDATE writing_quality_issues
      SET status = ?, recheck_result_json = ?, status_history_json = ?, updated_at = ?
      WHERE id = ?
    `).run(nextStatus, JSON.stringify(result), JSON.stringify(history), now, issue.id);
  }

  private getChapterContext(content: string, issue: IssueRow): string {
    const idx = content.indexOf(issue.original_text || issue.evidence || '');
    if (idx >= 0) {
      const start = Math.max(0, idx - 500);
      const end = Math.min(content.length, idx + (issue.original_text || issue.evidence || '').length + 500);
      return content.slice(start, end);
    }
    return content.slice(0, 3000);
  }

  private simpleRecheck(remainingCount: number): RecheckResult {
    return {
      pass: remainingCount <= 1,
      level: remainingCount === 0 ? 'pass' : remainingCount <= 2 ? 'warning' : 'fail',
      remainingIssues: remainingCount,
      newIssues: 0,
      summary: remainingCount === 0 ? '该章节所有问题已解决' : `该章节还有 ${remainingCount} 个问题待处理`,
    };
  }

  private calcIssueCounts(issueRows: IssueRow[]): IssueCounts {
    let total = 0, open = 0, high = 0, resolved = 0;
    for (const i of issueRows) {
      total++;
      if (this.isClosedIssueStatus(i.status)) resolved++;
      if (this.isOpenIssueStatus(i.status)) {
        open++;
        if (i.severity === 'high' || i.severity === 'critical') high++;
      }
    }
    return { total, open, high, resolved };
  }

  private isOpenIssueStatus(status: string): boolean {
    return ['open', 'planned', 'refined', 'recheck_failed'].includes(status);
  }

  private isClosedIssueStatus(status: string): boolean {
    return ['resolved', 'applied', 'recheck_passed', 'ignored', 'archived'].includes(status);
  }

  private parseJson<T>(content: string | null | undefined): T | null {
    if (!content) return null;
    const clean = content.replace(/```json\n?|```\n?/g, '').trim();
    try { return JSON.parse(clean) as T; } catch { /* try extract */ }
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(clean.slice(start, end + 1)) as T; } catch { /* fall through */ }
    }
    return null;
  }

  // ====================== RESPONSE MAPPERS ======================

  private reportRowToResponse(r: ReportRow) {
    return {
      id: r.id, projectId: r.project_id, chapterId: r.chapter_id,
      sourceType: r.source_type, scope: r.scope,
      title: r.title, summary: r.summary,
      overallLevel: r.overall_level, overallScore: r.overall_score,
      status: r.status, model: r.model,
      payload: safeJsonParse(r.payload),
      attention: safeJsonParse(r.attention_json || '{}'),
      viewState: safeJsonParse(r.view_state_json || '{}'),
      createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
    };
  }

  private issueRowToResponse(r: IssueRow) {
    const tags = safeJsonParse(r.tags, []);
    const parsedNavigation = safeJsonParse(r.navigation_json || '{}', {});
    const hasValidNavigation = parsedNavigation?.target
      && parsedNavigation?.label
      && parsedNavigation?.path
      && parsedNavigation?.context;
    const navigation = hasValidNavigation
      ? parsedNavigation
      : this.buildIssueNavigation({
        projectId: r.project_id,
        chapterId: r.chapter_id,
        reportId: r.report_id,
        issueId: r.id,
        issueType: r.issue_type,
        tags,
        evidence: r.evidence || '',
        paragraphIndex: r.paragraph_index,
        sentenceIndex: r.sentence_index,
      });
    return {
      id: r.id, reportId: r.report_id, projectId: r.project_id, chapterId: r.chapter_id,
      issueType: r.issue_type, severity: r.severity,
      title: r.title, summary: r.summary,
      evidence: r.evidence, suggestion: r.suggestion,
      paragraphIndex: r.paragraph_index, sentenceIndex: r.sentence_index,
      startOffset: r.start_offset, endOffset: r.end_offset,
      originalText: r.original_text, suggestedText: r.suggested_text,
      tags,
      status: r.status, payload: safeJsonParse(r.payload),
      latestRevisionId: r.latest_revision_id || null,
      navigation,
      statusHistory: safeJsonParse(r.status_history_json || '[]', []),
      recheckResult: safeJsonParse(r.recheck_result_json || '{}', {}),
      createdAt: r.created_at, updatedAt: r.updated_at,
      resolvedAt: r.resolved_at, resolvedBy: r.resolved_by,
    };
  }

  private revisionRowToResponse(r: RevisionRow) {
    const payload = safeJsonParse(r.payload || '{}', {});
    return {
      id: r.id,
      projectId: r.project_id,
      chapterId: r.chapter_id,
      issueId: r.issue_id,
      reportId: r.report_id,
      revisionType: r.revision_type,
      beforeText: r.before_text,
      afterText: r.after_text,
      diff: safeJsonParse(r.diff_json, []),
      applied: r.applied === 1,
      appliedAt: r.applied_at,
      reverted: r.reverted === 1,
      payload,
      reason: payload.reason || '',
      remainingRisk: payload.remainingRisk || 'medium',
      canApply: r.can_apply !== 0,
      recheckResult: safeJsonParse(r.recheck_result_json || '{}', {}),
      createdBy: r.created_by,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }
}

function safeJsonParse(raw: string, fallback: any = {}) {
  try { return JSON.parse(raw || '{}'); } catch { return fallback; }
}
