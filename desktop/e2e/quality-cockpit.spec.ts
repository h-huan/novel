import { test, expect } from '@playwright/test';

test('writing quality shows evidence without operational diagnostics', async ({ page }) => {
  await page.route('**/api/v1/generation-metrics/cockpit?**', route => route.fulfill({ json: {
    scope: '验收作品',
    scores: { world: { overallScore: null, coverage: 0.5, dimensions: {
      context: { score: null, status: 'not_evaluated', reason: '证据不足', evidence: [] },
      tone: { score: 30, status: 'evaluated', reason: '偏离基调', evidence: ['测试引用'] },
    } } },
    issues: [{ id: 'i', severity: 'blocking', summary: '上下文冲突', evidence: '测试引用' }],
    repairs: [{ id: 'repair', stage: 'world', status: 'rolled_back', before_score: 70, after_score: 75, reason: '逻辑退步', before_text: '原文', after_text: '候选' }],
    trend: [{ at: '2026-01-01T00:00:00Z', stage: 'world', score: 70, coverage: 0.5 }],
    issuePareto: [{ ruleId: 'ai_trace.abstract_summary', count: 3 }],
    issueStageDistribution: [{ stage: 'chapter', count: 3 }],
    strategyStats: [{ strategyId: 'scene_structure_patch', attempts: 4, accepted: 3, rollbacks: 1, successRate: 0.75, destructionRate: 0.25, avgImprovement: 8 }],
    modelPromptCompare: [{ model: 'fixture', promptVersion: 'abcdef012345', runs: 4, passRate: 0.75, avgLatencyMs: 120 }],
    bottlenecks: [{ id: 'run', stage: 'chapter', status: 'failed', gate_status: 'blocked', error: '质量门禁' }],
    benchmark: { available: false, resultStatus: 'waiting_for_real_samples', groups: [{ storyType: 'short_story', platform: 'fanqie', samples: 0, labeled: 0, pending: 0, precision: null, recall: null, falsePositives: 0, falseNegatives: 0, repairSuccessRate: null, destructionRate: null, status: 'waiting_for_samples' }] },
  } }));
  await page.goto('/e2e/quality-harness.html');
  const panel = page.getByRole('region', { name: '作品质量' });
  await expect(panel.getByText(/世界观.*未评估/)).toBeVisible();
  await expect(panel.getByText('证据不足', { exact: true })).toBeVisible();
  await expect(panel.getByText('测试引用', { exact: true }).first()).toBeVisible();
  await expect(panel.getByText('Issue Pareto 与阶段分布')).toBeVisible();
  await expect(panel.getByText('真实 Benchmark')).toBeVisible();
  await expect(panel.getByText(/生成进度|Token|模型配置/)).toHaveCount(0);
});

test('homepage excludes model and generation diagnostics', async ({ page }) => {
  await page.route('**/api/v1/platform-analytics/overview?**', route => route.fulfill({ json: { data: {
    generationRuns: { total: 60, failed: 60, recent: [{ error: '未配置模型', standards: {} }] },
  } } }));
  await page.goto('/e2e/quality-harness.html?workbench');
  await expect(page.getByRole('region', { name: '作品质量' })).toHaveCount(0);
  await expect(page.getByText('生成运行记录')).toHaveCount(0);
  await expect(page.getByText('未配置模型')).toHaveCount(0);
  await expect(page.getByText('标准快照')).toHaveCount(0);
});

test('quality loading failures do not fabricate scores', async ({ page }) => {
  await page.route('**/api/v1/generation-metrics/cockpit?**', route => route.fulfill({ status: 500, json: { message: 'failure' } }));
  await page.goto('/e2e/quality-harness.html');
  await expect(page.getByRole('alert')).toContainText('加载失败');
  await expect(page.getByText(/0 分|100 分/)).toHaveCount(0);
});
