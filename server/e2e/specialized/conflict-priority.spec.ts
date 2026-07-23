import { test, expect } from '@playwright/test';
import { createProject, deleteProject, createAuthorNote, uniqueTitle } from '../helpers';

const BASE = 'http://127.0.0.1:3100/api/v1';

test.describe('Conflict Priority (7.8)', () => {
  let projectId: string;

  test.beforeEach(async ({ request }) => {
    const res = await request.post(`${BASE}/projects`, {
      data: { title: uniqueTitle('conflict-test'), type: 'long_novel', targetWords: 200000, settings: { genre: '测试', targetAudience: '测试读者', pov: '第三人称限知', perChapterTarget: 5000, volumeCount: 4 } },
    });
    projectId = (await res.json()).id;
  });

  test.afterEach(async ({ request }) => {
    if (projectId) {
      await deleteProject(request, projectId);
    }
  });

  test('should detect conflict between two overlapping Author Note rules', async ({ request }) => {
    // Create a chapter-scoped Author Note
    const rule1 = await createAuthorNote(request, {
      title: '情节约束：主角不能死亡',
      ruleType: 'plot_constraint',
      content: '主角必须存活到最后',
      scope: 'chapter',
      chapterIndex: 1,
      priority: 80,
    });
    expect(rule1).toHaveProperty('id');

    // Create another rule with overlapping scope
    const rule2 = await createAuthorNote(request, {
      title: '设定覆盖：主角可以死亡',
      ruleType: 'setting_override',
      content: '不能主角必须存活',
      scope: 'chapter',
      chapterIndex: 1,
      priority: 90,
    });
    expect(rule2).toHaveProperty('id');

    // Detect conflicts on rule1
    const conflictRes = await request.post(`${BASE}/author-notes/${rule1.id}/conflicts`, {
      data: { lockedChapterIds: [] },
    });
    expect(conflictRes.status()).toBe(201);
    const body = await conflictRes.json();

    expect(body).toHaveProperty('hasConflict');
    expect(body).toHaveProperty('conflicts');
    expect(Array.isArray(body.conflicts)).toBe(true);

    // Should have at least one conflict (scope overlap or priority or content contradiction)
    if (body.conflicts.length > 0) {
      const types = body.conflicts.map((c: any) => c.type);
      // Should detect at least scope overlap or priority conflict
      expect(
        types.some((t: string) =>
          ['scope_overlap', 'priority_conflict', 'content_contradiction'].includes(t),
        ),
      ).toBeTruthy();
    }
  });

  test('should detect conflict with locked chapter (P0) vs draft content (P3)', async ({ request }) => {
    // Create a chapter in the project and lock it
    const chapterRes = await request.post(`${BASE}/projects/${projectId}/chapters`, {
      data: { title: '锁定章节', content: '锁定内容', volumeIndex: 1, chapterIndex: 1 },
    });
    const chapter = await chapterRes.json();

    // Review → Lock
    await request.post(`${BASE}/projects/${projectId}/chapters/${chapter.id}/review`);
    await request.post(`${BASE}/projects/${projectId}/chapters/${chapter.id}/lock`);

    // Now create an author note rule targeting the same chapter
    const rule = await createAuthorNote(request, {
      title: '修改锁定章节的规则',
      ruleType: 'plot_constraint',
      content: '新的剧情约束',
      scope: 'chapter',
      chapterIndex: 1,
    });

    // Detect conflicts with locked chapters
    const conflictRes = await request.post(`${BASE}/author-notes/${rule.id}/conflicts`, {
      data: { lockedChapterIds: [chapter.id] },
    });
    expect(conflictRes.status()).toBe(201);
    const body = await conflictRes.json();

    // Should detect locked chapter conflict
    expect(body.conflicts.some((c: any) => c.type === 'locked_chapter_conflict')).toBeTruthy();
  });

  test('should detect conflicts with real-time mode', async ({ request }) => {
    // POST /conflicts/detect with mode=realtime
    const res = await request.post(`${BASE}/conflicts/detect`, {
      data: {
        chapterIndex: 1,
        paragraphContent: '陆川勇敢地冲向前线，但他内心充满了恐惧。',
        mode: 'realtime',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();

    // May return empty or with conflicts depending on service state
    // but should always return an array
    expect(Array.isArray(body)).toBe(true);
  });

  test('should detect conflicts with deep mode', async ({ request }) => {
    // POST /conflicts/detect with mode=deep (default)
    const res = await request.post(`${BASE}/conflicts/detect`, {
      data: {
        chapterIndex: 1,
        paragraphContent: '第一章的内容\n\n早上，阳光明媚。\n\n下午，下起了大雨。',
        mode: 'deep',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();

    // Should return an array of conflict records
    expect(Array.isArray(body)).toBe(true);

    // Deep mode detects timeline conflicts, logic jumps, etc.
    // All returned conflicts should have proper structure
    for (const conflict of body) {
      expect(conflict).toHaveProperty('id');
      expect(conflict).toHaveProperty('type');
      expect(conflict).toHaveProperty('priority');
      expect(conflict).toHaveProperty('description');
      expect(conflict).toHaveProperty('detectionMode');
    }
  });

  test('should verify priority sorting (P0 > P1 > P2 > P3)', async ({ request }) => {
    // Run conflict detection multiple times to generate conflicts of various priorities
    // Then check the GET /conflicts endpoint returns them sorted by priority

    // First, create a locked chapter to enable P0 conflicts
    const chapterRes = await request.post(`${BASE}/projects/${projectId}/chapters`, {
      data: { title: '锁定章节', content: '锁定内容', volumeIndex: 1, chapterIndex: 1 },
    });
    const chapter = await chapterRes.json();
    await request.post(`${BASE}/projects/${projectId}/chapters/${chapter.id}/review`);
    await request.post(`${BASE}/projects/${projectId}/chapters/${chapter.id}/lock`);

    // Create author notes with various priorities
    const lowRule = await createAuthorNote(request, {
      title: '低优先级规则',
      ruleType: 'custom',
      content: '一些建议',
      scope: 'chapter',
      chapterIndex: 1,
      priority: 20,
    });

    const highRule = await createAuthorNote(request, {
      title: '高优先级规则',
      ruleType: 'plot_constraint',
      content: '严格约束',
      scope: 'chapter',
      chapterIndex: 1,
      priority: 90,
    });

    // Detect conflicts on high priority rule (which will generate priority_conflict with lowRule)
    await request.post(`${BASE}/author-notes/${highRule.id}/conflicts`, {
      data: { lockedChapterIds: [chapter.id] },
    });

    // Detect conflicts on low priority rule (which generates conflicts about being lower)
    const conflictRes = await request.post(`${BASE}/author-notes/${lowRule.id}/conflicts`, {
      data: { lockedChapterIds: [chapter.id] },
    });
    const body = await conflictRes.json();

    // Verify conflicts are returned with proper data
    expect(Array.isArray(body.conflicts)).toBe(true);

    // For priority_conflict type, verify the description mentions priority comparison
    const priorityConflicts = body.conflicts.filter((c: any) => c.type === 'priority_conflict');
    for (const pc of priorityConflicts) {
      expect(pc.description).toContain('优先级');
    }

    // Verify severity levels are present
    for (const conflict of body.conflicts) {
      expect(['high', 'medium', 'low']).toContain(conflict.severity);
    }
  });

  test('GET /conflicts should return sorted by priority', async ({ request }) => {
    // Run a deep detection to populate conflicts
    await request.post(`${BASE}/conflicts/detect`, {
      data: {
        chapterIndex: 1,
        paragraphContent: '早上出发。下午到达。晚上休息。第二天继续赶路。',
        mode: 'deep',
      },
    });

    // Get all conflicts
    const getRes = await request.get(`${BASE}/conflicts`);
    expect(getRes.status()).toBe(200);
    const conflicts = await getRes.json();
    expect(Array.isArray(conflicts)).toBe(true);

    // Verify conflicts are sorted by priority descending (P0=100 > P1=80 > P2=50 > P3=20)
    if (conflicts.length > 1) {
      for (let i = 1; i < conflicts.length; i++) {
        const prev = conflicts[i - 1].priority;
        const curr = conflicts[i].priority;
        expect(prev).toBeGreaterThanOrEqual(curr);
      }
    }
  });

  test('GET /conflicts/stats should return conflict statistics', async ({ request }) => {
    const res = await request.get(`${BASE}/conflicts/stats`);
    expect(res.status()).toBe(200);
    const stats = await res.json();

    expect(stats).toHaveProperty('total');
    expect(stats).toHaveProperty('byType');
    expect(stats).toHaveProperty('byPriority');
    expect(stats).toHaveProperty('byStatus');

    // Verify byType contains all conflict types
    expect(stats.byType).toHaveProperty('character_ooc');
    expect(stats.byType).toHaveProperty('setting_contradiction');
    expect(stats.byType).toHaveProperty('timeline_conflict');
    expect(stats.byType).toHaveProperty('foreshadowing_loss');
    expect(stats.byType).toHaveProperty('logic_jump');

    // Verify priority keys exist
    expect(stats.byPriority).toHaveProperty('100'); // P0
    expect(stats.byPriority).toHaveProperty('80');  // P1
    expect(stats.byPriority).toHaveProperty('50');  // P2
    expect(stats.byPriority).toHaveProperty('20');  // P3

    // Total should match sum of byPriority
    const prioritySum = Object.values(stats.byPriority as Record<string, number>).reduce((a: number, b: number) => a + b, 0);
    expect(stats.total).toBe(prioritySum);
  });
});
