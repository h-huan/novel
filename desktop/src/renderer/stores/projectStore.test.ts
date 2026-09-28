import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api', () => ({
  api: { delete: vi.fn(), post: vi.fn(), put: vi.fn() },
}));

import { api } from '../lib/api';
import { useProjectStore } from './projectStore';
import { EMPTY_EXECUTION_STANDARDS, toExecutionStandardsPayload } from '../lib/executionStandards';

describe('projectStore deleteProjects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.setState({
      projects: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as any,
      currentProject: { id: 'b' } as any,
      loading: false,
      error: null,
    });
  });

  it('deletes unique selected projects and keeps failed ones visible', async () => {
    vi.mocked(api.delete).mockImplementation(async (path: string) => {
      if (path.endsWith('/b')) throw new Error('busy');
      return {} as any;
    });

    const result = await useProjectStore.getState().deleteProjects(['a', 'a', 'b']);

    expect(api.delete).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ deleted: ['a'], failed: [{ id: 'b', message: 'busy' }] });
    expect(useProjectStore.getState().projects.map(project => project.id)).toEqual(['b', 'c']);
    expect(useProjectStore.getState().currentProject?.id).toBe('b');
  });
});

// 执行标准是执行前提：请求体里少一项，界面照样显示「已填」，生成侧却按「未执行」阻断。
// 旧实现逐字段 if 拼 body，新增的 categoryWordScaleDeviation 就这样被漏在门外。
describe('projectStore 更新执行标准', () => {
  const serverRow = {
    id: 'p1',
    title: '短篇测试书',
    status: 'active',
    creativeConstitution: { schemaVersion: 1, projectType: 'short_story', targetPlatform: 'fanqie' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.setState({ projects: [], currentProject: null, loading: false, error: null });
    vi.mocked(api.put).mockResolvedValue(serverRow as any);
  });

  it('updateProject 显式提交空标准：空值落库为「未设置」，不靠「不提交」把旧值留在库里', async () => {
    await useProjectStore.getState().updateProject('p1', toExecutionStandardsPayload(EMPTY_EXECUTION_STANDARDS));

    const [path, body] = vi.mocked(api.put).mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe('/projects/p1');
    expect(body.targetPlatform).toBe('');
    expect(body.category).toBe('');
    expect(body.storyTone).toEqual([]);
    expect(body.writingStyle).toEqual([]);
    expect(body.categoryWordScaleDeviation).toBe('');
    expect('targetWords' in body).toBe(false);
  });
});
