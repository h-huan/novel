import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

describe('API request headers', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends a bodyless DELETE without a JSON content type', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { success: true } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await api.delete('/projects/project-id');

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.method).toBe('DELETE');
    expect(options.body).toBeUndefined();
    expect(options.headers).toEqual({});
  });

  it('keeps JSON content type when a POST body is supplied or filled', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: null }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await api.post('/example', { value: 1 });
    await api.post('/example');

    const [, explicit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const [, filled] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(explicit).toMatchObject({ body: '{"value":1}', headers: { 'Content-Type': 'application/json' } });
    expect(filled).toMatchObject({ body: '{}', headers: { 'Content-Type': 'application/json' } });
  });
});
