import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { SEED_BASELINE_VERSION } from '../../src/modules/module-standards/module-standards.seed';
test('direct backend entry reports its checkout and rejects duplicate startup before DB bootstrap', async ({ request }) => {
  const port = String(process.env.E2E_PORT || '3100');
  const base = `http://127.0.0.1:${port}/api/v1`;
  const first = await (await request.get(`${base}/health`)).json();
  expect(first.status).toBe('ok');
  expect(first.build.commit).toMatch(/^[a-f0-9]{40}$/i);
  const duplicate = spawnSync(process.execPath, [
    '--no-warnings', path.resolve(__dirname, '../../dist/src/main.js'),
  ], {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, PORT: port, SERVER_PORT: port, HOST: '127.0.0.1' },
    encoding: 'utf8', timeout: 15000, windowsHide: true,
  });
  expect(duplicate.error).toBeUndefined();
  expect(duplicate.status).toBe(1);
  expect(duplicate.stdout + duplicate.stderr).toContain('当前进程未启动，也没有复用旧进程');
  const still = await (await request.get(`${base}/health`)).json();
  expect(still.status).toBe('ok');
  expect(still.build.processStartedAt).toBe(first.build.processStartedAt);
  expect(still.build.commit).toBe(first.build.commit);
});

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
  expect(after.generationRuns.recent[0].standards.rulesetVersion).toBe(SEED_BASELINE_VERSION);
  expect(after.generationRuns.recent[0].standards.modules.some((s: any) => s.key === 'QLT-006' && s.baseline === SEED_BASELINE_VERSION)).toBe(true);
  expect(after.generationRuns.recent[0].standards.modules.some((s: any) => s.key === 'quality_loop')).toBe(false);
});
