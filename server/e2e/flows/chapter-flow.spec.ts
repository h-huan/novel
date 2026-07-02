import { test, expect } from '@playwright/test';
import { createProject, deleteProject, createChapter, uniqueTitle } from '../helpers';

const BASE = 'http://localhost:3100/api/v1';

test.describe('Chapter Flow E2E', () => {
  let projectId: string;

  test.beforeEach(async ({ request }) => {
    // Create a project for chapter tests
    const res = await request.post(`${BASE}/projects`, {
      data: { title: uniqueTitle('ch-flow'), type: 'long_novel' },
    });
    projectId = (await res.json()).id;
  });

  test.afterEach(async ({ request }) => {
    if (projectId) {
      await deleteProject(request, projectId);
    }
  });

  test('should create a chapter via API and verify it exists', async ({ request }) => {
    const chapter = await createChapter(request, projectId, {
      title: '第一章 开端',
      content: '故事从这里开始。',
      volumeIndex: 1,
      chapterIndex: 1,
    });

    expect(chapter).toHaveProperty('id');
    expect(chapter.title).toBe('第一章 开端');
    expect(chapter.status).toBe('draft');
    expect(chapter.volumeIndex).toBe(1);
    expect(chapter.chapterIndex).toBe(1);

    // Verify by fetching the chapter
    const getRes = await request.get(`${BASE}/projects/${projectId}/chapters/${chapter.id}`);
    expect(getRes.status()).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.title).toBe('第一章 开端');
    expect(fetched.content).toBe('故事从这里开始。');
  });

  test('should update chapter content and verify persistence', async ({ request }) => {
    const chapter = await createChapter(request, projectId);

    const updateRes = await request.put(`${BASE}/projects/${projectId}/chapters/${chapter.id}`, {
      data: { content: '更新后的正文内容。这里是对故事的补充。' },
    });
    expect(updateRes.status()).toBe(200);
    const updated = await updateRes.json();
    expect(updated.content).toBe('更新后的正文内容。这里是对故事的补充。');
    expect(updated.wordCount).toBeGreaterThan(0);

    // Verify persistence
    const getRes = await request.get(`${BASE}/projects/${projectId}/chapters/${chapter.id}`);
    expect(getRes.status()).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.content).toBe('更新后的正文内容。这里是对故事的补充。');
  });

  test('should lock a chapter and verify locked status', async ({ request }) => {
    // Create a chapter and submit for review first (only reviewing chapters can be locked)
    const chapter = await createChapter(request, projectId);

    // Submit for review
    const reviewRes = await request.post(`${BASE}/projects/${projectId}/chapters/${chapter.id}/review`);
    expect(reviewRes.status()).toBe(201);
    const reviewed = await reviewRes.json();
    expect(reviewed.status).toBe('reviewing');

    // Lock the chapter
    const lockRes = await request.post(`${BASE}/projects/${projectId}/chapters/${chapter.id}/lock`);
    expect(lockRes.status()).toBe(201);
    const locked = await lockRes.json();
    expect(locked.status).toBe('locked');
    expect(locked.lockedAt).toBeDefined();
  });

  test('should reject modifications to a locked chapter', async ({ request }) => {
    // Create, review, then lock a chapter
    const chapter = await createChapter(request, projectId);
    await request.post(`${BASE}/projects/${projectId}/chapters/${chapter.id}/review`);
    await request.post(`${BASE}/projects/${projectId}/chapters/${chapter.id}/lock`);

    // Try to modify the locked chapter
    const updateRes = await request.put(`${BASE}/projects/${projectId}/chapters/${chapter.id}`, {
      data: { content: '试图修改锁定章节' },
    });
    // Should be rejected with 400 Bad Request
    expect(updateRes.status()).toBe(400);
    const errorBody = await updateRes.json();
    expect(errorBody).toHaveProperty('message');
    expect(errorBody.message).toContain('Cannot modify locked chapter');
  });

  test('should list chapters for a project', async ({ request }) => {
    await createChapter(request, projectId, { title: '第一章', chapterIndex: 1 });
    await createChapter(request, projectId, { title: '第二章', chapterIndex: 2 });

    const listRes = await request.get(`${BASE}/projects/${projectId}/chapters`);
    expect(listRes.status()).toBe(200);
    const chapters = await listRes.json();
    expect(Array.isArray(chapters)).toBe(true);
    expect(chapters.length).toBeGreaterThanOrEqual(2);
  });
});
