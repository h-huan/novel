import { APIRequestContext, test } from '@playwright/test';

const BASE = 'http://localhost:3100/api/v1';

/** Generate a unique project title using timestamp */
export function uniqueTitle(prefix = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Create a project and return its id */
export async function createProject(request: APIRequestContext, title?: string) {
  const res = await request.post(`${BASE}/projects`, {
    data: { title: title || uniqueTitle(), type: 'long_novel' },
  });
  const body = await res.json();
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
  return await res.json();
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
