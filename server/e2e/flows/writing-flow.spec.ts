import { test, expect, type APIRequestContext } from '@playwright/test';
import { createChapter, createProject, deleteProject, uniqueTitle } from '../helpers';

const BASE = `http://127.0.0.1:${process.env.E2E_PORT || 3100}/api/v1`;

async function waitForProjectReady(request: APIRequestContext, projectId: string, timeoutMs = 240_000) {
  const deadline = Date.now() + timeoutMs;
  let last: any = null;
  while (Date.now() < deadline) {
    const response = await request.get(`${BASE}/projects/${projectId}`);
    if (response.ok()) {
      last = await response.json();
      if (last.status === 'active') return last;
      if (last.status === 'generation_failed') throw new Error(`项目初始化失败: ${JSON.stringify(last)}`);
    }
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  throw new Error(`等待项目初始化超时: ${projectId}, last=${JSON.stringify(last)}`);
}

async function chapterList(request: APIRequestContext, projectId: string): Promise<any[]> {
  const response = await request.get(`${BASE}/projects/${projectId}/chapters`);
  expect(response.ok(), await response.text()).toBe(true);
  const body = await response.json();
  return Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : [];
}

async function configureRealModelRoute(request: APIRequestContext): Promise<string> {
  const model = String(process.env.REAL_LLM_MODEL || 'deepseek-flash').trim();
  if (!process.env.DEEPSEEK_API_KEY && !process.env.LLM_API_KEY) {
    throw new Error('RUN_REAL_LLM_E2E=1 requires DEEPSEEK_API_KEY or LLM_API_KEY');
  }
  const scenes = Object.fromEntries(
    ['daily', 'idea_generate', 'outline', 'writing', 'polish']
      .map(scene => [`${scene}:normal`, model]),
  );
  const configured = await request.post(`${BASE}/routing/scenario-models`, { data: { scenes } });
  expect(configured.status(), await configured.text()).toBe(201);
  const mode = await request.post(`${BASE}/routing/mode`, { data: { mode: 'normal' } });
  expect(mode.status(), await mode.text()).toBe(201);
  return model;
}

test.describe('Writing Flow E2E', () => {
  let projectId: string;

  test.beforeEach(async ({ request }) => {
    const project = await createProject(request, 'writing-flow');
    projectId = project.id;
  });

  test.afterEach(async ({ request }) => {
    if (projectId) await deleteProject(request, projectId);
  });

  test('returns an authoritative writing package without an LLM', async ({ request }) => {
    const world = await request.post(`${BASE}/projects/${projectId}/world-settings`, {
      data: {
        name: '档案馆异常规则',
        era: '现代城市',
        workIntro: '档案员追查午夜新增的失踪登记。',
        constraints: [{
          category: '档案规则',
          rule: '官方档案必须保留可追溯修改记录。',
          description: '午夜后新增的异常登记只改变档案显示，不直接改写现实经历。',
          severity: 'hard',
        }],
      },
    });
    expect(world.status(), await world.text()).toBe(201);

    const chapter = await createChapter(request, projectId, {
      title: '第一章', content: '主角在雨夜收到一封没有署名的信。', chapterIndex: 1,
    });
    expect(chapter.id).toBeTruthy();

    const res = await request.post(`${BASE}/chain/writing-context/raw`, {
      data: { projectId, chapterNumber: 1, volumeNumber: 1 },
    });
    expect(res.status(), await res.text()).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, projectId, chapterNumber: 1 });
    expect(body.state).toHaveProperty('stateGuard');
    expect(body).toHaveProperty('chapterPlan');
    expect(body.canonicalContext).toHaveProperty('characters');
    expect(body.canonicalContext.world).toContain('档案员追查午夜新增的失踪登记');
    expect(body.usage.instruction).toContain('Confirmed facts');
  });

  test('blocks body generation for a long novel without the required outline', async ({ request }) => {
    // 这个用例只验证“大纲缺失”这一层。先补齐更上游的世界观和主角，
    // 否则 WorkflowGuard 正确地会先阻断 world_setting/main_character，测试就测不到大纲门。
    const world = await request.post(`${BASE}/projects/${projectId}/world-settings`, {
      data: {
        name: '档案馆基础规则',
        era: '现代城市',
        workIntro: '档案员追查午夜新增的失踪登记。',
        constraints: [{
          category: '档案规则',
          rule: '档案修改必须可追溯。',
          description: '用于验证大纲缺失门禁的确定性世界观夹具。',
          severity: 'hard',
        }],
      },
    });
    expect(world.status(), await world.text()).toBe(201);

    const character = await request.post(`${BASE}/projects/${projectId}/characters`, {
      data: {
        name: '林川',
        identity: '档案员',
        role: 'protagonist',
        isPovCharacter: true,
      },
    });
    expect(character.status(), await character.text()).toBe(201);

    const res = await request.post(`${BASE}/chain/generate`, {
      data: { projectId, mode: 'semi_auto', prompt: 'Generate a chapter opening.' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body)).toMatch(/outline|大纲|总纲/i);
  });

  test('skips a locked chapter without calling an LLM', async ({ request }) => {
    const res = await request.post(`${BASE}/chain/generate`, {
      data: { projectId, chapterId: 'locked-chapter', isLocked: true, prompt: 'Do not overwrite this.' },
    });
    expect(res.status()).toBe(201);
    await expect(res.json()).resolves.toMatchObject({ success: true, skipped: true });
  });
});

