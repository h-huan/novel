import { test, expect } from '@playwright/test';
import { createProject, deleteProject, createChapter, createReviewableChapter, uniqueTitle } from '../helpers';

const BASE = `http://127.0.0.1:${process.env.E2E_PORT || 3100}/api/v1`;

test.describe('Chapter lock continuity gate', () => {
  let projectId: string;

  test.beforeEach(async ({ request }) => {
    const res = await request.post(`${BASE}/projects`, {
      data: { title: uniqueTitle('lock-test'), type: 'long_novel', targetWords: 200000, category: '测试', targetAudience: '测试读者', pov: '第三人称限知', settings: { perChapterTarget: 5000, volumeCount: 4 } },
    });
    projectId = (await res.json()).id;
  });

  test.afterEach(async ({ request }) => {
    if (projectId) await deleteProject(request, projectId);
  });

  async function reviewAndLock(request: any) {
    const chapter = await createReviewableChapter(request, projectId);
    const reviewRes = await request.post(`${BASE}/projects/${projectId}/chapters/${chapter.id}/review`);
    expect(reviewRes.status(), await reviewRes.text()).toBe(400);
    expect((await reviewRes.json()).message).toContain('synchronization did not complete');
    const lockRes = await request.post(`${BASE}/projects/${projectId}/chapters/${chapter.id}/lock`);
    return { chapter, lockRes };
  }

  test('draft chapters cannot be locked', async ({ request }) => {
    const chapter = await createChapter(request, projectId);
    const res = await request.post(`${BASE}/projects/${projectId}/chapters/${chapter.id}/lock`);
    expect(res.status()).toBe(400);
    expect((await res.json()).message).toContain('Only reviewing chapters can be locked');
  });

  test('missing summary model blocks review and lock', async ({ request }) => {
    const { lockRes } = await reviewAndLock(request);
    expect(lockRes.status()).toBe(400);
    expect((await lockRes.json()).message).toContain('Only reviewing');
  });

  test('blocked lock preserves draft state', async ({ request }) => {
    const { chapter, lockRes } = await reviewAndLock(request);
    expect(lockRes.status()).toBe(400);
    const getRes = await request.get(`${BASE}/projects/${projectId}/chapters/${chapter.id}`);
    expect(getRes.status()).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.status).toBe('draft');
    expect(fetched.lockedAt).toBeUndefined();
  });

  test('a chapter remains editable after blocked lock', async ({ request }) => {
    const { chapter, lockRes } = await reviewAndLock(request);
    expect(lockRes.status()).toBe(400);
    const updateRes = await request.put(`${BASE}/projects/${projectId}/chapters/${chapter.id}`, {
      data: { content: 'Corrected content after continuity review.' },
    });
    expect(updateRes.status()).toBe(200);
    expect((await updateRes.json()).content).toBe('Corrected content after continuity review.');
  });

  test('blocked lock does not create an unlockable state', async ({ request }) => {
    const { chapter, lockRes } = await reviewAndLock(request);
    expect(lockRes.status()).toBe(400);
    const unlockRes = await request.post(`${BASE}/projects/${projectId}/chapters/${chapter.id}/unlock`);
    expect(unlockRes.status()).toBe(400);
    expect((await unlockRes.json()).message).toContain('Only locked');
  });
});
