/**
 * WorldSettingService 单元测试
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorldSettingService } from './world-setting.service';
import { WorldSettingRepository } from '../../database/repositories/world-setting.repository';

describe('WorldSettingService', () => {
  let service: WorldSettingService;
  let repo: WorldSettingRepository;

  const mockRow = {
    id: 'ws-1',
    project_id: 'project-1',
    name: '修真世界',
    era: '上古时代',
    era_period: null,
    geography: '[]',
    factions: '[]',
    power_system: '[]',
    economy: '{}',
    society: '{}',
    constraints: '[{"id":"c-1","category":"power","rule":"灵力不可无限使用","description":"每个人每天最多使用三次灵力","severity":"hard","appliesTo":[]}]',
    version: 1,
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
      addConstraint: vi.fn(),
      removeConstraint: vi.fn(),
      updateConstraint: vi.fn(),
    } as unknown as WorldSettingRepository;

    service = new WorldSettingService(repo);
  });

  describe('create', () => {
    it('should create world setting with constraints', () => {
      (repo.findById as any).mockReturnValue(mockRow);

      const result = service.create('project-1', {
        name: '修真世界',
        era: '上古时代',
        constraints: [
          {
            category: 'power',
            rule: '灵力不可无限使用',
            description: '每个人每天最多使用三次灵力',
            severity: 'hard',
          },
        ],
      });

      expect(result.name).toBe('修真世界');
      expect(result.constraints.length).toBe(1);
      expect(result.constraints[0].rule).toBe('灵力不可无限使用');
    });
  });

  describe('constraint management', () => {
    it('should add constraint', () => {
      (repo.findById as any).mockReturnValue(mockRow);
      (repo.addConstraint as any).mockReturnValue({
        ...mockRow,
        constraints: JSON.stringify([
          ...JSON.parse(mockRow.constraints),
          { id: 'c-2', category: 'society', rule: '新的约束', description: '测试', severity: 'soft', appliesTo: [] },
        ]),
        version: 2,
      });

      const result = service.addConstraint('ws-1', {
        category: 'society',
        rule: '新的约束',
        description: '测试',
        severity: 'soft',
      });

      expect(result.version).toBe(2);
    });

    it('should remove constraint', () => {
      (repo.findById as any).mockReturnValue(mockRow);
      (repo.removeConstraint as any).mockReturnValue({
        ...mockRow,
        constraints: '[]',
        version: 2,
      });

      const result = service.removeConstraint('ws-1', 'c-1');
      expect(result.constraints.length).toBe(0);
    });
  });
});
