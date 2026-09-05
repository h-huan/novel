import { test, expect } from '@playwright/test';
test('shows missing evidence, blocking issues and repair rollback without fake totals', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/v1/generation-metrics/cockpit?*', route => route.fulfill({ json: {
    scope: '验收数据', scores: { world: { overallScore: null, coverage: 0.5, dimensions: {
      context: { score: null, status: 'not_evaluated', reason: '证据不足', evidence: [] },
      tone: { score: 30, status: 'evaluated', reason: '偏离选定基调', evidence: ['测试引用'] },
    } } }, runs: [{ id: 'r', stage: 'world', status: 'failed', gate_status: 'blocked', constitution_revision: 2, duration_ms: 1000, error: '上下文冲突' }],
    issues: [{ id: 'i', severity: 'blocking', summary: '上下文冲突', evidence: '测试引用' }],
    repairs: [{ id: 'repair', stage: 'world', status: 'rolled_back', before_score: 70, after_score: 75, reason: '逻辑维度退步' }],
    trend: [],
  } }));
  await page.goto('/e2e/quality-harness.html');
  const cockpit = page.getByRole('region', { name: '质量驾驶舱' });
  await expect(cockpit.getByText('证据不足', { exact: true })).toBeVisible();
  await expect(cockpit.getByText(/世界观 · 未评估/)).toBeVisible();
  await cockpit.getByText('未解决问题（1）', { exact: true }).click();
  await expect(cockpit.getByText('阻断', { exact: true })).toBeVisible();
  await cockpit.getByText('修复结果', { exact: true }).click();
  await expect(cockpit.getByText(/已回滚.*逻辑维度退步/)).toBeVisible();
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('quality-cockpit.png'), fullPage: true });
});
