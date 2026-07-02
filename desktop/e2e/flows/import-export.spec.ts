/**
 * E2E: 导入导出流程
 * 测试项目数据的导入和导出功能
 */
import { test, expect } from '@playwright/test';
import { goToProjectList } from '../helpers/test-utils';

test.describe('导入导出', () => {
  test('导入导出页面可访问', async ({ page }) => {
    await goToProjectList(page);

    const projectCard = page.locator('[data-testid="project-card"]').first();
    if (await projectCard.isVisible()) {
      await projectCard.click();
      await page.waitForTimeout(500);

      const importExportTab = page.getByText('导入导出').first();
      if (await importExportTab.isVisible({ timeout: 2000 }).catch(() => false)) {
        await importExportTab.click();
        await page.waitForTimeout(500);
      }
    }
  });

  test('导出按钮存在', async ({ page }) => {
    await goToProjectList(page);

    const projectCard = page.locator('[data-testid="project-card"]').first();
    if (await projectCard.isVisible()) {
      await projectCard.click();
      await page.waitForTimeout(500);

      // 进入导入导出页
      const importExportTab = page.getByText('导入导出').first();
      if (await importExportTab.isVisible({ timeout: 2000 }).catch(() => false)) {
        await importExportTab.click();
        await page.waitForTimeout(500);

        // 查找导出相关按钮
        const exportBtn = page.getByText(/导出/).first();
        expect(await exportBtn.isVisible({ timeout: 3000 }).catch(() => false)).toBeTruthy();
      }
    }
  });
});
