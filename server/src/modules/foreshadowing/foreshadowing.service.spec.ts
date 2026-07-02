/**
 * ForeshadowingService 单元测试
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForeshadowingService } from './foreshadowing.service';
import { ForeshadowingRepository } from '../../database/repositories/foreshadowing.repository';

describe('ForeshadowingService', () => {
  let service: ForeshadowingService;
  let repo: ForeshadowingRepository;

  const mockRow = {
    id: 'fs-1',
    project_id: 'project-1',
    content: '主角身上隐藏的秘密',
    status: 'buried',
    type: 'hint',
    importance: 1,
    buried_at: null,
    buried_chapter_index: 1,
    planned_recovery_at: null,
    planned_recovery_chapter_index: 10,
    actual_recovery_at: null,
    actual_recovery_chapter_index: null,
    recovery_trigger: null,
    recovery_method: null,
    impact: null,
    related_character_ids: '["char-1"]',
    related_reversal_ids: null,
    overdue_threshold: 5,
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
      findByStatus: vi.fn(),
      getPending: vi.fn(),
      recoverForeshadowing: vi.fn(),
      cancelForeshadowing: vi.fn(),
      getOverdueWarnings: vi.fn(),
      findByCharacterId: vi.fn(),
      findByChapterIndex: vi.fn(),
      getStats: vi.fn(),
    } as unknown as ForeshadowingRepository;

    service = new ForeshadowingService(repo);
  });

  describe('create', () => {
    it('should create a foreshadowing with buried status', () => {
      (repo.findById as any).mockReturnValue(mockRow);

      const result = service.create('project-1', {
        content: '主角身上隐藏的秘密',
        buriedChapterIndex: 1,
        plannedRecoveryChapterIndex: 10,
        relatedCharacterIds: ['char-1'],
      });

      expect(result.status).toBe('buried');
      expect(result.content).toBe('主角身上隐藏的秘密');
    });
  });

  describe('state machine', () => {
    it('should activate buried foreshadowing', () => {
      (repo.findById as any)
        .mockReturnValueOnce(mockRow)
        .mockReturnValueOnce({ ...mockRow, status: 'pending' });

      const result = service.activate('fs-1');
      expect(result.status).toBe('pending');
    });

    it('should throw when activating non-buried foreshadowing', () => {
      (repo.findById as any).mockReturnValue({ ...mockRow, status: 'pending' });
      expect(() => service.activate('fs-1')).toThrow();
    });

    it('should recover pending foreshadowing', () => {
      (repo.findById as any).mockReturnValue({ ...mockRow, status: 'pending' });
      (repo.recoverForeshadowing as any).mockReturnValue({ ...mockRow, status: 'recovered', impact: 8 });

      const result = service.recover('fs-1', {
        chapterIndex: 10,
        method: '角色自白揭露真相',
        impact: 8,
      });

      expect(result.status).toBe('recovered');
      expect(result.impact).toBe(8);
    });

    it('should cancel foreshadowing', () => {
      (repo.findById as any).mockReturnValue(mockRow);
      (repo.cancelForeshadowing as any).mockReturnValue({ ...mockRow, status: 'cancelled' });

      const result = service.cancel('fs-1');
      expect(result.status).toBe('cancelled');
    });
  });

  describe('warnings', () => {
    it('should get overdue warnings', () => {
      (repo.getOverdueWarnings as any).mockReturnValue([{ ...mockRow, status: 'pending' }]);

      const warnings = service.getOverdueWarnings('project-1', 8);
      expect(warnings.length).toBe(1);
      expect(repo.getOverdueWarnings).toHaveBeenCalledWith('project-1', 8);
    });
  });

  describe('stats', () => {
    it('should return foreshadowing stats', () => {
      (repo.getStats as any).mockReturnValue({
        total: 10,
        buried: 3,
        pending: 4,
        recovered: 2,
        cancelled: 1,
        overdueCount: 0,
        byImportance: { 1: 3, 2: 5, 3: 2 },
        byType: { hint: 4, setup: 3, mystery: 2, object: 1 },
      });

      const stats = service.getStats('project-1');
      expect(stats.total).toBe(10);
      expect(stats.recoveryRate).toBeUndefined(); // 由前端计算
    });
  });
});
