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
}

/** 导航到指定项目页 */
export async function goToProject(page: Page, projectId: string) {
  await page.goto(`/project/${projectId}`);
  await waitForPageLoad(page);
}

/** 创建测试项目 */
export async function createTestProject(page: Page, name: string) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // 查找并点击创建项目按钮
  const createBtn = page.locator('[data-testid="create-project-btn"]');
  if (await createBtn.isVisible()) {
    await createBtn.click();
  }

  // 填写项目名称
  const nameInput = page.locator('[data-testid="project-name-input"]');
  if (await nameInput.isVisible()) {
    await nameInput.fill(name);
  } else {
    // 备用：通过通用输入框定位
    await page.locator('input[placeholder*="项目"]').first().fill(name);
  }

  // 确认创建
  const confirmBtn = page.locator('[data-testid="confirm-btn"]');
  if (await confirmBtn.isVisible()) {
    await confirmBtn.click();
  }

  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
}

/** 验证页面中存在指定文本 */
export async function assertHasText(page: Page, text: string) {
  await expect(page.getByText(text).first()).toBeVisible({ timeout: 5000 });
}

/** 断言导航到指定路由 */
export async function assertCurrentRoute(page: Page, expectedPath: string) {
  await page.waitForURL(`**${expectedPath}`, { timeout: 5000 });
}
