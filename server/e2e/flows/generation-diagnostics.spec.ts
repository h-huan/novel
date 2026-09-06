import { test, expect } from '@playwright/test';
test('unconfigured idea discovery preserves its cause and adds one visible failed run', async ({ request }) => {
  const base = `http://127.0.0.1:${process.env.E2E_PORT || 3100}/api/v1`;
  const before = await (await request.get(`${base}/platform-analytics/overview`)).json();
  const result = await (await request.post(`${base}/chain/idea-discover`, {
    data: { storyType: 'short_story', platform: 'fanqie', count: 5 }, timeout: 10000,
  })).json();
  expect(result.success).toBe(false);
  expect(result.error).toContain('未配置模型');
  expect(result.error).not.toContain('无法解析');
  const after = await (await request.get(`${base}/platform-analytics/overview`)).json();
  expect(after.generationRuns.total).toBe(before.generationRuns.total + 1);
  expect(after.generationRuns.recent[0].error).toBe(result.error);
  expect(after.kpis.llmCalls).toBe(before.kpis.llmCalls);
  expect(after.generationRuns.recent[0].standards.modules.some((s: any) => s.key === 'quality_loop' && s.baseline === 4)).toBe(true);
});
