import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { createHash, randomUUID } from 'crypto';
import { RealLLMService } from '../../chain/real-llm.service';
import { DatabaseService } from '../../database/database.service';
import { ChunkerService } from '../../rag/chunker.service';
import { EmbeddingService } from '../../rag/embedding.service';
import { VectorIndexService } from '../../rag/vector-index.service';
import { ConflictEngineService } from '../conflict-engine/conflict-engine.service';
import { StateItemService } from '../../state/state-item.service';

export type DerivedSyncStepStatus = 'completed' | 'pending' | 'warning';
export interface DerivedSyncStep { status: DerivedSyncStepStatus; detail: string; }
export interface ContinuityReviewStep extends DerivedSyncStep {
  issueCount: number;
  blockingCount: number;
  reviewIds: string[];
  stateItemIds: string[];
  /** @deprecated use reviewIds and stateItemIds */
  reviewItemIds?: string[];
}
export interface ChapterSummaryStep extends DerivedSyncStep { entityId?: string; checksum?: string; }
export interface AggregateSummaryStep extends DerivedSyncStep { staleTargets?: string[]; }
export interface VectorIndexStep extends DerivedSyncStep {
  deletedChunks?: number;
  createdChunks?: number;
  checksum?: string;
  retainedOldIndex?: boolean;
  previousChecksum?: string;
}

export interface ChapterDerivedDataSyncResult {
  success: boolean;
  coreSyncSuccess: boolean;
  fullSyncSuccess: boolean;
  chapterId: string;
  reason: 'manual_save' | 'version_restore' | 'manual_resync';
  contentChecksum: string;
  steps: {
    chapterSummary: ChapterSummaryStep;
    aggregateSummaries: AggregateSummaryStep;
    vectorIndex: VectorIndexStep;
    foreshadowingReview: ContinuityReviewStep;
    timelineReview: ContinuityReviewStep;
    outlineDeviation: ContinuityReviewStep;
    conflictReview: DerivedSyncStep;
  };
  warnings: string[];
}

interface SyncInput {
  projectId: string;
  chapterId: string;
  beforeContent: string;
  afterContent: string;
  reason: 'manual_save' | 'version_restore' | 'manual_resync';
}

@Injectable()
export class ChapterDerivedDataSyncService {
  private readonly logger = new Logger(ChapterDerivedDataSyncService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly chunker: ChunkerService,
    private readonly vectorIndex: VectorIndexService,
    private readonly embedding: EmbeddingService,
    private readonly moduleRef: ModuleRef,
    @Optional() private readonly conflictEngine?: ConflictEngineService,
    @Optional() private readonly stateItems?: StateItemService,
  ) {}

  async syncAfterContentChange(input: SyncInput): Promise<ChapterDerivedDataSyncResult> {
    const db = this.database.getDb();
    const chapter = db.prepare(`
      SELECT id, project_id, outline_id, volume_index, chapter_index, content
      FROM chapters WHERE id = ? AND project_id = ?
    `).get(input.chapterId, input.projectId) as any;
    if (!chapter) throw new NotFoundException(`Chapter ${input.chapterId} not found in project ${input.projectId}`);

    const contentChecksum = this.checksum(input.afterContent);
    const warnings: string[] = [];
    this.persistSyncState(input, contentChecksum, 'pending', 'pending', 'pending', 'pending', 'pending', true, false, []);

    const chapterSummary = await this.syncChapterSummary(input, contentChecksum, warnings);
    let aggregateSummaries: AggregateSummaryStep;
    try {
      aggregateSummaries = this.invalidateAggregateSummaries(input, chapter.volume_index, contentChecksum);
    } catch (error) {
      const message = this.errorMessage(error);
      warnings.push(`Aggregate summary invalidation failed: ${message}`);
      aggregateSummaries = { status: 'warning', detail: message, staleTargets: [] };
    }
    const vectorIndex = await this.syncVectorIndex(input, chapter, contentChecksum, warnings);
    const foreshadowingReview = this.reviewForeshadowing(input, contentChecksum);
    const timelineReview = this.reviewTimeline(input, contentChecksum);
    const outlineDeviation = this.reviewOutline(input, contentChecksum, chapter);
    const conflictReview = await this.runConflictReview(input, warnings);
    const steps: ChapterDerivedDataSyncResult['steps'] = {
      chapterSummary,
      aggregateSummaries,
      vectorIndex,
      foreshadowingReview,
      timelineReview,
      outlineDeviation,
      conflictReview,
    };
    const coreSyncSuccess = [chapterSummary, aggregateSummaries, vectorIndex]
      .every((step) => step.status === 'completed') && warnings.length === 0;
    const fullSyncSuccess = Object.values(steps).every((step) => step.status === 'completed') && warnings.length === 0;
    const needsAuthorReview = foreshadowingReview.issueCount > 0 || timelineReview.issueCount > 0
      || outlineDeviation.issueCount > 0 || outlineDeviation.status === 'pending';
    const needsResync = !fullSyncSuccess && !(outlineDeviation.status === 'pending'
      && Object.entries(steps).filter(([key]) => key !== 'outlineDeviation').every(([, step]) => step.status === 'completed')
      && warnings.length === 0);
    this.persistSyncState(
      input,
      contentChecksum,
      chapterSummary.status,
      vectorIndex.status,
      foreshadowingReview.status,
      timelineReview.status,
      outlineDeviation.status,
      needsResync,
      needsAuthorReview,
      warnings,
    );

    return {
      success: fullSyncSuccess,
      coreSyncSuccess,
      fullSyncSuccess,
      chapterId: input.chapterId,
      reason: input.reason,
      contentChecksum,
      steps,
      warnings,
    };
  }

