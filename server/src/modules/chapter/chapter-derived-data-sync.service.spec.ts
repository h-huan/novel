import { ModuleRef } from '@nestjs/core';
import { createHash } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RealLLMService } from '../../chain/real-llm.service';
import { DatabaseService } from '../../database/database.service';
import { ChunkerService } from '../../rag/chunker.service';
import { EmbeddingService } from '../../rag/embedding.service';
import { VectorIndexService } from '../../rag/vector-index.service';
import { ConflictEngineService } from '../conflict-engine/conflict-engine.service';
import { ChapterDerivedDataSyncService } from './chapter-derived-data-sync.service';

const input = {
  projectId: 'project-1', chapterId: 'chapter-1', beforeContent: 'before',
  afterContent: '新正文发生了重要事件，主角抵达北城并发现旧信。', reason: 'manual_save' as const,
};
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

class FakeDatabase {
  chapters = new Map<string, any>();
  summaries = new Map<string, any>();
  aggregates = new Map<string, any>();
  syncStates = new Map<string, any>();
  version = 3;

  exec(_sql: string): void {}

  prepare(sql: string) {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    return {
      get: (...args: any[]) => this.get(normalized, args),
      all: (...args: any[]) => this.all(normalized, args),
      run: (...args: any[]) => { this.run(normalized, args); return { changes: 1 }; },
    };
  }

  private get(sql: string, args: any[]): any {
    if (sql.includes('from chapters')) {
      const row = this.chapters.get(args[0]);
      return row && (!args[1] || row.project_id === args[1]) ? row : undefined;
    }
    if (sql.includes('from chapter_summaries') && sql.includes('count(*)')) {
      return { count: this.summaries.size };
    }
    if (sql.includes('from chapter_summaries')) return this.summaries.get(args[1] || args[0]);
    if (sql.includes('max(version)')) return { version: this.version };
    if (sql.includes('from chapter_derived_sync_states')) return this.syncStates.get(args[0]);
    return undefined;
  }

  private all(sql: string, _args: any[]): any[] {
    if (sql.includes('from aggregate_summary_states')) {
      return [...this.aggregates.values()].sort((a, b) => a.scope.localeCompare(b.scope));
    }
    return [];
  }

  private run(sql: string, args: any[]): void {
    if (sql.startsWith('update chapters set content')) {
      const row = this.chapters.get(args[1]);
      if (row) row.content = args[0];
      return;
    }
    if (sql.startsWith("update chapter_summaries set status = 'stale'")) {
      for (const row of this.summaries.values()) if (row.id === args[1]) { row.status = 'stale'; row.updated_at = args[0]; }
      return;
    }
    if (sql.startsWith('insert into chapter_summaries')) {
      const [id, projectId, chapterId, checksum, summary, generatedAt, updatedAt] = args;
      this.summaries.set(chapterId, {
        id, project_id: projectId, chapter_id: chapterId, content_checksum: checksum,
        summary, source: 'ai', status: 'current', generated_at: generatedAt, updated_at: updatedAt,
      });
      return;
    }
    if (sql.startsWith('insert into aggregate_summary_states')) {
      const [id, projectId, scope, volumeIndex, sourceChapterId, sourceChecksum, staleAt, updatedAt] = args;
      this.aggregates.set(`${projectId}:${scope}:${volumeIndex}`, {
        id, project_id: projectId, scope, volume_index: volumeIndex, stale: 1,
        stale_reason: 'chapter_content_changed', source_chapter_id: sourceChapterId,
        source_chapter_checksum: sourceChecksum, stale_at: staleAt, updated_at: updatedAt,
      });
      return;
    }
    if (sql.startsWith('insert into chapter_derived_sync_states')) {
      const [chapterId, projectId, checksum, summaryStatus, vectorStatus, foreshadowingStatus, timelineStatus, outlineStatus, needsResync, needsAuthorReview, lastError, lastAttemptAt, updatedAt] = args;
      this.syncStates.set(chapterId, {
        chapter_id: chapterId, project_id: projectId, content_checksum: checksum,
        summary_sync_status: summaryStatus, vector_sync_status: vectorStatus,
        foreshadowing_sync_status: foreshadowingStatus, timeline_sync_status: timelineStatus,
        outline_sync_status: outlineStatus, needs_resync: needsResync, needs_author_review: needsAuthorReview,
        last_error: lastError, last_attempt_at: lastAttemptAt, updated_at: updatedAt,
      });
    }
  }
}

