/**
 * WritingQualityService - Phase 6.1 Writing Quality Diagnosis & Revision Engine
 *
 * 核心能力：
 * 1. 正文质量诊断（analyzeChapterQuality）
 * 2. 报告/问题查询（listReports / getReport）
 * 3. 问题解决标记（markIssueResolved）
 * 4. 局部精修建议（refineIssue）
 * 5. 精修应用（applyRevision）
 * 6. 精修后复查（recheckAfterRevision）
 */
import { Injectable, Logger, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { DatabaseService } from '../../database/database.service';
import { RealLLMService } from '../../chain/real-llm.service';
import { WRITING_QUALITY_TAGS } from '../../state/writing-quality-tags';
import { ChapterService } from '../chapter/chapter.service';
import type {
  AnalyzeChapterDto,
  ListReportsDto,
  RefineIssueDto,
  LLMQualityOutput,
  LLMQualityIssue,
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

  async analyzeChapterQuality(projectId: string, dto: AnalyzeChapterDto) {
    const db = this.dbService.getDb();
    const chapterId = dto.chapterId;

    // 读取章节内容
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

    // 读取项目上下文
    const context = this.buildProjectContext(projectId, db);

    // 调用 LLM 进行质量诊断
    let llmResult: LLMQualityOutput;
    if (this.realLLM) {
      llmResult = await this.callQualityLLM(content, chapterTitle, context, dto);
    } else {
      throw new BadRequestException('LLM service is not available. Please configure an API key.');
    }

    // 写入数据库
    const now = new Date().toISOString();
    const reportId = uuid();

    db.prepare(`
      INSERT INTO writing_quality_reports (
        id, project_id, chapter_id, source_type, source_id, scope, title, summary,
        overall_level, overall_score, model, payload, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      reportId,
      projectId,
      chapterId,
      'manual_check',
      null,
      dto.scope || 'chapter',
      `Chapter Quality: ${chapterTitle}`,
      llmResult.summary,
      llmResult.overallLevel || 'medium',
      llmResult.overallScore ?? null,
      'llm',
      '{}',
      'system',
      now,
      now,
    );

    // 写入 issues
    const issues: IssueRow[] = [];
    const validTags = new Set(WRITING_QUALITY_TAGS as readonly string[]);

    for (const issue of llmResult.issues || []) {
      // 过滤非法 issueType
      const issueType = validTags.has(issue.issueType) ? issue.issueType : 'needs_hook';
      // 过滤 tags
      const tags = (issue.tags || []).filter(t => validTags.has(t));
      if (!tags.includes(issueType)) tags.unshift(issueType);

      const issueId = uuid();
      db.prepare(`
        INSERT INTO writing_quality_issues (
          id, report_id, project_id, chapter_id, issue_type, severity, title, summary,
          evidence, suggestion, paragraph_index, sentence_index, start_offset, end_offset,
          original_text, suggested_text, tags, status, payload, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        issueId,
        reportId,
        projectId,
        chapterId,
        issueType,
        issue.severity || 'medium',
        issue.title,
        issue.summary,
        issue.evidence || '',
        issue.suggestion || '',
        issue.paragraphIndex ?? null,
        issue.sentenceIndex ?? null,
        issue.startOffset ?? null,
        issue.endOffset ?? null,
        issue.originalText || '',
        issue.suggestedText || '',
        JSON.stringify(tags),
        'open',
        '{}',
        now,
        now,
      );

      issues.push({
        id: issueId,
        report_id: reportId,
        project_id: projectId,
        chapter_id: chapterId,
        issue_type: issueType,
        severity: issue.severity || 'medium',
        title: issue.title,
        summary: issue.summary,
        evidence: issue.evidence || '',
        suggestion: issue.suggestion || '',
        paragraph_index: issue.paragraphIndex ?? null as any,
        sentence_index: issue.sentenceIndex ?? null as any,
        start_offset: issue.startOffset ?? null as any,
        end_offset: issue.endOffset ?? null as any,
        original_text: issue.originalText || '',
        suggested_text: issue.suggestedText || '',
        tags: JSON.stringify(tags),
        status: 'open',
        payload: '{}',
        created_at: now,
        updated_at: now,
        resolved_at: null as any,
        resolved_by: null as any,
      });
    }

    return {
      success: true,
      report: {
        id: reportId,
        projectId,
        chapterId,
        title: `Chapter Quality: ${chapterTitle}`,
        summary: llmResult.summary,
        overallLevel: llmResult.overallLevel || 'medium',
        overallScore: llmResult.overallScore ?? null,
        status: 'open',
        issueCount: issues.length,
        chapterLocked: chapterStatus === 'locked',
        createdAt: now,
      },
      issues: issues.map(i => this.issueRowToResponse(i)),
    };
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
    return rows.map(r => this.reportRowToResponse(r));
  }

  // ====================== 3. GET REPORT ======================

  getReport(reportId: string) {
    const db = this.dbService.getDb();
    const report = db.prepare('SELECT * FROM writing_quality_reports WHERE id = ?').get(reportId) as ReportRow | undefined;
    if (!report) throw new NotFoundException(`Report ${reportId} not found`);

    const issueRows = db.prepare(
      'SELECT * FROM writing_quality_issues WHERE report_id = ? ORDER BY severity DESC, created_at ASC',
    ).all(reportId) as unknown as IssueRow[];

    return {
      report: this.reportRowToResponse(report),
      issues: issueRows.map(i => this.issueRowToResponse(i)),
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

    // 获取章节上下文（前后文）
    const contextText = this.getChapterContext(chapterRow.content, issue);

    let refineResult: LLMRefineOutput;
    if (this.realLLM) {
      refineResult = await this.callRefineLLM(issue, chapterRow.content, contextText, dto.instruction);
    } else {
      throw new BadRequestException('LLM service is not available');
    }

    // 写入 revision record
    const now = new Date().toISOString();
    const revisionId = uuid();
    db.prepare(`
      INSERT INTO writing_revision_records (
        id, project_id, chapter_id, issue_id, report_id, revision_type,
        before_text, after_text, diff_json, applied, payload, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      revisionId,
      projectId,
      issue.chapter_id,
      issueId,
      issue.report_id,
      'local_refine',
      refineResult.beforeText,
      refineResult.afterText,
      JSON.stringify(refineResult.diff),
      0,
      '{}',
      'system',
      now,
      now,
    );

    return {
      success: true,
      revision: {
        id: revisionId,
        issueId,
        projectId,
        chapterId: issue.chapter_id,
        beforeText: refineResult.beforeText,
        afterText: refineResult.afterText,
        reason: refineResult.reason,
        diff: refineResult.diff,
        remainingRisk: refineResult.remainingRisk,
        canApply: mode !== 'suggest_only' && !isLocked,
        locked: isLocked,
        applied: false,
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

    // 局部替换
    const beforeText = revision.before_text;
    const afterText = revision.after_text;
    const currentContent = chapterRow.content;

    if (!currentContent.includes(beforeText)) {
      throw new BadRequestException(
        'Cannot apply revision: original text not found in chapter. The chapter may have been modified since the revision was created.',
      );
    }

    // 只替换第一次出现（局部替换）
    const newContent = currentContent.replace(beforeText, afterText);
    const chineseChars = (newContent.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g) || []).length;
    const englishWords = newContent.replace(/[^\x00-\xff]/g, '').split(/\s+/).filter(w => w.length > 0).length;
    const newWordCount = chineseChars + englishWords;

    const now = new Date().toISOString();

    // 更新章节内容
    db.prepare(`
      UPDATE chapters SET content = ?, word_count = ?, updated_at = ? WHERE id = ?
    `).run(newContent, newWordCount, now, revision.chapter_id);

    // 更新 revision 记录
    db.prepare(`
      UPDATE writing_revision_records
      SET applied = 1, applied_at = ?, updated_at = ?
      WHERE id = ?
    `).run(now, now, revisionId);

    // 更新关联 issue 状态
    if (revision.issue_id) {
      db.prepare(`
        UPDATE writing_quality_issues
        SET status = 'resolved', resolved_at = ?, resolved_by = 'system', updated_at = ?
        WHERE id = ?
      `).run(now, now, revision.issue_id);
    }

    return {
      success: true,
      revision: {
        id: revisionId,
        applied: true,
        appliedAt: now,
      },
      chapter: {
        id: revision.chapter_id,
        wordCount: newWordCount,
      },
      needsRecheck: true,
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

    // 检查关联 issues 的剩余数量
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
        this.logger.warn(`LLM recheck failed, fallback to simple check: ${err instanceof Error ? err.message : String(err)}`);
        result = this.simpleRecheck(remainingCount);
      }
    } else {
      result = this.simpleRecheck(remainingCount);
    }

    return { success: true, result };
  }

  // ====================== HELPER: Project Context ======================

  private buildProjectContext(projectId: string, db: any): Record<string, any> {
    const context: Record<string, any> = {};

    // 大纲信息
    const outlines = db.prepare(
      'SELECT title, summary FROM outlines WHERE project_id = ? ORDER BY chapter_index LIMIT 20',
    ).all(projectId) as Array<{ title: string; summary: string }>;
    context.outlines = outlines;

    // 角色信息
    const characters = db.prepare(
      'SELECT name, identity, personality, role_type FROM characters WHERE project_id = ? LIMIT 15',
    ).all(projectId);
    context.characters = characters;

    // 世界观
    const worldSettings = db.prepare(
      'SELECT category, key, value FROM world_settings WHERE project_id = ? LIMIT 20',
    ).all(projectId);
    context.worldSettings = worldSettings;

    // 项目信息
    const project = db.prepare(
      'SELECT title, genre, target_chapters FROM projects WHERE id = ?',
    ).get(projectId);
    if (project) context.project = project;

    // 已有 state items
    const stateItems = db.prepare(
      'SELECT title, summary, target_type, status FROM state_items WHERE project_id = ? AND status IN (?, ?) LIMIT 20',
    ).all(projectId, 'confirmed', 'pending');
    context.stateItems = stateItems;

    return context;
  }

  // ====================== HELPER: LLM Calls ======================

  private async callQualityLLM(
    content: string,
    chapterTitle: string,
    context: Record<string, any>,
    _dto: AnalyzeChapterDto,
  ): Promise<LLMQualityOutput> {
    const tagsList = WRITING_QUALITY_TAGS.join(', ');
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

你必须只输出严格JSON，不输出任何其他内容。`;

    const contextSerialized = JSON.stringify(context, null, 0);
    const prompt = `请对以​下网文章节进行专业质量诊断。

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
      prompt,
      systemPrompt,
      model: 'deepseek',
      temperature: 0.3,
      scenario: 'quality_check',
    } as any);

    const result = this.parseJson<LLMQualityOutput>(response.content);
    if (!result) {
      this.logger.warn(`Failed to parse LLM quality output, using fallback`);
      return {
        summary: '质量诊断解析失败，请重试',
        overallLevel: 'medium',
        overallScore: 60,
        issues: [],
      };
    }

    // 标准化
    result.overallLevel = ['low', 'medium', 'high', 'critical'].includes(result.overallLevel)
      ? result.overallLevel
      : 'medium';
    result.overallScore = typeof result.overallScore === 'number'
      ? Math.max(0, Math.min(100, Math.round(result.overallScore)))
      : 60;
    result.summary = String(result.summary || '').slice(0, 200);

    return result;
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
    {
      "type": "keep|delete|insert|replace",
      "before": "原文本",
      "after": "新文本"
    }
  ],
  "remainingRisk": "none|low|medium|high"
}`;

    const response = await this.realLLM!.generate({
      prompt,
      systemPrompt,
      model: 'deepseek',
      temperature: 0.4,
      scenario: 'quality_refine',
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
      ? result.remainingRisk
      : 'medium';
    result.diff = Array.isArray(result.diff) ? result.diff : [];

    return result;
  }

  private async callRecheckLLM(
    issue: IssueRow,
    revisedText: string,
    fullContent: string,
  ): Promise<RecheckResult> {
    const fixText = revisedText.slice(0, 2000);

    const prompt = `请复查以下精修结果。

原始问题：${issue.title}
问题类型：${issue.issue_type}
修改后文本：
${fixText}

章节当前内容（片段）：
${fullContent.slice(0, 3000)}

请判断：
1. 问题是否已修复
2. 是否引入新问题
3. 修改是否符合写作质量要求

输出严格JSON：
{
  "pass": true/false,
  "level": "pass|warning|fail",
  "remainingIssues": 0,
  "newIssues": 0,
  "summary": "复查总结，80字内"
}`;

    const response = await this.realLLM!.generate({
      prompt,
      model: 'deepseek',
      temperature: 0.2,
      scenario: 'quality_check',
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

  private getChapterContext(content: string, issue: IssueRow): string {
    // 返回问题附近的内容
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
      summary: remainingCount === 0
        ? '该章节所有问题已解决'
        : `该章节还有 ${remainingCount} 个问题待处理`,
    };
  }

  private parseJson<T>(content: string | null | undefined): T | null {
    if (!content) return null;
    const clean = content.replace(/```json\n?|```\n?/g, '').trim();
    try {
      return JSON.parse(clean) as T;
    } catch {
      const start = clean.indexOf('{');
      const end = clean.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(clean.slice(start, end + 1)) as T;
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  // ====================== RESPONSE MAPPERS ======================

  private reportRowToResponse(r: ReportRow) {
    return {
      id: r.id,
      projectId: r.project_id,
      chapterId: r.chapter_id,
      sourceType: r.source_type,
      scope: r.scope,
      title: r.title,
      summary: r.summary,
      overallLevel: r.overall_level,
      overallScore: r.overall_score,
      status: r.status,
      model: r.model,
      payload: safeJsonParse(r.payload),
      createdBy: r.created_by,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  private issueRowToResponse(r: IssueRow) {
    return {
      id: r.id,
      reportId: r.report_id,
      projectId: r.project_id,
      chapterId: r.chapter_id,
      issueType: r.issue_type,
      severity: r.severity,
      title: r.title,
      summary: r.summary,
      evidence: r.evidence,
      suggestion: r.suggestion,
      paragraphIndex: r.paragraph_index,
      sentenceIndex: r.sentence_index,
      startOffset: r.start_offset,
      endOffset: r.end_offset,
      originalText: r.original_text,
      suggestedText: r.suggested_text,
      tags: safeJsonParse(r.tags, []),
      status: r.status,
      payload: safeJsonParse(r.payload),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      resolvedAt: r.resolved_at,
      resolvedBy: r.resolved_by,
    };
  }
}

function safeJsonParse(raw: string, fallback: any = {}) {
  try { return JSON.parse(raw || '{}'); } catch { return fallback; }
}