  getLockGate(projectId: string, chapterId: string, content: string) {
    const checksum = this.checksum(content);
    const db = this.database.getDb();
    const sync = db.prepare('SELECT * FROM chapter_derived_sync_states WHERE project_id=? AND chapter_id=?').get(projectId, chapterId) as any;
    const reviews = db.prepare(`SELECT r.id AS review_id, r.state_item_id, r.review_type, r.issue_type FROM chapter_continuity_reviews r
      LEFT JOIN state_items s ON s.id=r.state_item_id
      WHERE r.project_id=? AND r.chapter_id=? AND r.content_checksum=? AND r.blocks_lock=1
        AND COALESCE(s.status,r.status) IN ('pending','conflict','stale')`).all(projectId, chapterId, checksum) as any[];
    const reasons: string[] = [];
    if (!sync || sync.content_checksum !== checksum) reasons.push('derived data is not current for the chapter checksum');
    if (sync?.needs_resync === 1) reasons.push('chapter derived data requires resynchronization');
    if (sync?.summary_sync_status === 'warning') reasons.push('chapter summary synchronization has a warning');
    if (sync?.vector_sync_status === 'warning') reasons.push('chapter vector synchronization has a warning');
    if (sync?.foreshadowing_sync_status === 'warning') reasons.push('foreshadowing synchronization has a warning');
    if (sync?.timeline_sync_status === 'warning') reasons.push('timeline synchronization has a warning');
    if (sync?.outline_sync_status === 'warning') reasons.push('outline synchronization has a warning');
    reasons.push(...reviews.map((row) => `${row.review_type}:${row.issue_type}`));
    return {
      allowed: reasons.length === 0, reasons,
      reviewIds: reviews.map((row) => row.review_id),
      stateItemIds: reviews.map((row) => row.state_item_id).filter(Boolean),
      checksum,
      needsResync: sync?.needs_resync === 1,
      needsAuthorReview: sync?.needs_author_review === 1,
      syncStatuses: {
        summary: sync?.summary_sync_status || 'missing', vector: sync?.vector_sync_status || 'missing',
        foreshadowing: sync?.foreshadowing_sync_status || 'missing', timeline: sync?.timeline_sync_status || 'missing',
        outline: sync?.outline_sync_status || 'missing',
      },
    };
  }

  private reviewForeshadowing(input: SyncInput, checksum: string): ContinuityReviewStep {
    const rows = this.database.getDb().prepare(`SELECT t.*, e.id event_id, e.event_type, e.evidence
      FROM foreshadowing_threads t JOIN foreshadowing_lifecycle_events e ON e.thread_id=t.id
      WHERE t.project_id=? AND e.chapter_id=?`).all(input.projectId, input.chapterId) as any[];
    const issues: any[] = [];
    for (const row of rows) {
      const evidence = String(row.evidence || '').trim();
      const was = evidence && input.beforeContent.includes(evidence);
      const is = evidence && input.afterContent.includes(evidence);
      if (was && !is) issues.push({ type: row.event_type === 'recovered' ? 'removed_recovery' : 'missing_evidence', target: row.id, requirement: row.title, old: evidence, next: '', severity: row.event_type === 'recovered' ? 'high' : 'medium', block: row.event_type === 'recovered' });
      if (!was && is) issues.push({ type: 'evidence_added', target: row.id, requirement: row.title, old: '', next: evidence, severity: 'low', block: false });
    }
    return this.persistReviews(input, checksum, 'foreshadowing', issues);
  }

