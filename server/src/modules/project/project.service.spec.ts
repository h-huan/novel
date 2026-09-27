/**
 * ProjectService 单元测试
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProjectService } from './project.service';
import { ProjectRepository } from '../../database/repositories/project.repository';
import { STANDARD_PRECONDITIONS } from '../../acceptance/test-standards';

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
    // 执行前提（平台/分类/基调/文风/流派/视角 + 目标总字数）与验收用例共用同一份 fixture，
    // 不再在这里手写第二份：create() 已把「六维齐备 → 分类归位 → 分类体量」三道判据提到写库之前，
    // 与 chain 的 create-project-async、生成入口 assertExecutionStandardsComplete 共用同一份判据、同一句文案，
    // 所以缺前提的裸 payload 必然被抛 —— 用例若还想验证「创建成功」，就必须显式给出完整前提。
    const createdRow = () => ({
      id: 'test-id',
      type: 'long_novel',
      title: '测试项目',
      status: 'idea',
      target_words: 0,
      current_words: 0,
      target_platform: 'fanqie', platform_style: 'fanqie',
      description: null,
      writing_style: null,
      settings: JSON.stringify({ autoSave: true, autoSaveInterval: 30, writingMode: 'semi_auto', immersiveModeEnabled: false, recapEnabled: true, typoCheckEnabled: true, sensitiveWordCheckEnabled: false }),
      created_at: '2025-01-01',
      updated_at: '2025-01-01',
    });

    it('should create a project with defaults', () => {
      (repo.findById as any).mockReturnValue(createdRow());
      (repo.insert as any).mockImplementation(() => {});

      const result = service.create({ ...STANDARD_PRECONDITIONS, title: '测试项目' });

      expect(result.title).toBe('测试项目');
      expect(result.id).toBe('test-id');
      expect(repo.insert).toHaveBeenCalled();
    });

    it('六维缺项一律不落库，文案与生成入口逐字一致', () => {
      (repo.insert as any).mockImplementation(() => {});

      expect(() => service.create({ title: '无执行标准', targetWords: 461658 }))
        .toThrow('创作宪法未设置平台：属未执行标准，必须补齐后才能继续（不得用默认值或平台推荐替代）');
      expect(repo.insert).not.toHaveBeenCalled();
    });

    it('generic 不算选定平台：平台维必须落到具体投放平台', () => {
      expect(() => service.create({ ...STANDARD_PRECONDITIONS, targetPlatform: 'generic' }))
        .toThrow('创作宪法未设置平台');
    });

    it('分类必须归位到该平台的投稿分类，归不了位就不落库', () => {
      (repo.insert as any).mockImplementation(() => {});

      expect(() => service.create({ ...STANDARD_PRECONDITIONS, category: '不存在的分类' }))
        .toThrow('作品未创建，请先改选该平台的投稿分类。');
      expect(repo.insert).not.toHaveBeenCalled();
    });

    it('目标总字数越界且未写取舍依据 -> 阻断', () => {
      expect(() => service.create({ ...STANDARD_PRECONDITIONS, targetWords: 300000 }))
        .toThrow('项目未创建，请调整目标总字数，或补齐「分类体量取舍依据」。');
    });

    it('未设定目标总字数 -> 阻断（空值不是「不适用」）', () => {
      expect(() => service.create({ ...STANDARD_PRECONDITIONS, targetWords: 0 }))
        .toThrow('目标总字数');
    });

    it('写了取舍依据 -> 放行（执行标准自己给出的合规路径必须被认）', () => {
      (repo.findById as any).mockReturnValue(createdRow());
      (repo.insert as any).mockImplementation(() => {});

      const result = service.create({
        ...STANDARD_PRECONDITIONS,
        targetWords: 300000,
        categoryWordScaleDeviation: '本项目刻意写 30 万字，按短平快节奏取舍，不与头部体量对齐',
      });

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
        target_platform: 'fanqie', platform_style: 'fanqie',
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
        target_platform: 'fanqie', platform_style: 'fanqie',
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
