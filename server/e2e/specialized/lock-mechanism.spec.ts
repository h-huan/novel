import { test, expect } from '@playwright/test';
import { createProject, deleteProject, createChapter, uniqueTitle } from '../helpers';

const BASE = 'http://localhost:3100/api/v1';

test.describe('Lock Mechanism (7.6)', () => {
  let projectId: string;

  test.beforeEach(async ({ request }) => {
    const res = await request.post(`${BASE}/projects`, {
      data: { title: uniqueTitle('lock-test'), type: 'long_novel' },
    });
    projectId = (await res.json()).id;
  });

  test.afterEach(async ({ request }) => {
    if (projectId) {
      await deleteProject(request, projectId);
    }
  });

  test('should create a chapter with draft status', async ({ request }) => {
    const chapter = await createChapter(request, projectId, {
      title: '草稿章节',
      content: '这是草稿内容。',
    });

    expect(chapter).toHaveProperty('id');
    expect(chapter.status).toBe('draft');
    expect(chapter.lockedAt).toBeUndefined();
  });

  test('should lock a chapter and verify locked status', async ({ request }) => {
    const chapter = await createChapter(request, projectId);

    // Submit for review first
    const reviewRes = await request.post(
      `${BASE}/projects/${projectId}/chapters/${chapter.id}/review`,
    );
    expect(reviewRes.status()).toBe(201);

    // Lock the chapter
    const lockRes = await request.post(
      `${BASE}/projects/${projectId}/chapters/${chapter.id}/lock`,
    );
    expect(lockRes.status()).toBe(201);
    const locked = await lockRes.json();
    expect(locked.status).toBe('locked');
    expect(locked.lockedAt).toBeDefined();
    expect(typeof locked.lockedAt).toBe('string');
    expect(new Date(locked.lockedAt).getTime()).toBeGreaterThan(0);
  });

  test('should unlock a chapter and verify revert to draft', async ({ request }) => {
    const chapter = await createChapter(request, projectId);

    // Review → Lock
    await request.post(`${BASE}/projects/${projectId}/chapters/${chapter.id}/review`);
    await request.post(`${BASE}/projects/${projectId}/chapters/${chapter.id}/lock`);

    // Unlock
    const unlockRes = await request.post(
      `${BASE}/projects/${projectId}/chapters/${chapter.id}/unlock`,
    );
    expect(unlockRes.status()).toBe(201);
    const unlocked = await unlockRes.json();
    expect(unlocked.status).toBe('draft');
    // lockedAt should be cleared after unlock
    expect(unlocked.lockedAt).toBeUndefined();
  });

  test('should return locked chapter with read-only indication in status', async ({ request }) => {
    const chapter = await createChapter(request, projectId);

    // Review → Lock
    await request.post(`${BASE}/projects/${projectId}/chapters/${chapter.id}/review`);
    await request.post(`${BASE}/projects/${projectId}/chapters/${chapter.id}/lock`);

    // Fetch the locked chapter
    const getRes = await request.get(
      `${BASE}/projects/${projectId}/chapters/${chapter.id}`,
    );
    expect(getRes.status()).toBe(200);
    const fetched = await getRes.json();

    // The chapter should have locked status which serves as read-only flag
    expect(fetched.status).toBe('locked');
    expect(fetched.lockedAt).toBeDefined();
    // Content should still be accessible
    expect(fetched.content).toBeDefined();
    expect(typeof fetched.content).toBe('string');
  });

  test('should reject PUT on locked chapter title', async ({ request }) => {
    const chapter = await createChapter(request, projectId);

    // Review → Lock
    await request.post(`${BASE}/projects/${projectId}/chapters/${chapter.id}/review`);
    await request.post(`${BASE}/projects/${projectId}/chapters/${chapter.id}/lock`);

    // Attempt to modify the locked chapter title
    const updateRes = await request.put(
      `${BASE}/projects/${projectId}/chapters/${chapter.id}`,
      { data: { title: '修改后的标题' } },
    );
    expect(updateRes.status()).toBe(400);
    const errorBody = await updateRes.json();
    expect(errorBody).toHaveProperty('message');
    expect(errorBody.message).toContain('Cannot modify locked chapter');
  });

  test('should reject lock if chapter is not in reviewing status', async ({ request }) => {
    const chapter = await createChapter(request, projectId);

    // Attempt to lock a draft chapter directly (without submitting for review)
    const lockRes = await request.post(
      `${BASE}/projects/${projectId}/chapters/${chapter.id}/lock`,
    );
    expect(lockRes.status()).toBe(400);
    const errorBody = await lockRes.json();
    expect(errorBody).toHaveProperty('message');
    expect(errorBody.message).toContain('Only reviewing chapters can be locked');
  });

  test('should reject unlock if chapter is not locked', async ({ request }) => {
    const chapter = await createChapter(request, projectId);

    // Attempt to unlock a draft chapter
    const unlockRes = await request.post(
      `${BASE}/projects/${projectId}/chapters/${chapter.id}/unlock`,
    );
    expect(unlockRes.status()).toBe(400);
    const errorBody = await unlockRes.json();
    expect(errorBody).toHaveProperty('message');
    expect(errorBody.message).toContain('Only locked chapters can be unlocked');
  });

  test('should allow modification after unlock', async ({ request }) => {
    const chapter = await createChapter(request, projectId);

    // Review → Lock → Unlock
    await request.post(`${BASE}/projects/${projectId}/chapters/${chapter.id}/review`);
    await request.post(`${BASE}/projects/${projectId}/chapters/${chapter.id}/lock`);
    await request.post(`${BASE}/projects/${projectId}/chapters/${chapter.id}/unlock`);

    // Now modify should succeed
    const updateRes = await request.put(
      `${BASE}/projects/${projectId}/chapters/${chapter.id}`,
      { data: { content: '解锁后修改的内容。' } },
    );
    expect(updateRes.status()).toBe(200);
    const updated = await updateRes.json();
    expect(updated.content).toBe('解锁后修改的内容。');
    expect(updated.status).toBe('draft');
  });
});