  private reviewTimeline(input: SyncInput, checksum: string): ContinuityReviewStep {
    const rows = this.database.getDb().prepare(`SELECT * FROM timeline_three_line_events WHERE project_id=? AND chapter_id=?`).all(input.projectId, input.chapterId) as any[];
    const issues: any[] = [];
    for (const row of rows) {
      const evidence = String(row.summary || row.story_time_text || '').trim();
      if (evidence && input.beforeContent.includes(evidence) && !input.afterContent.includes(evidence)) {
        issues.push({ type: row.review_status === 'confirmed' ? 'confirmed_event_overturned' : 'event_removed', target: row.id, requirement: row.title, old: evidence, next: '', severity: row.review_status === 'confirmed' ? 'high' : 'medium', block: row.review_status === 'confirmed' });
      }
    }
    const timeMarks = input.afterContent.match(/(?:第[一二三四五六七八九十\d]+[天日年月]|\d{4}年\d{1,2}月\d{1,2}日)/g) || [];
    if (timeMarks.length > 1 && new Set(timeMarks).size !== timeMarks.length) {
      issues.push({ type: 'time_order_risk', requirement: '时间标记顺序应保持一致', old: '', next: timeMarks.join(' / '), severity: 'medium', block: false });
    }
    return this.persistReviews(input, checksum, 'timeline', issues);
  }

  private reviewOutline(input: SyncInput, checksum: string, chapter: any): ContinuityReviewStep {
    const outline = chapter.outline_id ? this.database.getDb().prepare('SELECT * FROM outlines WHERE id=? AND project_id=?').get(chapter.outline_id, input.projectId) as any : null;
    if (!outline) return { status: 'pending', detail: 'Chapter is not linked to an outline; author review is required', issueCount: 0, blockingCount: 0, reviewIds: [], stateItemIds: [] };
    const issues: any[] = [];
    const requirements = [String(outline.content || ''), ...this.jsonStrings(outline.plot_points), ...this.jsonStrings(outline.scenes)].filter((v) => v.length >= 4);
    for (const requirement of requirements.slice(0, 20)) {
      if (!input.afterContent.includes(requirement)) issues.push({ type: 'missing_requirement', target: outline.id, requirement, old: input.beforeContent.includes(requirement) ? requirement : '', next: '', severity: 'medium', block: false });
    }
    return this.persistReviews(input, checksum, 'outline', issues);
  }

