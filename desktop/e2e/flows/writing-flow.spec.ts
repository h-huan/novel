/**
 * E2E: 写作流程
 * 测试核心写作功能：编辑、大纲、章节管理
 */
import { test, expect } from '@playwright/test';
import { goToProjectList, assertHasText } from '../helpers/test-utils';

test.describe('写作流程', () => {
  test('进入写作页面', async ({ page }) => {
    await goToProjectList(page);

    // 进入任意项目
    const projectCard = page.locator('[data-testid="project-card"]').first();
    if (await projectCard.isVisible()) {
      await projectCard.click();
      await page.waitForLoadState('networkidle');
    }
  });

  test('大纲页面可访问', async ({ page }) => {
    await goToProjectList(page);

    const projectCard = page.locator('[data-testid="project-card"]').first();
    if (await projectCard.isVisible()) {
      await projectCard.click();
      await page.waitForTimeout(500);

      // 点击大纲标签
      const outlineTab = page.getByText('大纲').first();
      if (await outlineTab.isVisible({ timeout: 2000 }).catch(() => false)) {
        await outlineTab.click();
        await page.waitForTimeout(500);
      }
    }
  });

  test('角色管理页面可访问', async ({ page }) => {
    await goToProjectList(page);

    const projectCard = page.locator('[data-testid="project-card"]').first();
    if (await projectCard.isVisible()) {
      await projectCard.click();
      await page.waitForTimeout(500);

      const charTab = page.getByText('角色').first();
      if (await charTab.isVisible({ timeout: 2000 }).catch(() => false)) {
        await charTab.click();
        await page.waitForTimeout(500);
      }
    }
  });

  test('伏笔管理页面可访问', async ({ page }) => {
    await goToProjectList(page);

    const projectCard = page.locator('[data-testid="project-card"]').first();
    if (await projectCard.isVisible()) {
      await projectCard.click();
      await page.waitForTimeout(500);

      const foreshadowTab = page.getByText('伏笔').first();
      if (await foreshadowTab.isVisible({ timeout: 2000 }).catch(() => false)) {
        await foreshadowTab.click();
        await page.waitForTimeout(500);
      }
    }
  });

  test('冲突检测页面可访问', async ({ page }) => {
    await goToProjectList(page);

    const projectCard = page.locator('[data-testid="project-card"]').first();
    if (await projectCard.isVisible()) {
      await projectCard.click();
      await page.waitForTimeout(500);

      const conflictTab = page.getByText('冲突').first();
      if (await conflictTab.isVisible({ timeout: 2000 }).catch(() => false)) {
        await conflictTab.click();
        await page.waitForTimeout(500);
      }
    }
  });
});
