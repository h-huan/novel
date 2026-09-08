/**
 * E2E: 项目管理流程
 * 测试项目创建、查看、编辑、删除
 */
import { test, expect } from '@playwright/test';
import { createTestProject, assertHasText } from '../helpers/test-utils';

const TEST_PROJECT = 'E2E测试项目-项目管理';

test.describe('项目管理', () => {
  test('首页加载正常', async ({ page }) => {
    await page.goto('/');
    await assertHasText(page, '创作质量看板');
  });

  test('可以创建并打开新项目', async ({ page }) => {
    await createTestProject(page, TEST_PROJECT);
    await expect(page).toHaveURL(/\/project\/[^/]+\/dashboard$/);
    await expect(page.getByText(TEST_PROJECT, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: '质量诊断' })).toBeVisible();
  });
});