  private persistReviews(input: SyncInput, checksum: string, reviewType: string, issues: any[]): ContinuityReviewStep {
    const db = this.database.getDb(); const now = new Date().toISOString(); const reviewIds: string[] = []; const stateItemIds: string[] = [];
    for (const issue of issues) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const id = randomUUID();
        db.prepare(`INSERT INTO chapter_continuity_reviews (id,project_id,chapter_id,content_checksum,review_type,issue_type,target_id,requirement,old_evidence,new_evidence,change_type,severity,blocks_lock,status,state_item_id,payload,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(chapter_id,content_checksum,review_type,issue_type,target_id) DO NOTHING`)
          .run(id,input.projectId,input.chapterId,checksum,reviewType,issue.type,issue.target||'',issue.requirement||null,issue.old||null,issue.next||null,issue.type,issue.severity,issue.block?1:0,issue.block?'conflict':'pending',null,JSON.stringify(issue),now,now);
        let row = db.prepare(`SELECT id,state_item_id FROM chapter_continuity_reviews WHERE chapter_id=? AND content_checksum=? AND review_type=? AND issue_type=? AND target_id=?`).get(input.chapterId,checksum,reviewType,issue.type,issue.target||'') as any;
        if (!row.state_item_id && this.stateItems) {
          const dedupeKey = [input.chapterId, checksum, reviewType, issue.type, issue.target || ''].join(':');
          const summary = `${reviewType}:${issue.type}:${dedupeKey}`;
          const state = this.stateItems.create(input.projectId, { sourceType: 'chapter_continuity_recheck', sourceId: dedupeKey, sourceChapterId: input.chapterId, targetType: reviewType, targetId: issue.target, title: summary, summary, content: issue.next || issue.old, payload: { dedupeKey, oldEvidence: issue.old, newEvidence: issue.next, changeType: issue.type, severity: issue.severity, blocksLock: issue.block }, status: issue.block ? 'conflict' : 'pending', authority: 'soft_candidate', source: 'chapter_recheck', createdBy: 'chapter-derived-sync' });
          db.prepare('UPDATE chapter_continuity_reviews SET state_item_id=?,updated_at=? WHERE id=? AND state_item_id IS NULL').run(state.id,now,row.id);
          row = { ...row, state_item_id: state.id };
        }
        db.exec('COMMIT'); reviewIds.push(row.id); if (row.state_item_id) stateItemIds.push(row.state_item_id);
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    }
    const blocking = issues.filter((x) => x.block).length;
    return { status: 'completed', detail: `Persisted ${issues.length} ${reviewType} review finding(s)`, issueCount: issues.length, blockingCount: blocking, reviewIds, stateItemIds };
  }

  private jsonStrings(raw: string): string[] { try { const value=JSON.parse(raw||'[]'); const out:string[]=[]; const walk=(v:any)=>{ if(typeof v==='string') out.push(v.trim()); else if(Array.isArray(v)) v.forEach(walk); else if(v&&typeof v==='object') Object.values(v).forEach(walk); }; walk(value); return out; } catch { return []; } }

  private async syncChapterSummary(
    input: SyncInput,
    contentChecksum: string,
    warnings: string[],
  ): Promise<ChapterSummaryStep> {
    const db = this.database.getDb();
    const current = db.prepare(
      'SELECT * FROM chapter_summaries WHERE project_id = ? AND chapter_id = ? LIMIT 1'
    ).get(input.projectId, input.chapterId) as any;
    if (current?.content_checksum === contentChecksum && current.status === 'current') {
      return {
        status: 'completed',
        detail: 'Current chapter summary already matches the content checksum (idempotent hit)',
        entityId: current.id,
        checksum: contentChecksum,
      };
    }
    if (current) {
      db.prepare(`UPDATE chapter_summaries SET status = 'stale', updated_at = ? WHERE id = ?`)
        .run(new Date().toISOString(), current.id);
    }

    let llm: RealLLMService | undefined;
    try {
      llm = this.moduleRef.get(RealLLMService, { strict: false });
    } catch {
      llm = undefined;
    }
    if (!llm || !(await llm.isAvailable())) {
      return {
        status: 'pending',
        detail: 'No configured LLM is available; existing summary retained as stale and no fake summary was created',
        entityId: current?.id,
        checksum: contentChecksum,
      };
    }

    try {
      const response = await llm.generate({
        scenario: 'summary',
        temperature: 0.2,
        maxTokens: 900,
        prompt: `请为以下小说章节生成结构化但简洁的章节摘要。必须覆盖：核心事件、主要人物行动、明确状态变化、关系变化、重要地点、新增信息、伏笔动作、本章结尾状态。只输出摘要正文，不要虚构正文中不存在的信息，不要扩展为文学评论。\n\n章节正文：\n${input.afterContent.slice(0, 24000)}`,
      });
      const summary = response.content.trim();
      if (!summary) throw new Error('Summary model returned empty content');
      const now = new Date().toISOString();
      const id = current?.id || randomUUID();
      db.prepare(`
        INSERT INTO chapter_summaries (
          id, project_id, chapter_id, content_checksum, summary, source, status, generated_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'ai', 'current', ?, ?)
        ON CONFLICT(chapter_id) DO UPDATE SET
          project_id = excluded.project_id,
          content_checksum = excluded.content_checksum,
          summary = excluded.summary,
          source = excluded.source,
          status = 'current',
          generated_at = excluded.generated_at,
          updated_at = excluded.updated_at
      `).run(id, input.projectId, input.chapterId, contentChecksum, summary, now, now);
      return { status: 'completed', detail: 'Chapter summary generated and persisted', entityId: id, checksum: contentChecksum };
    } catch (error) {
      const message = this.errorMessage(error);
      warnings.push(`Chapter summary sync failed: ${message}`);
      this.logger.warn(`chapter=${input.chapterId} summary sync failed: ${message}`);
      return {
        status: 'warning',
        detail: `Summary generation failed; existing summary retained as stale: ${message}`,
        entityId: current?.id,
        checksum: contentChecksum,
      };
    }
  }

  private invalidateAggregateSummaries(
    input: SyncInput,
    volumeIndex: number,
    contentChecksum: string,
  ): AggregateSummaryStep {
    const db = this.database.getDb();
    const now = new Date().toISOString();
    const targets = [
      { scope: 'volume', volume: Number(volumeIndex), id: `volume:${volumeIndex}` },
      { scope: 'novel', volume: -1, id: `novel:${input.projectId}` },
    ];
    db.exec('BEGIN IMMEDIATE');
    try {
      const stmt = db.prepare(`
        INSERT INTO aggregate_summary_states (
          id, project_id, scope, volume_index, stale, stale_reason,
          source_chapter_id, source_chapter_checksum, stale_at, updated_at
        ) VALUES (?, ?, ?, ?, 1, 'chapter_content_changed', ?, ?, ?, ?)
        ON CONFLICT(project_id, scope, volume_index) DO UPDATE SET
          stale = 1,
          stale_reason = 'chapter_content_changed',
          source_chapter_id = excluded.source_chapter_id,
          source_chapter_checksum = excluded.source_chapter_checksum,
          stale_at = excluded.stale_at,
          updated_at = excluded.updated_at
      `);
      for (const target of targets) {
        stmt.run(randomUUID(), input.projectId, target.scope, target.volume, input.chapterId, contentChecksum, now, now);
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return {
      status: 'completed',
      detail: `Persistently marked ${targets.map((target) => target.id).join(', ')} as stale`,
      staleTargets: targets.map((target) => target.id),
    };
  }

  private async syncVectorIndex(
    input: SyncInput,
    chapter: any,
    contentChecksum: string,
    warnings: string[],
  ): Promise<VectorIndexStep> {
    const collection = VectorIndexService.COLLECTIONS.CHAPTERS_ROLLING;
    let oldChunks: Awaited<ReturnType<VectorIndexService['getChunksByMetadata']>>;
    try {
      oldChunks = await this.vectorIndex.getChunksByMetadata(collection, { chapterId: input.chapterId });
    } catch (error) {
      const message = this.errorMessage(error);
      warnings.push(`Vector index lookup failed: ${message}`);
      return {
        status: 'warning', detail: message, checksum: contentChecksum,
        deletedChunks: 0, createdChunks: 0, retainedOldIndex: true,
      };
    }

    const rawChunks = this.chunker.split(input.afterContent, 'chapter', input.chapterId);
    const versionRow = this.database.getDb().prepare(
      `SELECT COALESCE(MAX(version), 0) AS version FROM version_history WHERE entity_type = 'chapter' AND entity_id = ?`
    ).get(input.chapterId) as { version: number };
    const indexedAt = new Date().toISOString();
    const chunks = rawChunks.map((chunk, index) => ({
      ...chunk,
      id: `chapter:${input.chapterId}:${contentChecksum}:chunk:${index}`,
      metadata: {
        ...chunk.metadata,
        projectId: input.projectId,
        chapterId: input.chapterId,
        volumeIndex: Number(chapter.volume_index),
        chapterIndex: Number(chapter.chapter_index),
        contentChecksum,
        chunkIndex: index,
        indexedAt,
        version: Number(versionRow?.version || 0),
      },
    }));
    const currentOld = oldChunks.filter((chunk) => chunk.metadata.contentChecksum === contentChecksum);
    if (currentOld.length === chunks.length && chunks.every((chunk) => currentOld.some((old) => old.id === chunk.id))) {
      return {
        status: 'completed', detail: 'Chapter vector chunks already match the content checksum (idempotent hit)',
        checksum: contentChecksum, deletedChunks: 0, createdChunks: 0, retainedOldIndex: false,
      };
    }

    const availability = this.embedding.getAvailability();
    if (!availability.available) {
      const detail = `Embedding provider unavailable: ${availability.reason}; old index retained`;
      warnings.push(detail);
      return {
        status: 'warning', detail, checksum: contentChecksum, deletedChunks: 0,
        createdChunks: 0, retainedOldIndex: true,
        previousChecksum: oldChunks[0]?.metadata.contentChecksum as string | undefined,
      };
    }

    try {
      const vectors = await this.embedding.embed(chunks.map((chunk) => chunk.text));
      if (vectors.length !== chunks.length) throw new Error('Embedding count does not match chunk count');
      await this.vectorIndex.upsertChunksStrict(collection, chunks.map((chunk, index) => ({
        id: chunk.id,
        vector: vectors[index],
        metadata: { text: chunk.text, docType: chunk.docType, ...chunk.metadata },
      })));
      const written = await this.vectorIndex.getChunksByMetadata(collection, {
        chapterId: input.chapterId,
        contentChecksum,
      });
      if (written.length !== chunks.length || !chunks.every((chunk) => written.some((row) => row.id === chunk.id))) {
        throw new Error(`Vector write verification failed: expected ${chunks.length}, found ${written.length}`);
      }
      const oldIds = oldChunks.filter((chunk) => chunk.metadata.contentChecksum !== contentChecksum).map((chunk) => chunk.id);
      await this.vectorIndex.deleteChunksStrict(collection, oldIds);
      return {
        status: 'completed', detail: 'New vectors written and verified before old vector chunks were removed',
        checksum: contentChecksum, previousChecksum: oldChunks[0]?.metadata.contentChecksum as string | undefined,
        deletedChunks: oldIds.length, createdChunks: chunks.length, retainedOldIndex: false,
      };
    } catch (error) {
      const message = this.errorMessage(error);
      warnings.push(`Vector index sync failed: ${message}`);
      this.logger.warn(`chapter=${input.chapterId} vector sync failed: ${message}`);
      return {
        status: 'warning', detail: `Vector synchronization failed; old index retained: ${message}`,
        checksum: contentChecksum, deletedChunks: 0, createdChunks: 0, retainedOldIndex: true,
        previousChecksum: oldChunks[0]?.metadata.contentChecksum as string | undefined,
      };
    }
  }

  private async runConflictReview(input: SyncInput, warnings: string[]): Promise<DerivedSyncStep> {
    if (!this.conflictEngine) return { status: 'pending', detail: 'Conflict engine is unavailable' };
    try {
      const report = await this.conflictEngine.checkOnLock(input.chapterId, input.projectId);
      return { status: 'completed', detail: `Conflict recheck completed with ${report.summary.total} finding(s)` };
    } catch (error) {
      const message = this.errorMessage(error);
      warnings.push(`Conflict recheck failed: ${message}`);
      return { status: 'warning', detail: message };
    }
  }

  private persistSyncState(
    input: SyncInput,
    checksum: string,
    summaryStatus: string, vectorStatus: string, foreshadowingStatus: string, timelineStatus: string, outlineStatus: string,
    needsResync: boolean,
    needsAuthorReview: boolean,
    warnings: string[],
  ): void {
    const now = new Date().toISOString();
    this.database.getDb().prepare(`
      INSERT INTO chapter_derived_sync_states (
        chapter_id, project_id, content_checksum, summary_sync_status, vector_sync_status,
        foreshadowing_sync_status, timeline_sync_status, outline_sync_status,
        needs_resync, needs_author_review, last_error, last_attempt_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(chapter_id) DO UPDATE SET
        project_id = excluded.project_id,
        content_checksum = excluded.content_checksum,
        summary_sync_status = excluded.summary_sync_status,
        vector_sync_status = excluded.vector_sync_status,
        foreshadowing_sync_status = excluded.foreshadowing_sync_status,
        timeline_sync_status = excluded.timeline_sync_status,
        outline_sync_status = excluded.outline_sync_status,
        needs_resync = excluded.needs_resync,
        needs_author_review = excluded.needs_author_review,
        last_error = excluded.last_error,
        last_attempt_at = excluded.last_attempt_at,
        updated_at = excluded.updated_at
    `).run(input.chapterId, input.projectId, checksum, summaryStatus, vectorStatus, foreshadowingStatus, timelineStatus, outlineStatus, needsResync ? 1 : 0, needsAuthorReview ? 1 : 0, warnings.length ? JSON.stringify(warnings) : null, now, now);
  }

  private checksum(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
