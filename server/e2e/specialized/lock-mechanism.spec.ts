import { test, expect } from '@playwright/test';
import { createProject, deleteProject, createChapter, uniqueTitle } from '../helpers';

const BASE = 'http://127.0.0.1:3100/api/v1';

test.describe('Chapter lock continuity gate', () => {
  let projectId: string;

  test.beforeEach(async ({ request }) => {
    const res = await request.post(`${BASE}/projects`, {
      data: { title: uniqueTitle('lock-test'), type: 'long_novel', targetWords: 200000, settings: { genre: '测试', targetAudience: '测试读者', pov: '第三人称限知', perChapterTarget: 5000, volumeCount: 4 } },
    });
    projectId = (await res.json()).id;
  });

  test.afterEach(async ({ request }) => {
    if (projectId) await deleteProject(request, projectId);
  });

  async function reviewAndLock(request: any) {
    const chapter = await createChapter(request, projectId, { content: 'A reviewed chapter needs current derived data before it can be locked.' });
    const reviewRes = await request.post(`${BASE}/projects/${projectId}/chapters/${chapter.id}/review`);
    expect(reviewRes.status()).toBe(201);
    const lockRes = await request.post(`${BASE}/projects/${projectId}/chapters/${chapter.id}/lock`);
    return { chapter, lockRes };
  }

  test('draft chapters cannot be locked', async ({ request }) => {
    const chapter = await createChapter(request, projectId);
    const res = await request.post(`${BASE}/projects/${projectId}/chapters/${chapter.id}/lock`);
    expect(res.status()).toBe(400);
    expect((await res.json()).message).toContain('Only reviewing chapters can be locked');
  });

  test('reviewed chapter locks after derived data is current', async ({ request }) => {
    const { lockRes } = await reviewAndLock(request);
    expect(lockRes.status()).toBe(201);
    expect((await lockRes.json()).status).toBe('locked');
  });

  test('a successful lock persists the locked state', async ({ request }) => {
    const { chapter, lockRes } = await reviewAndLock(request);
    expect(lockRes.status()).toBe(201);
    const getRes = await request.get(`${BASE}/projects/${projectId}/chapters/${chapter.id}`);
    expect(getRes.status()).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.status).toBe('locked');
    expect(fetched.lockedAt).toBeDefined();
  });

  test('a locked chapter rejects direct author edits', async ({ request }) => {
    const { chapter, lockRes } = await reviewAndLock(request);
    expect(lockRes.status()).toBe(201);
    const updateRes = await request.put(`${BASE}/projects/${projectId}/chapters/${chapter.id}`, {
      data: { content: 'Corrected content after continuity review.' },
    });
    expect(updateRes.status()).toBe(400);
    expect((await updateRes.json()).message).toContain('Cannot modify locked chapter');
  });

  test('a successfully locked chapter can be unlocked for revision', async ({ request }) => {
    const { chapter, lockRes } = await reviewAndLock(request);
    expect(lockRes.status()).toBe(201);
    const unlockRes = await request.post(`${BASE}/projects/${projectId}/chapters/${chapter.id}/unlock`);
    expect(unlockRes.status()).toBe(201);
    expect((await unlockRes.json()).status).toBe('draft');
  });
});
