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

  const projectDb = (status = 'creating') => ({
    prepare: vi.fn((_sql: string) => ({
      get: vi.fn(() => ({ id: 'project-1', status })),
      all: vi.fn(() => []),
      run: vi.fn(),
    })),
    exec: vi.fn(),
  });

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

    const db = projectDb('creating');
    service = new WorldSettingService(repo, { getDb: () => db } as any);
  });

  describe('create', () => {
    it('should create world setting with constraints while project is creating', () => {
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

  it('freezes the world immediately after its first persisted record even while project is creating', () => {
    (repo.findById as any).mockReturnValue(mockRow);
    (repo.findByProjectId as any).mockReturnValue([mockRow]);

    const blocked = (call: () => unknown) => expect(call).toThrow('世界观已冻结');
    blocked(() => service.create('project-1', { name: '第二个世界' } as any));
    blocked(() => service.update('ws-1', { name: '改名' } as any));
    blocked(() => service.remove('ws-1'));
    blocked(() => service.addConstraint('ws-1', { category: 'power', rule: '改约束' } as any));
    blocked(() => service.removeConstraint('ws-1', 'c-1'));

    expect(repo.update).not.toHaveBeenCalled();
    expect(repo.delete).not.toHaveBeenCalled();
    expect(repo.addConstraint).not.toHaveBeenCalled();
    expect(repo.removeConstraint).not.toHaveBeenCalled();
  });

  it('rejects every world mutation entry once a world already exists, regardless of project status', () => {
    const activeDb = projectDb('active');
    service = new WorldSettingService(repo, { getDb: () => activeDb } as any);
    (repo.findById as any).mockReturnValue(mockRow);
    (repo.findByProjectId as any).mockReturnValue([mockRow]);

    const blocked = (call: () => unknown) => expect(call).toThrow('世界观已冻结');
    blocked(() => service.create('project-1', { name: '另一个世界' } as any));
    blocked(() => service.update('ws-1', { name: '改名' } as any));
    blocked(() => service.updateProfile('project-1', 'ws-1', { rules: '改规则' }));
    blocked(() => service.remove('ws-1'));
    blocked(() => service.addConstraint('ws-1', { category: 'power', rule: '改约束' } as any));
    blocked(() => service.removeConstraint('ws-1', 'c-1'));

    expect(repo.insert).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
    expect(repo.delete).not.toHaveBeenCalled();
    expect(repo.addConstraint).not.toHaveBeenCalled();
    expect(repo.removeConstraint).not.toHaveBeenCalled();
  });
});
