import { describe, expect, it, vi } from 'vitest';
import { ConflictEngineService } from '../conflict-engine/conflict-engine.service';
import { ChapterDerivedDataSyncService } from './chapter-derived-data-sync.service';

const input = {
  projectId: 'project-1', chapterId: 'chapter-1', beforeContent: 'before',
  afterContent: 'after', reason: 'manual_save' as const,
};

describe('ChapterDerivedDataSyncService', () => {
  it('reports unavailable downstream operations as pending instead of success', async () => {
    const service = new ChapterDerivedDataSyncService();
    const result = await service.syncAfterContentChange(input);
    expect(result.success).toBe(false);
    expect(result.steps.vectorIndex.status).toBe('pending');
    expect(result.steps.conflictReview.status).toBe('pending');
  });

  it('runs the existing conflict recheck and still reports remaining work as incomplete', async () => {
    const conflictEngine = {
      checkOnLock: vi.fn(async () => ({ summary: { total: 2 } })),
    } as unknown as ConflictEngineService;
    const service = new ChapterDerivedDataSyncService(conflictEngine);
    const result = await service.syncAfterContentChange(input);
    expect(conflictEngine.checkOnLock).toHaveBeenCalledWith('chapter-1', 'project-1');
    expect(result.steps.conflictReview.status).toBe('completed');
    expect(result.success).toBe(false);
  });

  it('surfaces conflict recheck failures as warnings', async () => {
    const conflictEngine = {
      checkOnLock: vi.fn(async () => { throw new Error('conflict storage offline'); }),
    } as unknown as ConflictEngineService;
    const service = new ChapterDerivedDataSyncService(conflictEngine);
    const result = await service.syncAfterContentChange(input);
    expect(result.success).toBe(false);
    expect(result.steps.conflictReview.status).toBe('warning');
    expect(result.warnings[0]).toContain('conflict storage offline');
  });
});
