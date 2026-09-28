import { APIRequestContext, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import * as fs from 'node:fs';
import { STANDARD_PRECONDITIONS } from '../src/acceptance/test-standards';
import { constitutionSettings, updateConstitution } from '../src/modules/project/creative-constitution';

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
/**
 * Seed a project directly into the isolated E2E SQLite database.
 * Production has no generic project-create API: /discover -> create-project-async
 * is the only user creation path. This helper exists only inside DATA_DIR=.runtime-data-*.
 */
export async function createProject(request: APIRequestContext, title?: string) {
  const dataDir = process.env.DATA_DIR;
  if (!dataDir || !dataDir.includes('.runtime-data-')) {
    throw new Error(`E2E project fixture refused non-isolated DATA_DIR: ${dataDir || '(unset)'}`);
  }
  fs.mkdirSync(dataDir, { recursive: true });
  const id = randomUUID();
  const now = new Date().toISOString();
  const projectTitle = title || uniqueTitle();
  const constitution = updateConstitution(
    { type: 'long_novel', settings: '{}' },
    {
      ...STANDARD_PRECONDITIONS,
      type: 'long_novel',
      targetAudience: '成年网文读者',
      plotTags: ['成长', '选择'],
    },
  );
  constitution.revision = 1;
  constitution.confirmedStory = {
    title: projectTitle,
    storyType: 'long_novel',
    targetPlatform: constitution.targetPlatform,
    hook: '测试项目仅用于隔离 E2E 生命周期验证',
    description: '隔离测试数据库中的确定性项目夹具，不代表真实文学质量样本。',
    protagonist: '测试主角',
    coreConflict: '测试冲突',
    uniquePoint: '测试唯一点',
    styleTags: ['都市', '系统'],
  };
  const settings = constitutionSettings({
    autoSave: true,
    autoSaveInterval: 30,
    writingMode: 'full_auto',
    structurePlanning: 'dynamic_by_story_rhythm',
  }, constitution);

  const db = new DatabaseSync(path.join(dataDir, 'novel.db'));
  try {
    db.exec('PRAGMA busy_timeout = 10000');
    db.prepare(`INSERT INTO projects
      (id,title,type,status,target_words,current_words,settings,writing_style,platform_style,target_platform,current_workflow_stage,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, projectTitle, constitution.projectType, 'active', constitution.targetWords, 0,
      JSON.stringify(settings), JSON.stringify(constitution.writingStyle), constitution.targetPlatform,
      constitution.targetPlatform, 'world_setting', now, now,
    );
  } finally {
    db.close();
  }

  const res = await request.get(`${BASE}/projects/${id}`);
  const body = await res.json();
  expect(res.status(), JSON.stringify(body)).toBe(200);
  expect(body.id).toBe(id);
  expect(body.creativeConstitution?.confirmedStory?.title).toBe(projectTitle);
  return { id, title: projectTitle, response: body };
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
