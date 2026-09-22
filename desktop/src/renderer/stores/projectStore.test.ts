import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api', () => ({
  api: { delete: vi.fn() },
}));

import { api } from '../lib/api';
import { useProjectStore } from './projectStore';

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
