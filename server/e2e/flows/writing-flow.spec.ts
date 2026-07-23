import { test, expect } from '@playwright/test';
import { createChapter, createProject, deleteProject } from '../helpers';

const BASE = 'http://127.0.0.1:3100/api/v1';

test.describe('Writing Flow E2E', () => {
  let projectId: string;

  test.beforeEach(async ({ request }) => {
    const project = await createProject(request, 'writing-flow');
    projectId = project.id;
  });

  test.afterEach(async ({ request }) => {
    if (projectId) await deleteProject(request, projectId);
  });

  test('returns an authoritative writing package without an LLM', async ({ request }) => {
    const chapter = await createChapter(request, projectId, {
      title: '第一章', content: '主角在雨夜收到一封没有署名的信。', chapterIndex: 1,
    });
    expect(chapter.id).toBeTruthy();

    const res = await request.post(`${BASE}/chain/writing-context/raw`, {
      data: { projectId, chapterNumber: 1, volumeNumber: 1 },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, projectId, chapterNumber: 1 });
    expect(body.state).toHaveProperty('stateGuard');
    expect(body).toHaveProperty('chapterPlan');
    expect(body.canonicalContext).toHaveProperty('characters');
    expect(body.usage.instruction).toContain('Confirmed facts');
  });

  test('blocks body generation for a long novel without the required outline', async ({ request }) => {
    const res = await request.post(`${BASE}/chain/generate`, {
      data: { projectId, mode: 'semi_auto', prompt: 'Generate a chapter opening.' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body)).toMatch(/outline|大纲/i);
  });

  test('skips a locked chapter without calling an LLM', async ({ request }) => {
    const res = await request.post(`${BASE}/chain/generate`, {
      data: { projectId, chapterId: 'locked-chapter', isLocked: true, prompt: 'Do not overwrite this.' },
    });
    expect(res.status()).toBe(201);
    await expect(res.json()).resolves.toMatchObject({ success: true, skipped: true });
  });
});
