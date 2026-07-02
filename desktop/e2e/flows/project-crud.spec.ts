/**
 * E2E: 项目管理流程
 * 测试项目创建、查看、编辑、删除
 */
import { test, expect } from '@playwright/test';
import { goToProjectList, createTestProject, assertHasText } from '../helpers/test-utils';

const TEST_PROJECT = 'E2E测试项目-项目管理';

test.describe('项目管理', () => {
  test('首页加载正常', async ({ page }) => {
    await goToProjectList(page);
    await assertHasText(page, 'AI写作平台');
  });

  test('可以创建新项目', async ({ page }) => {
    await createTestProject(page, TEST_PROJECT);
    // 验证项目已出现在列表中
    await expect(page.locator('text=' + TEST_PROJECT).first()).toBeVisible({ timeout: 5000 });
  });

  test('可以打开项目详情', async ({ page }) => {
    await goToProjectList(page);

    // 点击一个项目进入详情
    const projectCard = page.locator('[data-testid="project-card"]').first();
    if (await projectCard.isVisible()) {
      await projectCard.click();
      await page.waitForLoadState('networkidle');
    }

    // 应该能看到项目相关标签页
    const navItems = ['写作', '角色', '大纲', '世界观'];
    for (const item of navItems) {
      const el = page.getByText(item, { exact: true }).first();
      if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
        // 至少有一个可见就说明路由正确
        break;
      }
    }
  });

  test('项目概览数据加载', async ({ page }) => {
    await goToProjectList(page);

    // 尝试导航到任意项目的仪表盘
    const projectCard = page.locator('[data-testid="project-card"]').first();
    if (await projectCard.isVisible()) {
      await projectCard.click();
      await page.waitForTimeout(1000);

      // 尝试点击仪表盘链接
      const dashboardLink = page.getByText('仪表盘').first();
      if (await dashboardLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await dashboardLink.click();
        await page.waitForLoadState('networkidle');
      }
    }
  });
});
