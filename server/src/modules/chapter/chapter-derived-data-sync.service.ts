import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { createHash, randomUUID } from 'crypto';
import { RealLLMService } from '../../chain/real-llm.service';
import { DatabaseService } from '../../database/database.service';
import { ChunkerService } from '../../rag/chunker.service';
import { EmbeddingService } from '../../rag/embedding.service';
import { VectorIndexService } from '../../rag/vector-index.service';
import { ConflictEngineService } from '../conflict-engine/conflict-engine.service';

export type DerivedSyncStepStatus = 'completed' | 'pending' | 'warning';
export interface DerivedSyncStep { status: DerivedSyncStepStatus; detail: string; }
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
  reason: 'manual_save' | 'version_restore';
  contentChecksum: string;
  steps: {
    chapterSummary: ChapterSummaryStep;
    aggregateSummaries: AggregateSummaryStep;
    vectorIndex: VectorIndexStep;
    foreshadowingReview: DerivedSyncStep;
    timelineReview: DerivedSyncStep;
    outlineDeviation: DerivedSyncStep;
    conflictReview: DerivedSyncStep;
  };
  warnings: string[];
}

interface SyncInput {
  projectId: string;
  chapterId: string;
  beforeContent: string;
  afterContent: string;
  reason: 'manual_save' | 'version_restore';
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
  ) {}

  async syncAfterContentChange(input: SyncInput): Promise<ChapterDerivedDataSyncResult> {
    const db = this.database.getDb();
    const chapter = db.prepare(`
      SELECT id, project_id, volume_index, chapter_index, content
      FROM chapters WHERE id = ? AND project_id = ?
    `).get(input.chapterId, input.projectId) as any;
    if (!chapter) throw new NotFoundException(`Chapter ${input.chapterId} not found in project ${input.projectId}`);

    const contentChecksum = this.checksum(input.afterContent);
    const warnings: string[] = [];
    this.persistSyncState(input, contentChecksum, 'pending', 'pending', true, null);

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
    const conflictReview = await this.runConflictReview(input, warnings);

    const pending = (detail: string): DerivedSyncStep => ({ status: 'pending', detail });
    const steps: ChapterDerivedDataSyncResult['steps'] = {
      chapterSummary,
      aggregateSummaries,
      vectorIndex,
      foreshadowingReview: pending('Foreshadowing evidence recheck remains scheduled for the next batch'),
      timelineReview: pending('Timeline recheck remains scheduled for the next batch'),
      outlineDeviation: pending('Outline deviation detection remains scheduled for the next batch'),
      conflictReview,
    };
    const coreSyncSuccess = [chapterSummary, aggregateSummaries, vectorIndex]
      .every((step) => step.status === 'completed') && warnings.length === 0;
    const fullSyncSuccess = Object.values(steps).every((step) => step.status === 'completed') && warnings.length === 0;
    this.persistSyncState(
      input,
      contentChecksum,
      chapterSummary.status,
      vectorIndex.status,
      !coreSyncSuccess,
      warnings.length ? warnings.join('; ') : null,
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
    summaryStatus: string,
    vectorStatus: string,
    needsResync: boolean,
    lastError: string | null,
  ): void {
    const now = new Date().toISOString();
    this.database.getDb().prepare(`
      INSERT INTO chapter_derived_sync_states (
        chapter_id, project_id, content_checksum, summary_sync_status, vector_sync_status,
        needs_resync, last_error, last_attempt_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(chapter_id) DO UPDATE SET
        project_id = excluded.project_id,
        content_checksum = excluded.content_checksum,
        summary_sync_status = excluded.summary_sync_status,
        vector_sync_status = excluded.vector_sync_status,
        needs_resync = excluded.needs_resync,
        last_error = excluded.last_error,
        last_attempt_at = excluded.last_attempt_at,
        updated_at = excluded.updated_at
    `).run(input.chapterId, input.projectId, checksum, summaryStatus, vectorStatus, needsResync ? 1 : 0, lastError, now, now);
  }

  private checksum(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
