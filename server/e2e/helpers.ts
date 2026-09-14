import { APIRequestContext, expect } from '@playwright/test';

const BASE = `http://127.0.0.1:${process.env.E2E_PORT || 3100}/api/v1`;

/** Generate a unique project title using timestamp */
export function uniqueTitle(prefix = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Create a project and return its id */
export async function createProject(request: APIRequestContext, title?: string) {
  const res = await request.post(`${BASE}/projects`, {
    data: { title: title || uniqueTitle(), type: 'long_novel', targetWords: 200000, category: '测试', targetAudience: '测试读者', pov: '第三人称限知', settings: { perChapterTarget: 5000, volumeCount: 4 } },
  });
  const body = await res.json();
  expect(res.status(), JSON.stringify(body)).toBe(201);
  expect(body.id).toBeTruthy();
  return { id: body.id, title: body.title, response: body };
}

/** Delete a project by id */
export async function deleteProject(request: APIRequestContext, id: string) {
  await request.delete(`${BASE}/projects/${id}`);
}

/** Create a chapter under a project */
export async function createChapter(
  request: APIRequestContext,
  projectId: string,
  overrides?: { title?: string; content?: string; volumeIndex?: number; chapterIndex?: number },
) {
  const data = {
    title: overrides?.title || '第一章',
    content: overrides?.content || '这是正文内容。',
    volumeIndex: overrides?.volumeIndex ?? 1,
    chapterIndex: overrides?.chapterIndex ?? 1,
  };
  const res = await request.post(`${BASE}/projects/${projectId}/chapters`, { data });
  expect(res.status(), await res.text()).toBe(201);
  return await res.json();
}

/** Synthetic fixture for lifecycle checks, not a literary quality benchmark. */
export async function createReviewableChapter(request: APIRequestContext, projectId: string) {
  const outlineRes = await request.post(`${BASE}/projects/${projectId}/outlines`, {
    data: { title: '生命周期测试章纲', level: 'chapter', targetWords: 3500 },
  });
  expect(outlineRes.status(), await outlineRes.text()).toBe(201);
  const outline = await outlineRes.json();
  const chapters = await (await request.get(`${BASE}/projects/${projectId}/chapters`)).json();
  const chapter = chapters.find((item: any) => item.chapterIndex === 1);
  expect(chapter).toBeDefined();
  const detail = await (await request.get(`${BASE}/projects/${projectId}/chapters/${chapter.id}`)).json();
  expect(detail.outlineId).toBe(outline.id);
  const res = await request.put(`${BASE}/projects/${projectId}/chapters/${chapter.id}`, {
    data: { content: '他沿着小路走到河边。'.repeat(400) },
  });
  expect(res.status(), await res.text()).toBe(200);
  return res.json();
}

/** Create an Author's Note rule */
export async function createAuthorNote(
  request: APIRequestContext,
  overrides?: {
    title?: string;
    ruleType?: string;
    content?: string;
    scope?: string;
    chapterIndex?: number;
    priority?: number;
  },
) {
  const data = {
    title: overrides?.title || '测试规则',
    ruleType: overrides?.ruleType || 'plot_constraint',
    content: overrides?.content || '测试内容',
    scope: overrides?.scope || 'chapter',
    chapterIndex: overrides?.chapterIndex ?? 1,
    priority: overrides?.priority ?? 50,
  };
  const res = await request.post(`${BASE}/author-notes`, { data });
  return await res.json();
}