describe('ChapterDerivedDataSyncService', () => {
  let db: FakeDatabase;
  let llm: { isAvailable: ReturnType<typeof vi.fn>; generate: ReturnType<typeof vi.fn> };
  let embedding: { getAvailability: ReturnType<typeof vi.fn>; embed: ReturnType<typeof vi.fn> };
  let vectorRows: Array<{ id: string; vector: number[]; metadata: Record<string, unknown> }>;
  let events: string[];
  let vectorIndex: VectorIndexService;
  let conflictEngine: ConflictEngineService;
  let service: ChapterDerivedDataSyncService;

  beforeEach(() => {
    db = new FakeDatabase();
    db.chapters.set(input.chapterId, {
      id: input.chapterId, project_id: input.projectId, volume_index: 2,
      chapter_index: 7, content: input.afterContent, checksum: sha(input.afterContent),
    });

    llm = {
      isAvailable: vi.fn(async () => true),
      generate: vi.fn(async () => ({ content: '核心事件；人物行动；状态与关系变化；地点；新增信息；伏笔；结尾状态。' })),
    };
    embedding = {
      getAvailability: vi.fn(() => ({ available: true, model: 'real-embedding-model' })),
      embed: vi.fn(async (texts: string[]) => texts.map((_text, index) => [index + 0.1, index + 0.2])),
    };
    vectorRows = [];
    events = [];
    vectorIndex = {
      getChunksByMetadata: vi.fn(async (_collection: string, filters: Record<string, unknown>) =>
        vectorRows.filter((row) => Object.entries(filters).every(([key, value]) => row.metadata[key] === value))),
      upsertChunksStrict: vi.fn(async (_collection: string, rows: typeof vectorRows) => {
        events.push('write');
        for (const row of rows) {
          vectorRows = vectorRows.filter((existing) => existing.id !== row.id);
          vectorRows.push(row);
        }
      }),
      deleteChunksStrict: vi.fn(async (_collection: string, ids: string[]) => {
        events.push('delete');
        vectorRows = vectorRows.filter((row) => !ids.includes(row.id));
      }),
    } as unknown as VectorIndexService;
    conflictEngine = {
      checkOnLock: vi.fn(async () => ({ summary: { total: 0 } })),
    } as unknown as ConflictEngineService;
    const database = { getDb: () => db } as unknown as DatabaseService;
    const moduleRef = { get: vi.fn(() => llm as unknown as RealLLMService) } as unknown as ModuleRef;
    service = new ChapterDerivedDataSyncService(
      database, new ChunkerService(), vectorIndex, embedding as unknown as EmbeddingService,
      moduleRef, conflictEngine,
    );
  });

  it('updates and persists a checksum-bound chapter summary', async () => {
    const result = await service.syncAfterContentChange(input);
    const row = db.prepare('SELECT * FROM chapter_summaries WHERE chapter_id = ?').get(input.chapterId) as any;
    expect(result.steps.chapterSummary.status).toBe('completed');
    expect(row.content_checksum).toBe(sha(input.afterContent));
    expect(row.status).toBe('current');
    expect(row.summary).toContain('核心事件');
  });

  it('does not regenerate a summary when the checksum already matches', async () => {
    await service.syncAfterContentChange(input);
    llm.generate.mockClear();
    const result = await service.syncAfterContentChange(input);
    expect(result.steps.chapterSummary.detail).toContain('idempotent hit');
    expect(llm.generate).not.toHaveBeenCalled();
  });

  it('retains the old summary as stale when summary generation fails', async () => {
    await service.syncAfterContentChange(input);
    const changed = { ...input, afterContent: `${input.afterContent}后来局势改变。` };
    db.prepare('UPDATE chapters SET content = ? WHERE id = ?').run(changed.afterContent, input.chapterId);
    llm.generate.mockRejectedValueOnce(new Error('summary provider offline'));
    const result = await service.syncAfterContentChange(changed);
    const row = db.prepare('SELECT * FROM chapter_summaries WHERE chapter_id = ?').get(input.chapterId) as any;
    expect(result.steps.chapterSummary.status).toBe('warning');
    expect(row.status).toBe('stale');
    expect(row.summary).toContain('核心事件');
  });

  it('does not create a fake summary when no model is configured', async () => {
    llm.isAvailable.mockResolvedValue(false);
    const result = await service.syncAfterContentChange(input);
    expect(result.steps.chapterSummary.status).toBe('pending');
    expect(db.prepare('SELECT COUNT(*) AS count FROM chapter_summaries').get() as any).toEqual({ count: 0 });
  });

  it('persistently marks volume and novel summaries stale', async () => {
    const result = await service.syncAfterContentChange(input);
    const rows = db.prepare('SELECT * FROM aggregate_summary_states ORDER BY scope').all() as any[];
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.stale === 1 && row.stale_reason === 'chapter_content_changed')).toBe(true);
    expect(result.steps.aggregateSummaries.staleTargets).toEqual(['volume:2', 'novel:project-1']);
  });

  it('writes and verifies new vectors before deleting old chunks', async () => {
    vectorRows.push({ id: 'old', vector: [0.4, 0.5], metadata: { chapterId: input.chapterId, contentChecksum: 'old' } });
    const result = await service.syncAfterContentChange(input);
    expect(events).toEqual(['write', 'delete']);
    expect(result.steps.vectorIndex.status).toBe('completed');
    expect(result.steps.vectorIndex.deletedChunks).toBe(1);
    expect(vectorRows.some((row) => row.id === 'old')).toBe(false);
  });

  it('retains the old index when embedding fails', async () => {
    vectorRows.push({ id: 'old', vector: [0.4, 0.5], metadata: { chapterId: input.chapterId, contentChecksum: 'old' } });
    embedding.embed.mockRejectedValueOnce(new Error('embedding offline'));
    const result = await service.syncAfterContentChange(input);
    expect(result.steps.vectorIndex.status).toBe('warning');
    expect(result.steps.vectorIndex.retainedOldIndex).toBe(true);
    expect(vectorRows.some((row) => row.id === 'old')).toBe(true);
    expect(vectorIndex.deleteChunksStrict).not.toHaveBeenCalled();
  });

  it('retains the old index when new vector writes fail', async () => {
    vectorRows.push({ id: 'old', vector: [0.4, 0.5], metadata: { chapterId: input.chapterId, contentChecksum: 'old' } });
    (vectorIndex.upsertChunksStrict as any).mockRejectedValueOnce(new Error('vector disk full'));
    const result = await service.syncAfterContentChange(input);
    expect(result.steps.vectorIndex.status).toBe('warning');
    expect(vectorRows.some((row) => row.id === 'old')).toBe(true);
    expect(vectorIndex.deleteChunksStrict).not.toHaveBeenCalled();
  });

  it('does not duplicate chunks when the same content is synchronized twice', async () => {
    await service.syncAfterContentChange(input);
    const count = vectorRows.length;
    (vectorIndex.upsertChunksStrict as any).mockClear();
    const result = await service.syncAfterContentChange(input);
    expect(result.steps.vectorIndex.detail).toContain('idempotent hit');
    expect(vectorRows).toHaveLength(count);
    expect(vectorIndex.upsertChunksStrict).not.toHaveBeenCalled();
  });

  it('stores project, chapter, checksum, text and version metadata on each chunk', async () => {
    await service.syncAfterContentChange(input);
    expect(vectorRows[0].metadata).toEqual(expect.objectContaining({
      projectId: input.projectId,
      chapterId: input.chapterId,
      contentChecksum: sha(input.afterContent),
      text: expect.any(String),
      version: 3,
    }));
    expect(vectorRows[0].id).toMatch(/^chapter:chapter-1:[a-f0-9]{64}:chunk:0$/);
  });

  it('marks the chapter as needing resync when the embedding provider is unavailable', async () => {
    embedding.getAvailability.mockReturnValue({ available: false, reason: 'missing key' });
    const result = await service.syncAfterContentChange(input);
    const state = db.prepare('SELECT * FROM chapter_derived_sync_states WHERE chapter_id = ?').get(input.chapterId) as any;
    expect(result.steps.vectorIndex.status).toBe('warning');
    expect(state.needs_resync).toBe(1);
    expect(state.last_error).toContain('missing key');
  });

  it('continues to invoke the existing conflict review', async () => {
    const result = await service.syncAfterContentChange(input);
    expect(conflictEngine.checkOnLock).toHaveBeenCalledWith(input.chapterId, input.projectId);
    expect(result.steps.conflictReview.status).toBe('completed');
    expect(result.fullSyncSuccess).toBe(false);
  });
});
