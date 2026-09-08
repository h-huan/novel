/**
 * E2E Test Utilities
 * Shared helpers for Playwright E2E tests
 */

import { Page, expect } from '@playwright/test';

/** 等待页面加载完成 */
export async function waitForPageLoad(page: Page) {
  await page.waitForLoadState('networkidle');
}

/** 导航到项目列表页 */
export async function goToProjectList(page: Page) {
  await page.goto('/');
  await waitForPageLoad(page);
  await page.getByRole('button', { name: '我的项目' }).click();
  await expect(page.getByRole('heading', { name: '我的项目' })).toBeVisible();
}

/** 创建测试项目 */
export async function createTestProject(page: Page, name: string) {
  await goToProjectList(page);
  await page.getByRole('button', { name: '+ 新建项目' }).click();

  const dialog = page.getByRole('dialog', { name: '创建新作品' });
  await dialog.getByText('空白创建', { exact: true }).click();
  await dialog.getByRole('button', { name: '下一步' }).click();
  await dialog.getByText('长篇', { exact: true }).click();
  await dialog.getByRole('button', { name: '下一步' }).click();
  await dialog.getByText('通用', { exact: true }).click();
  await dialog.getByRole('button', { name: '下一步' }).click();
  await dialog.getByPlaceholder('输入作品标题...').fill(name);
  await dialog.getByRole('button', { name: '创建作品' }).click();
  await expect(dialog).toBeHidden();
}

/** 验证页面中存在指定文本 */
export async function assertHasText(page: Page, text: string) {
  await expect(page.getByText(text).first()).toBeVisible({ timeout: 5000 });
}
