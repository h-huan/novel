import { test, expect } from '@playwright/test';
import { createProject, deleteProject, uniqueTitle } from '../helpers';

const BASE = 'http://localhost:3100/api/v1';

test.describe('Writing Flow E2E', () => {
  let projectId: string;

  test.afterEach(async ({ request }) => {
    if (projectId) {
      await deleteProject(request, projectId);
    }
  });

  test('POST /chain/idea-generate should return ideas', async ({ request }) => {
    const res = await request.post(`${BASE}/chain/idea-generate`, {
      data: { platform: 'fanqie', keywords: '穿越,重生,系统', count: 3 },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty('success');
    expect(body).toHaveProperty('ideas');
    expect(Array.isArray(body.ideas)).toBe(true);
  });

  test('POST /chain/outline-generate should return outline', async ({ request }) => {
    const res = await request.post(`${BASE}/chain/outline-generate`, {
      data: {
        projectId: 'test-project-1',
        selectedIdea: { title: '穿越之我是大侠', genre: '历史' },
        platform: 'fanqie',
        targetWords: '3000',
        tone: 'neutral',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty('success');
    expect(body).toHaveProperty('outline');
  });

  test('POST /chain/generate should return chapter content', async ({ request }) => {
    const res = await request.post(`${BASE}/chain/generate`, {
      data: {
        projectId: 'test-project-1',
        mode: 'semi_auto',
        prompt: '生成一段关于穿越的故事开头',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty('success', true);
    expect(body).toHaveProperty('content');
    expect(typeof body.content).toBe('string');
    expect(body.content.length).toBeGreaterThan(0);
  });

  test('POST /chain/continue should return continuation', async ({ request }) => {
    const res = await request.post(`${BASE}/chain/continue`, {
      data: {
        projectId: 'test-project-1',
        chapterId: 'test-chapter-1',
        prompt: '继续故事的发展',
        context: '主角醒来发现自己在一个陌生的房间里。',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty('success', true);
    expect(body).toHaveProperty('content');
    expect(typeof body.content).toBe('string');
    expect(body.content.length).toBeGreaterThan(0);
  });

  test('POST /chain/generate with outline and context should return chain result', async ({ request }) => {
    const res = await request.post(`${BASE}/chain/generate`, {
      data: {
        projectId: 'test-project-1',
        mode: 'full_auto',
        outline: { title: '第一章', summary: '主角的觉醒' },
        chapterContext: { characters: ['陆川'], setting: '1920年上海' },
        chapterNumber: 1,
        chapterOutline: '陆川在上海码头醒来',
        chapterFunction: 'exposition',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty('success');
    expect(body).toHaveProperty('chainResult');
    if (body.success) {
      expect(body).toHaveProperty('content');
    }
  });

  test('POST /chain/generate with isLocked flag should skip', async ({ request }) => {
    const res = await request.post(`${BASE}/chain/generate`, {
      data: {
        projectId: 'test-project-1',
        chapterId: 'locked-chapter-1',
        isLocked: true,
        prompt: '尝试修改锁定章节',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty('success', true);
    expect(body).toHaveProperty('skipped', true);
    expect(body).toHaveProperty('reason');
    expect(body.reason).toContain('已锁定');
  });
});
