/**
 * OutlineService 单元测试
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OutlineService } from './outline.service';
import { OutlineRepository } from '../../database/repositories/outline.repository';

describe('OutlineService', () => {
  let service: OutlineService;
  let repo: OutlineRepository;

  const mockRow = {
    id: 'outline-1',
    project_id: 'project-1',
    level: 'chapter',
    parent_id: null,
    order: 0,
    title: '第一章大纲',
    content: '大纲内容',
    chapter_function: 'breathing',
    goal_arc: 'crisis_resolve',
    target_words: 3000,
    actual_words: 0,
    foreshadowing_ids: '[]',
    plot_points: '[]',
    status: 'planned',
    character_ids: '["char-1"]',
    scenes: null,
    volumes: null,
    book_skeleton: null,
    created_at: '2025-01-01',
    updated_at: '2025-01-01',
  };

  beforeEach(() => {
    repo = {
      findById: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findByProjectId: vi.fn(),
      findByLevel: vi.fn(),
      findChildren: vi.fn(),
      getTree: vi.fn(),
      moveNode: vi.fn(),
      reorderChildren: vi.fn(),
      getChapterIds: vi.fn(),
      updateStatus: vi.fn(),
    } as unknown as OutlineRepository;

    const statement = { get: vi.fn(() => undefined), all: vi.fn(() => []), run: vi.fn(() => ({ changes: 0 })) };
    const database = { getDb: () => ({ prepare: vi.fn(() => statement) }), transaction: (fn: () => unknown) => fn() };
    service = new OutlineService(repo, database as any);
  });

  describe('create', () => {
    it('should create an outline node', () => {
      (repo.findById as any).mockReturnValue(mockRow);

      const result = service.create('project-1', {
        title: '第一章大纲',
        chapterFunction: 'breathing',
        characterIds: ['char-1'],
        targetWords: 3600,
      });

      expect(result.title).toBe('第一章大纲');
      expect(result.chapterFunction).toBe('breathing');
    });
  });

  describe('tree operations', () => {
    it('should get tree structure', () => {
      (repo.getTree as any).mockReturnValue([{ ...mockRow }]);

      const tree = service.getTree('project-1');
      expect(tree.length).toBe(1);
    });

    it('should find children', () => {
      (repo.findChildren as any).mockReturnValue([
        { ...mockRow, id: 'child-1', parent_id: 'outline-1' },
      ]);

      const children = service.findChildren('outline-1');
      expect(children.length).toBe(1);
      expect(children[0].parentId).toBe('outline-1');
    });
  });

  describe('move', () => {
    it('should move node to new parent', () => {
      (repo.findById as any)
        .mockReturnValueOnce(mockRow)
        .mockReturnValueOnce({
        ...mockRow,
        parent_id: 'parent-2',
        order: 1,
        });

      const result = service.move('outline-1', {
        newParentId: 'parent-2',
        newOrder: 1,
      });

      expect(result.parentId).toBe('parent-2');
      expect(result.order).toBe(1);
    });
  });

  describe('reorder', () => {
    it('should reorder children', () => {
      (repo.findById as any).mockReturnValue(mockRow);
      const result = service.reorderChildren('outline-1', {
        orderedIds: ['child-3', 'child-1', 'child-2'],
      });

      expect(result.success).toBe(true);
      expect(repo.reorderChildren).toHaveBeenCalledWith('outline-1', ['child-3', 'child-1', 'child-2']);
    });
  });

  describe('CRUD', () => {
    it('should delete outline', () => {
      (repo.findById as any).mockReturnValue(mockRow);

      const result = service.remove('outline-1');
      expect(result.success).toBe(true);
    });

    it('should throw for non-existing outline', () => {
      (repo.findById as any).mockReturnValue(undefined);
      expect(() => service.remove('no-exist')).toThrow();
    });
  });
});
