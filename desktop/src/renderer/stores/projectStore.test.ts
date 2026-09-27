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
describe('projectStore 提交执行标准', () => {
  const serverRow = {
    id: 'p1',
    title: '短篇测试书',
    status: 'active',
    creativeConstitution: { schemaVersion: 1, projectType: 'short_story', targetPlatform: 'fanqie' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.setState({ projects: [], currentProject: null, loading: false, error: null });
    vi.mocked(api.post).mockResolvedValue(serverRow as any);
    vi.mocked(api.put).mockResolvedValue(serverRow as any);
  });

  it('createProject 把十项执行标准全部发出去（含分类体量取舍依据）', async () => {
    const standards = toExecutionStandardsPayload({
      ...EMPTY_EXECUTION_STANDARDS,
      targetPlatform: 'fanqie',
      customPlatformNote: '非自定义平台时应被清空',
      targetWords: '20000',
      projectType: 'short_story',
      category: '都市·现实',
      storyTone: ['甜宠'],
      writingStyle: ['克制'],
      webNovelGenre: ['都市'],
      pov: '第一人称',
      targetAudience: '男频',
      categoryWordScaleDeviation: '短故事分类体量按短篇口径取舍，不套用长篇区间',
    });

    await useProjectStore.getState().createProject({ title: '短篇测试书', type: 'short_story', ...standards });

    const [path, body] = vi.mocked(api.post).mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe('/projects');
    expect(body).toMatchObject({
      title: '短篇测试书',
      type: 'short_story',
      targetPlatform: 'fanqie',
      targetWords: 20000,
      category: '都市·现实',
      storyTone: ['甜宠'],
      writingStyle: ['克制'],
      webNovelGenre: ['都市'],
      pov: '第一人称',
      targetAudience: '男频',
      categoryWordScaleDeviation: '短故事分类体量按短篇口径取舍，不套用长篇区间',
    });
    // 平台不是 custom 时不得夹带说明文本，否则后端会把它当成平台基准。
    expect(body.customPlatformNote).toBe('');
  });

  it('createProject 对未设置的标准不发字段，也不用默认值兜底', async () => {
    await useProjectStore.getState().createProject({ title: '只填标题' });

    const [, body] = vi.mocked(api.post).mock.calls[0] as [string, Record<string, unknown>];
    expect(Object.keys(body).sort()).toEqual(['title', 'type']);
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
