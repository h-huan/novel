import { createHash } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChapterRepository } from '../../database/repositories/chapter.repository';
import type { ChapterRow } from '../../database/repositories/chapter.repository';
import { VersionHistoryRepository } from '../../database/repositories/version-history.repository';
import { StateItemService } from '../../state/state-item.service';
import { ChapterDerivedDataSyncService } from './chapter-derived-data-sync.service';
import { ChapterService } from './chapter.service';

describe('ChapterService', () => {
  let service: ChapterService;
  let repo: ChapterRepository;
  let versionRepo: VersionHistoryRepository;
  let stateItemService: StateItemService;
  let derivedDataSync: ChapterDerivedDataSyncService;
  let row: ChapterRow;

  const checksum = (content: string) => createHash('sha256').update(content, 'utf8').digest('hex');

  beforeEach(() => {
    row = {
      id: 'chapter-1', project_id: 'project-1', outline_id: null,
      volume_index: 1, chapter_index: 1, title: '第一章', content: '旧正文',
      word_count: 3, status: 'draft', tianlong_8steps: null, model_config: null,
      hook_type: null, transition_mode: null, transition_context: null, authors_notes: null,
      quality_score: null, checksum: checksum('旧正文'), file_path: null,
      created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', locked_at: null,
    };

    repo = {
      findById: vi.fn(() => row), insert: vi.fn(), update: vi.fn((_id, patch) => {
        row = { ...row, ...patch } as ChapterRow;
        return row;
      }), delete: vi.fn(), findByProjectId: vi.fn(() => []), findByVolumeChapter: vi.fn(),
      findByVolume: vi.fn(), lockChapter: vi.fn(() => { row = { ...row, status: 'locked' }; return row; }),
      unlockChapter: vi.fn(() => { row = { ...row, status: 'draft' }; return row; }),
      submitForReview: vi.fn(() => { row = { ...row, status: 'reviewing' }; return row; }),
      updateContent: vi.fn(), getPrevChapter: vi.fn(), getStatusStats: vi.fn(), totalWordCount: vi.fn(),
    } as unknown as ChapterRepository;

    versionRepo = {
      getLatestVersion: vi.fn(() => 0), getLatest: vi.fn(), getVersions: vi.fn(() => []),
      getVersion: vi.fn(), insert: vi.fn(),
    } as unknown as VersionHistoryRepository;

    stateItemService = {
      createFromManualChapterEdit: vi.fn(() => ({ created: [{ id: 'state-1' }], impactReport: {} })),
    } as unknown as StateItemService;
    derivedDataSync = {
      syncAfterContentChange: vi.fn(async () => ({ success: true, chapterId: row.id, steps: {}, warnings: [] })),
    } as unknown as ChapterDerivedDataSyncService;
    service = new ChapterService(repo, versionRepo, stateItemService, derivedDataSync);
  });

  it('creates a chapter', () => {
    (repo.findByVolumeChapter as any).mockReturnValue(undefined);
    const result = service.create('project-1', { volumeIndex: 1, chapterIndex: 1, title: '第一章' });
    expect(result.title).toBe('第一章');
  });

  it('creates an old-content version before a normal content save', async () => {
    await service.update(row.id, { content: '新正文' });
    expect(versionRepo.insert).toHaveBeenCalledWith(expect.objectContaining({
      entity_id: row.id, version: 1, snapshot: '旧正文', checksum: checksum('旧正文'),
      change_summary: 'Automatic snapshot before content save', created_by: 'author',
    }));
    expect(repo.update).toHaveBeenCalledWith(row.id, expect.objectContaining({
      content: '新正文', checksum: checksum('新正文'),
    }));
  });

  it('does not create a version when identical content is saved', async () => {
    await service.update(row.id, { content: '旧正文' });
    expect(versionRepo.insert).not.toHaveBeenCalled();
    expect(stateItemService.createFromManualChapterEdit).not.toHaveBeenCalled();
  });

  it('does not create a content version for title-only changes', async () => {
    await service.update(row.id, { title: '新标题' });
    expect(versionRepo.insert).not.toHaveBeenCalled();
  });

  it('locks a reviewing chapter with exactly one deduplicated snapshot', () => {
    row = { ...row, status: 'reviewing' };
    const result = service.lock(row.id);
    expect(result.status).toBe('locked');
    expect(versionRepo.insert).toHaveBeenCalledTimes(1);
    expect(versionRepo.insert).toHaveBeenCalledWith(expect.objectContaining({
      snapshot: '旧正文', checksum: checksum('旧正文'), change_summary: 'Chapter lock snapshot',
    }));
  });

  it('does not duplicate a lock snapshot already stored as the latest version', () => {
    row = { ...row, status: 'reviewing' };
    (versionRepo.getLatest as any).mockReturnValue({ version: 2, snapshot: row.content, checksum: checksum(row.content) });
    service.lock(row.id);
    expect(versionRepo.insert).not.toHaveBeenCalled();
  });

  it('saves current content before restoring a historical version', async () => {
    (versionRepo.getVersion as any).mockReturnValue({ version: 1, snapshot: '历史正文' });
    await service.restoreVersion(row.id, 1);
    expect(versionRepo.insert).toHaveBeenCalledWith(expect.objectContaining({
      snapshot: '旧正文', change_summary: 'Automatic snapshot before restoring version 1',
    }));
  });

  it('recounts words and updates checksum after restore', async () => {
    const restored = '中文 test words';
    (versionRepo.getVersion as any).mockReturnValue({ version: 1, snapshot: restored });
    const result = await service.restoreVersion(row.id, 1);
    expect(result.wordCount).toBe(4);
    expect(result.checksum).toBe(checksum(restored));
    expect(repo.update).toHaveBeenCalledWith(row.id, expect.objectContaining({
      content: restored, word_count: 4, checksum: checksum(restored),
    }));
  });

  it('runs manual state sync after restore', async () => {
    (versionRepo.getVersion as any).mockReturnValue({ version: 1, snapshot: '历史正文' });
    const result = await service.restoreVersion(row.id, 1);
    expect(stateItemService.createFromManualChapterEdit).toHaveBeenCalledWith(
      'project-1', row.id, '旧正文', '历史正文',
    );
    expect(result.stateSync?.stateCandidates).toBeDefined();
    expect(derivedDataSync.syncAfterContentChange).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'version_restore', beforeContent: '旧正文', afterContent: '历史正文',
    }));
  });

  it('forbids restoring a locked chapter', async () => {
    row = { ...row, status: 'locked' };
    (versionRepo.getVersion as any).mockReturnValue({ version: 1, snapshot: '历史正文' });
    await expect(service.restoreVersion(row.id, 1)).rejects.toThrow('unlock it first');
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('returns a warning when state sync fails', async () => {
    (versionRepo.getVersion as any).mockReturnValue({ version: 1, snapshot: '历史正文' });
    (stateItemService.createFromManualChapterEdit as any).mockImplementation(() => { throw new Error('state offline'); });
    const result = await service.restoreVersion(row.id, 1);
    expect(result.stateSync?.warning).toContain('state offline');
  });

  it('returns without another snapshot when restored content equals current content', async () => {
    (versionRepo.getVersion as any).mockReturnValue({ version: 1, snapshot: row.content });
    const result = await service.restoreVersion(row.id, 1);
    expect(result.content).toBe(row.content);
    expect(versionRepo.insert).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('submits and unlocks chapters through the existing state machine', () => {
    expect(service.submitForReview(row.id).status).toBe('reviewing');
    row = { ...row, status: 'locked' };
    expect(service.unlock(row.id).status).toBe('draft');
  });
});
