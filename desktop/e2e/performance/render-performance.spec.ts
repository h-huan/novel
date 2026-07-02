/**
 * E2E: 渲染性能
 * 测试大项目加载和页面切换性能
 */
import { test, expect } from '@playwright/test';

test.describe('渲染性能', () => {
  test('首页首次加载时间 < 5s', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - startTime;

    expect(loadTime).toBeLessThan(5000);
  });

  test('项目详情页加载 < 3s', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const projectCard = page.locator('[data-testid="project-card"]').first();
    if (await projectCard.isVisible()) {
      const startTime = Date.now();
      await projectCard.click();
      await page.waitForLoadState('networkidle');
      const loadTime = Date.now() - startTime;

      expect(loadTime).toBeLessThan(3000);
    }
  });

  test('标签页切换流畅', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const projectCard = page.locator('[data-testid="project-card"]').first();
    if (await projectCard.isVisible()) {
      await projectCard.click();
      await page.waitForTimeout(1000);

      const tabs = ['写作', '角色', '大纲', '世界观'];
      for (const tab of tabs) {
        const tabEl = page.getByText(tab).first();
        if (await tabEl.isVisible({ timeout: 1000 }).catch(() => false)) {
          const start = Date.now();
          await tabEl.click();
          await page.waitForTimeout(300);
          const switchTime = Date.now() - start;
          expect(switchTime).toBeLessThan(2000);
        }
      }
    }
  });
});
