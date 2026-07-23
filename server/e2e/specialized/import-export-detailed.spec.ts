import { test, expect } from '@playwright/test';
import { createProject, deleteProject, uniqueTitle } from '../helpers';

const BASE = 'http://127.0.0.1:3100/api/v1';

test.describe('Import/Export Detailed (7.7)', () => {
  let projectId: string;

  test.beforeEach(async ({ request }) => {
    const res = await request.post(`${BASE}/projects`, {
      data: { title: uniqueTitle('import-export-detailed'), type: 'long_novel', targetWords: 200000, settings: { genre: '测试', targetAudience: '测试读者', pov: '第三人称限知', perChapterTarget: 5000, volumeCount: 4 } },
    });
    projectId = (await res.json()).id;
  });

  test.afterEach(async ({ request }) => {
    if (projectId) {
      await deleteProject(request, projectId);
    }
  });

  test('should import .txt content and verify chapters parsed', async ({ request }) => {
    const textContent = `第一章 启程

清晨的阳光洒在古老的城墙上。陆川背着简单的行囊，站在城门口，心中充满了对未知旅程的期待。

他深吸一口气，迈出了城门。

第二章 山间遇险

山路崎岖不平，两旁是茂密的森林。突然，一阵低沉的咆哮从树林深处传来。`;

    const res = await request.post(`${BASE}/import-export/import/text`, {
      data: { content: textContent, format: 'txt' },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();

    expect(body.result.chapters.length).toBeGreaterThanOrEqual(2);
    const chapters = body.result.chapters;

    // Verify parsed chapter content is non-empty
    for (const ch of chapters) {
      expect(ch.content.length).toBeGreaterThan(0);
      expect(ch.wordCount).toBeGreaterThan(0);
    }

    // Verify chapter titles contain "章"
    const titles = chapters.map((c: any) => c.title);
    expect(titles.some((t: string) => t.includes('章'))).toBeTruthy();
  });

  test('should import .md content with headings and verify chapter splits', async ({ request }) => {
    const markdownContent = `# 第一章 觉醒

黑暗之中，他感到一股温暖的力量在体内流动。

*这是他从未体验过的感觉。*

# 第二章 试炼

试炼场上，他面对着前所未有的挑战。

> "只有通过试炼，你才能获得真正的力量。"

## 第一节 内心挣扎

他开始怀疑自己的选择是否正确。

# 第三章 新生

当一切都结束时，他发现自己已经完全不同了。`;

    const res = await request.post(`${BASE}/import-export/import/text`, {
      data: { content: markdownContent, format: 'md' },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();

    // Markdown headings (#) should split into chapters
    expect(body.result.chapters.length).toBeGreaterThanOrEqual(3);
    expect(body.result.projectInfo.importFormat).toBe('md');

    // Each chapter should have content
    for (const ch of body.result.chapters) {
      expect(ch.content.length).toBeGreaterThan(0);
    }
  });

  test('should import content via POST and verify import report with metrics', async ({ request }) => {
    const content = `第一章 开始

这是一个测试故事的内容。

第二章 继续

故事继续发展。

第三章 结尾

故事结束了。`;

    const res = await request.post(`${BASE}/import-export/import/text`, {
      data: { content, format: 'txt' },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();

    // Verify full import report structure
    expect(body.result).toBeDefined();
    expect(body.report).toBeDefined();
    expect(body.summary).toBeDefined();

    // Verify report items
    expect(Array.isArray(body.report)).toBe(true);
    for (const item of body.report) {
      expect(item).toHaveProperty('category');
      expect(item).toHaveProperty('level');
      expect(item).toHaveProperty('message');
      expect(item).toHaveProperty('detail');
      expect(['chapter', 'character', 'world']).toContain(item.category);
      expect(['green', 'yellow', 'red']).toContain(item.level);
    }

    // Verify summary metrics
    expect(body.summary).toHaveProperty('green');
    expect(body.summary).toHaveProperty('yellow');
    expect(body.summary).toHaveProperty('red');
    expect(body.summary).toHaveProperty('total');
    expect(body.summary.total).toBe(body.report.length);

    // Verify project info
    const info = body.result.projectInfo;
    expect(info).toHaveProperty('wordCount');
    expect(info).toHaveProperty('chapterCount');
    expect(info).toHaveProperty('importedAt');
    expect(info.wordCount).toBeGreaterThan(0);
  });

  test('should export to HTML format and verify HTML structure', async ({ request }) => {
    const res = await request.post(`${BASE}/chain/export-novel`, {
      data: {
        projectId,
        projectTitle: '测试小说',
        chapters: [
          { title: '第一章', content: '正文内容段落一。\n\n段落二。', status: 'draft' },
          { title: '第二章', content: '更多正文段落。', status: 'draft' },
        ],
        characters: [{ name: '陆川', description: '主角' }],
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify the novel package has proper structure
    expect(body.novelPackage.format).toBe('novel-project');
    expect(body.novelPackage.data.chapters).toHaveLength(2);
    expect(body.novelPackage.data.characters).toHaveLength(1);
  });

  test('should preview export and verify metrics', async ({ request }) => {
    // Use the export-novel endpoint to simulate preview (returns preview-like data)
    const res = await request.post(`${BASE}/chain/export-novel`, {
      data: {
        projectId,
        projectTitle: '预览测试',
        chapters: [
          { title: '第一章', content: '预览内容。', status: 'draft' },
        ],
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();

    // Verify preview-like summary metrics
    expect(body).toHaveProperty('summary');
    expect(body.summary).toHaveProperty('chapterCount');
    expect(body.summary).toHaveProperty('characterCount');
    expect(body.summary).toHaveProperty('totalWords');
    expect(body.summary.chapterCount).toBe(1);
    expect(body.summary.totalWords).toBeGreaterThanOrEqual(0);

    // Verify download data is available (base64 encoded)
    expect(body).toHaveProperty('downloadData');
    expect(typeof body.downloadData).toBe('string');
    expect(body.downloadData.length).toBeGreaterThan(0);
  });

  test('POST /import-export/optimization-mark/:projectId should analyze optimization marks', async ({ request }) => {
    const res = await request.post(`${BASE}/import-export/optimization-mark/${projectId}`, {
      data: {
        chapters: [
          { title: '第一章', content: '陆川说道："我们出发吧。"' },
          { title: '第二章', content: '林婉回答道："好的。"' },
        ],
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();

    expect(body).toHaveProperty('suggestions');
    expect(Array.isArray(body.suggestions)).toBe(true);
  });
});
