import { APIRequestContext, expect } from '@playwright/test';

const BASE = `http://127.0.0.1:${process.env.E2E_PORT || 3100}/api/v1`;

/** Generate a unique project title using timestamp */
export function uniqueTitle(prefix = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Single E2E source of truth for a project that satisfies the current creation
 * preconditions. Tests may override the field they are exercising, but must not
 * maintain private copies of the six-dimensional execution standard.
 */
export function validProjectPayload(overrides: Record<string, any> = {}) {
  const confirmedIdea = '一名档案员发现每天午夜都会多出一份不存在的失踪登记，他必须在记录吞掉真实身份前查清来源。';
  const base = {
    title: uniqueTitle(),
    type: 'long_novel',
    creationSource: 'idea',
    targetPlatform: 'custom',
    customPlatformNote: '每章3000至5000字，开篇尽快进入异常事件，章章推进核心冲突并留下明确追读钩子。',
    targetWords: 120000,
    category: '悬疑',
    storyTone: ['紧张', '克制'],
    writingStyle: ['简洁', '画面感'],
    webNovelGenre: ['悬疑推理'],
    submissionTags: ['悬疑', '调查'],
    plotTags: ['谜团', '追查'],
    genreFitNote: '以连续调查和事实反转兑现悬疑读者预期。',
    targetAudience: '成年悬疑读者',
    pov: '第三人称限知',
    ideaSeed: confirmedIdea,
    confirmedIdea,
    settings: { structurePlanning: 'dynamic_by_story_rhythm' },
  };
  return {
    ...base,
    ...overrides,
    settings: { ...base.settings, ...(overrides.settings || {}) },
  };
}

/**
 * Create a project through the normal project boundary. The fixture deliberately
 * supplies all six execution-standard dimensions; tests must not rely on hidden
 * defaults that production creation correctly rejects.
 */
export async function createProject(request: APIRequestContext, title?: string) {
  const res = await request.post(`${BASE}/projects`, {
    data: validProjectPayload({ title: title || uniqueTitle() }),
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