/**
 * Real-model acceptance. CI without BYOK intentionally skips it; setting
 * RUN_REAL_LLM_E2E=1 makes this the release gate for the failure that previously
 * left chapter 1/2 at zero bytes after repeated 422s.
 */
test.describe('Real novel golden path', () => {
  test.skip(process.env.RUN_REAL_LLM_E2E !== '1', 'requires configured real LLM key and explicit RUN_REAL_LLM_E2E=1');
  test.setTimeout(420_000);

  test('discovers an idea, inherits its standards, initializes the novel and persists chapter one', async ({ request }) => {
    let projectId = '';
    try {
      const routedModel = await configureRealModelRoute(request);
      expect(routedModel).toBeTruthy();

      const standards = {
        storyType: 'short_story',
        platform: 'custom',
        customPlatformNote: '每章3000至5000字，前300字进入异常事件，每章推进核心谜团并留下明确追读钩子。',
        storyCategory: '悬疑',
        storyTone: ['紧张', '克制'],
        writingStyle: ['简洁', '画面感'],
        webNovelGenre: ['悬疑推理'],
        submissionTags: ['悬疑', '调查'],
        plotTags: ['谜团', '追查'],
        genreFitNote: '以连续调查和事实反转兑现悬疑读者预期。',
        pov: '第三人称限知',
        targetAudience: '成年悬疑读者',
        targetWords: 12000,
      };

      const discovery = await request.post(`${BASE}/chain/idea-discover`, {
        data: { ...standards, count: 1 },
        timeout: 120_000,
      });
      expect(discovery.ok(), await discovery.text()).toBe(true);
      const discoveryBody = await discovery.json();
      expect(discoveryBody.success).toBe(true);
      expect(Array.isArray(discoveryBody.ideas)).toBe(true);
      expect(discoveryBody.ideas.length).toBeGreaterThan(0);
      const idea = discoveryBody.ideas[0];
      expect(idea.storyType ?? standards.storyType).toBe('short_story');

      const create = await request.post(`${BASE}/chain/create-project-async`, {
        data: {
          title: idea.title || uniqueTitle('golden-novel'),
          storyType: 'short_story',
          targetPlatform: 'custom',
          customPlatformNote: standards.customPlatformNote,
          targetWords: 12000,
          selectedIdea: { ...idea, storyType: 'short_story', recommendedTargetWords: 12000 },
          category: '悬疑',
          targetAudience: standards.targetAudience,
          storyTone: standards.storyTone,
          writingStyle: standards.writingStyle,
          webNovelGenre: standards.webNovelGenre,
          submissionTags: standards.submissionTags,
          plotTags: standards.plotTags,
          genreFitNote: standards.genreFitNote,
          pov: standards.pov,
          settings: { structurePlanning: 'dynamic_by_story_rhythm' },
        },
        timeout: 30_000,
      });
      expect(create.ok(), await create.text()).toBe(true);
      const created = await create.json();
      expect(created.success).toBe(true);
      projectId = created.projectId;
      expect(projectId).toBeTruthy();

      const project = await waitForProjectReady(request, projectId);
      expect(project.creativeConstitution.targetPlatform).toBe('custom');
      expect(project.creativeConstitution.category).toBe('悬疑');
      expect(project.creativeConstitution.storyTone).toEqual(standards.storyTone);
      expect(project.creativeConstitution.writingStyle).toEqual(standards.writingStyle);
      expect(project.creativeConstitution.webNovelGenre).toEqual(standards.webNovelGenre);
      expect(project.creativeConstitution.pov).toBe(standards.pov);
      expect(project.creativeConstitution.confirmedStory).toBeTruthy();

      const chapters = await chapterList(request, projectId);
      expect(chapters.length).toBeGreaterThan(0);
      const first = chapters.slice().sort((a, b) => Number(a.chapterIndex) - Number(b.chapterIndex))[0];
      expect(first.id).toBeTruthy();
      expect(first.outlineId ?? first.outline_id).toBeTruthy();

      const generated = await request.post(`${BASE}/chain/stream-generate`, {
        data: { projectId, chapterId: first.id, mode: 'full_auto', scenario: 'writing' },
        timeout: 300_000,
      });
      expect(generated.ok(), await generated.text()).toBe(true);

      const detailResponse = await request.get(`${BASE}/projects/${projectId}/chapters/${first.id}`);
      expect(detailResponse.ok(), await detailResponse.text()).toBe(true);
      const detail = await detailResponse.json();
      expect(String(detail.content || '').trim().length).toBeGreaterThan(0);
      expect(Number(detail.wordCount ?? detail.word_count ?? 0)).toBeGreaterThan(0);

      const contextResponse = await request.post(`${BASE}/chain/writing-context/raw`, {
        data: { projectId, chapterNumber: 1, volumeNumber: 1 },
      });
      expect(contextResponse.ok(), await contextResponse.text()).toBe(true);
      const context = await contextResponse.json();
      expect(context.chapterPlan).toBeTruthy();
      expect(JSON.stringify(context)).toContain('悬疑');
    } finally {
      if (projectId) await deleteProject(request, projectId);
    }
  });
});
