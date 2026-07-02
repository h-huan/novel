/**
 * ChapterService 单元测试
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChapterService } from './chapter.service';
import { ChapterRepository } from '../../database/repositories/chapter.repository';
import { VersionHistoryRepository } from '../../database/repositories/version-history.repository';

describe('ChapterService', () => {
  let service: ChapterService;
  let repo: ChapterRepository;
  let versionRepo: VersionHistoryRepository;

  const mockDbRow = {
    id: 'chapter-1',
    project_id: 'project-1',
    outline_id: null,
    volume_index: 1,
    chapter_index: 1,
    title: '第一章',
    content: '正文内容',
    word_count: 100,
    status: 'draft',
    tianlong_8steps: null,
    model_config: null,
    hook_type: null,
    transition_mode: null,
    transition_context: null,
    authors_notes: null,
    quality_score: null,
    checksum: null,
    file_path: null,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
    locked_at: null,
  };

  beforeEach(() => {
    repo = {
      findById: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findByProjectId: vi.fn(),
      findByVolumeChapter: vi.fn(),
      findByVolume: vi.fn(),
      lockChapter: vi.fn(),
      unlockChapter: vi.fn(),
      submitForReview: vi.fn(),
      updateContent: vi.fn(),
      getPrevChapter: vi.fn(),
      getStatusStats: vi.fn(),
      totalWordCount: vi.fn(),
    } as unknown as ChapterRepository;

    versionRepo = {
      getLatestVersion: vi.fn(),
      getVersions: vi.fn(),
      getVersion: vi.fn(),
      insert: vi.fn(),
    } as unknown as VersionHistoryRepository;

    service = new ChapterService(repo, versionRepo);
  });

  describe('create', () => {
    it('should create a chapter', () => {
      (repo.findByVolumeChapter as any).mockReturnValue(undefined);
      (repo.findById as any).mockReturnValue(mockDbRow);

      const result = service.create('project-1', {
        volumeIndex: 1,
        chapterIndex: 1,
        title: '第一章',
      });

      expect(result.title).toBe('第一章');
      expect(result.status).toBe('draft');
    });

    it('should throw if chapter already exists', () => {
      (repo.findByVolumeChapter as any).mockReturnValue(mockDbRow);

      expect(() =>
        service.create('project-1', { volumeIndex: 1, chapterIndex: 1, title: '重复' })
      ).toThrow();
    });
  });

  describe('state machine', () => {
    it('should submit draft for review', () => {
      (repo.findById as any).mockReturnValue({ ...mockDbRow, status: 'draft' });
      (repo.submitForReview as any).mockReturnValue({ ...mockDbRow, status: 'reviewing' });

      const result = service.submitForReview('chapter-1');
      expect(result.status).toBe('reviewing');
    });

    it('should lock reviewing chapter', () => {
      (repo.findById as any).mockReturnValue({ ...mockDbRow, status: 'reviewing' });
      (repo.lockChapter as any).mockReturnValue({ ...mockDbRow, status: 'locked' });
      (versionRepo.getLatestVersion as any).mockReturnValue(0);

      const result = service.lock('chapter-1');
      expect(result.status).toBe('locked');
      expect(versionRepo.insert).toHaveBeenCalled();
    });

    it('should unlock locked chapter', () => {
      (repo.findById as any).mockReturnValue({ ...mockDbRow, status: 'locked' });
      (repo.unlockChapter as any).mockReturnValue({ ...mockDbRow, status: 'draft' });

      const result = service.unlock('chapter-1');
      expect(result.status).toBe('draft');
    });

    it('should prevent modifying locked chapter', () => {
      (repo.findById as any).mockReturnValue({ ...mockDbRow, status: 'locked' });

      expect(() =>
        service.update('chapter-1', { title: '修改' })
      ).toThrow();
    });
  });

  describe('version history', () => {
    it('should return version list', () => {
      (repo.findById as any).mockReturnValue(mockDbRow);
      (versionRepo.getVersions as any).mockReturnValue([{
        id: 'v1',
        entity_type: 'chapter',
        entity_id: 'chapter-1',
        version: 1,
        snapshot: '旧内容',
        checksum: null,
        change_summary: 'locked',
        created_by: 'system',
        created_at: '2025-01-01',
      }]);

      const versions = service.getVersionHistory('chapter-1');
      expect(versions.length).toBe(1);
      expect(versions[0].version).toBe(1);
    });

    it('should restore version', () => {
      (repo.findById as any).mockReturnValue(mockDbRow);
      (versionRepo.getVersion as any).mockReturnValue({
        entity_type: 'chapter',
        entity_id: 'chapter-1',
        version: 1,
        snapshot: '恢复内容',
      });

      const result = service.restoreVersion('chapter-1', 1);
      expect(repo.updateContent).toHaveBeenCalledWith('chapter-1', '恢复内容', 100);
    });
  });

  describe('update content', () => {
    it('should update content and count words', () => {
      (repo.findById as any)
        .mockReturnValueOnce(mockDbRow)
        .mockReturnValueOnce({ ...mockDbRow, content: '中文内容 test content', word_count: 10 });

      const result = service.update('chapter-1', { content: '中文内容 test content' });
      expect(result.wordCount).toBe(10);
    });
  });
});
