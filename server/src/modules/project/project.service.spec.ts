/**
 * ProjectService 单元测试
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProjectService } from './project.service';
import { ProjectRepository } from '../../database/repositories/project.repository';

describe('ProjectService', () => {
  let service: ProjectService;
  let repo: ProjectRepository;

  const mockDb = {
    prepare: vi.fn(),
    transaction: vi.fn((fn) => () => fn(mockDb)),
    pragma: vi.fn(),
    close: vi.fn(),
  };

  beforeEach(() => {
    repo = {
      findById: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      search: vi.fn(),
      searchCount: vi.fn(),
      findByStatus: vi.fn(),
      count: vi.fn(),
      paginate: vi.fn(),
      getProjectStats: vi.fn(),
      totalWords: vi.fn(),
      countByStatus: vi.fn(),
      db: mockDb as any,
      databaseService: {} as any,
      tableName: 'projects',
      stmt: {},
      findAll: vi.fn(),
      findByField: vi.fn(),
      updateWordCount: vi.fn(),
      updateStatus: vi.fn(),
      deleteByField: vi.fn(),
      transaction: vi.fn(),
    } as unknown as ProjectRepository;

    service = new ProjectService(repo);
  });

  describe('create', () => {
    it('should create a project with defaults', () => {
      const mockRow = {
        id: 'test-id',
        type: 'long_novel',
        title: '测试项目',
        status: 'idea',
        target_words: 0,
        current_words: 0,
        platform_style: 'fantasy',
        description: null,
        writing_style: null,
        settings: JSON.stringify({ autoSave: true, autoSaveInterval: 30, writingMode: 'semi_auto', immersiveModeEnabled: false, recapEnabled: true, typoCheckEnabled: true, sensitiveWordCheckEnabled: false }),
        created_at: '2025-01-01',
        updated_at: '2025-01-01',
      };

      (repo.findById as any).mockReturnValue(mockRow);
      (repo.insert as any).mockImplementation(() => {});

      const result = service.create({ title: '测试项目', targetWords: 200000 });

      expect(result.title).toBe('测试项目');
      expect(result.id).toBe('test-id');
      expect(repo.insert).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return project by id', () => {
      const mockRow = {
        id: 'test-id',
        type: 'long_novel',
        title: '测试项目',
        status: 'idea',
        target_words: 100000,
        current_words: 5000,
        platform_style: 'fantasy',
        description: null,
        writing_style: null,
        settings: JSON.stringify({ autoSave: true, autoSaveInterval: 30, writingMode: 'semi_auto', immersiveModeEnabled: false, recapEnabled: true, typoCheckEnabled: true, sensitiveWordCheckEnabled: false }),
        created_at: '2025-01-01',
        updated_at: '2025-01-01',
      };

      (repo.findById as any).mockReturnValue(mockRow);

      const result = service.findOne('test-id');
      expect(result.id).toBe('test-id');
    });

    it('should throw NotFoundException for non-existing project', () => {
      (repo.findById as any).mockReturnValue(undefined);
      expect(() => service.findOne('non-existing')).toThrow();
    });
  });

  describe('findAll', () => {
    it('should return paginated results', () => {
      (repo.count as any).mockReturnValue(1);
      (repo.paginate as any).mockReturnValue([{
        id: 'test-id',
        type: 'long_novel',
        title: '测试',
        status: 'idea',
        target_words: 0,
        current_words: 0,
        platform_style: 'fantasy',
        description: null,
        writing_style: null,
        settings: '{"autoSave":true}',
        created_at: '2025-01-01',
        updated_at: '2025-01-01',
      }]);

      const result = service.findAll({ limit: 20, offset: 0 });
      expect(result.total).toBe(1);
      expect(result.data.length).toBe(1);
    });

    it('should search projects', () => {
      (repo.search as any).mockReturnValue([]);
      (repo.searchCount as any).mockReturnValue(0);

      const result = service.findAll({ search: '测试', limit: 20, offset: 0 });
      expect(result.total).toBe(0);
      expect(repo.search).toHaveBeenCalledWith('测试', 20, 0);
    });
  });

  describe('update', () => {
    it('should update project fields', () => {
      const existing = {
        id: 'test-id',
        type: 'long_novel',
        title: '旧标题',
        status: 'idea',
        settings: '{"autoSave":true}',
      };
      const updated = { ...existing, title: '新标题' };

      (repo.findById as any)
        .mockReturnValueOnce(existing)
        .mockReturnValueOnce(updated);

      const result = service.update('test-id', { title: '新标题' });
      expect(result.title).toBe('新标题');
    });
  });

  describe('remove', () => {
    it('should delete project', () => {
      (repo.findById as any).mockReturnValue({ id: 'test-id' });
      (repo.delete as any).mockReturnValue(true);

      const result = service.remove('test-id');
      expect(result.success).toBe(true);
    });
  });

  describe('getGlobalStats', () => {
    it('should return global statistics', () => {
      (repo.count as any).mockReturnValue(5);
      (repo.totalWords as any).mockReturnValue(50000);
      (repo.countByStatus as any).mockReturnValue({ idea: 1, writing: 2 });

      const stats = service.getGlobalStats();
      expect(stats.totalProjects).toBe(5);
      expect(stats.totalWords).toBe(50000);
    });
  });
});
