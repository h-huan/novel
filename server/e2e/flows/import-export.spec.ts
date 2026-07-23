import { test, expect } from '@playwright/test';

const BASE = 'http://127.0.0.1:3100/api/v1';

test.describe('Import/Export Basic Flow E2E', () => {
  test('GET /import-export/formats should return supported formats', async ({ request }) => {
    const res = await request.get(`${BASE}/import-export/formats`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('import');
    expect(body).toHaveProperty('export');
    expect(Array.isArray(body.import)).toBe(true);
    expect(Array.isArray(body.export)).toBe(true);
    expect(body.import).toContain('txt');
    expect(body.import).toContain('md');
    expect(body.export).toContain('markdown');
    expect(body.export).toContain('epub');
  });

  test('POST /import-export/import/text should process text content', async ({ request }) => {
    const markdownContent = `# 第一章 开端

这是故事的开始。

# 第二章 发展

故事继续发展。`;

    const res = await request.post(`${BASE}/import-export/import/text`, {
      data: { content: markdownContent, format: 'md' },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();

    expect(body).toHaveProperty('result');
    expect(body).toHaveProperty('report');
    expect(body).toHaveProperty('summary');

    const { result, report } = body;
    expect(result.chapters.length).toBeGreaterThanOrEqual(2);
    expect(result.projectInfo.importFormat).toBe('md');
    expect(result.projectInfo.wordCount).toBeGreaterThan(0);

    // Verify report structure
    expect(Array.isArray(report)).toBe(true);
    expect(report.length).toBeGreaterThan(0);

    // Verify chapter titles are parsed from markdown headings
    const chapterTitles = result.chapters.map((c: any) => c.title);
    expect(chapterTitles.some((t: string) => t.includes('第一章') || t.includes('第一章 开端'))).toBeTruthy();
  });

  test('POST /import-export/import/text with plain text should split by chapter markers', async ({ request }) => {
    const textContent = `第一章 启程

这是一个关于冒险的故事。

第二章 旅途

主角在路上遇到了新的伙伴。

第三章 危机

危险正在逼近。`;

    const res = await request.post(`${BASE}/import-export/import/text`, {
      data: { content: textContent, format: 'txt' },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();

    expect(body.result.chapters.length).toBeGreaterThanOrEqual(2);
    expect(body.result.projectInfo.wordCount).toBeGreaterThan(0);
  });

  test('POST /chain/export-novel should export project package', async ({ request }) => {
    const res = await request.post(`${BASE}/chain/export-novel`, {
      data: {
        projectId: 'test-export-project',
        projectTitle: '测试小说',
        chapters: [
          { title: '第一章', content: '正文内容', status: 'draft' },
          { title: '第二章', content: '更多正文', status: 'draft' },
        ],
        characters: [{ name: '陆川', description: '主角' }],
        outline: '故事大纲',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty('success', true);
    expect(body).toHaveProperty('novelPackage');
    expect(body).toHaveProperty('summary');
    expect(body.summary.chapterCount).toBe(2);
    expect(body.summary.characterCount).toBe(1);

    // Verify structure of the exported package
    const pkg = body.novelPackage;
    expect(pkg.format).toBe('novel-project');
    expect(pkg.version).toBe('1.0.0');
    expect(pkg.data.chapters).toHaveLength(2);
    expect(pkg.data.characters).toHaveLength(1);
  });

  test('POST /chain/export-novel with empty data should return empty summary', async ({ request }) => {
    const res = await request.post(`${BASE}/chain/export-novel`, {
      data: { projectId: 'empty-project', projectTitle: '空项目' },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.summary.chapterCount).toBe(0);
    expect(body.summary.characterCount).toBe(0);
    expect(body.summary.totalWords).toBe(0);
  });
});
