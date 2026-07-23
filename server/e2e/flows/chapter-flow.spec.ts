import { test, expect } from '@playwright/test';
import { createProject, deleteProject, createChapter, uniqueTitle } from '../helpers';

const BASE = 'http://127.0.0.1:3100/api/v1';

test.describe('Chapter flow', () => {
  let projectId: string;

  test.beforeEach(async ({ request }) => {
    const res = await request.post(`${BASE}/projects`, {
      data: { title: uniqueTitle('chapter-flow'), type: 'long_novel', targetWords: 200000, settings: { genre: '测试', targetAudience: '测试读者', pov: '第三人称限知', perChapterTarget: 5000, volumeCount: 4 } },
    });
    projectId = (await res.json()).id;
  });

  test.afterEach(async ({ request }) => {
    if (projectId) await deleteProject(request, projectId);
  });

  test('creates a draft chapter and persists it', async ({ request }) => {
    const chapter = await createChapter(request, projectId, {
      title: 'Chapter one', content: 'The story begins here.', volumeIndex: 1, chapterIndex: 1,
    });
    expect(chapter.status).toBe('draft');
    const res = await request.get(`${BASE}/projects/${projectId}/chapters/${chapter.id}`);
    expect(res.status()).toBe(200);
    expect((await res.json()).content).toBe('The story begins here.');
  });

  test('updates content and persists the revised source of truth', async ({ request }) => {
    const chapter = await createChapter(request, projectId);
    const updateRes = await request.put(`${BASE}/projects/${projectId}/chapters/${chapter.id}`, {
      data: { content: 'Revised prose is canonical source content.' },
    });
    expect(updateRes.status()).toBe(200);
    expect((await updateRes.json()).wordCount).toBeGreaterThan(0);
  });

  test('review synchronizes derived data and allows locking when no continuity issue remains', async ({ request }) => {
    const chapter = await createChapter(request, projectId);
    const reviewRes = await request.post(`${BASE}/projects/${projectId}/chapters/${chapter.id}/review`);
    expect(reviewRes.status()).toBe(201);
    expect((await reviewRes.json()).status).toBe('reviewing');

    const lockRes = await request.post(`${BASE}/projects/${projectId}/chapters/${chapter.id}/lock`);
    expect(lockRes.status()).toBe(201);
    expect((await lockRes.json()).status).toBe('locked');
  });

  test('keeps a chapter editable during review so the author can correct it', async ({ request }) => {
    const chapter = await createChapter(request, projectId);
    await request.post(`${BASE}/projects/${projectId}/chapters/${chapter.id}/review`);
    const updateRes = await request.put(`${BASE}/projects/${projectId}/chapters/${chapter.id}`, {
      data: { content: 'Author correction after a continuity warning.' },
    });
    expect(updateRes.status()).toBe(200);
    const updated = await updateRes.json();
    expect(updated.status).toBe('reviewing');
    expect(updated.derivedSync).toBeDefined();
  });

  test('lists project chapters in order', async ({ request }) => {
    await createChapter(request, projectId, { title: 'One', chapterIndex: 1 });
    await createChapter(request, projectId, { title: 'Two', chapterIndex: 2 });
    const res = await request.get(`${BASE}/projects/${projectId}/chapters`);
    expect(res.status()).toBe(200);
    expect((await res.json()).length).toBeGreaterThanOrEqual(2);
  });
});
