/**
 * E2E: 写作流程
 * 测试核心写作功能：编辑、大纲、章节管理
 */
import { test, expect } from '@playwright/test';
import { createTestProject } from '../helpers/test-utils';

test.describe('写作流程', () => {
  test('世界观、角色、大纲、正文、质量诊断使用同一项目流程', async ({ page }) => {
    await createTestProject(page, 'E2E测试项目-写作流程');
    const match = page.url().match(/\/project\/([^/]+)\/dashboard$/);
    expect(match?.[1]).toBeTruthy();
    const projectId = match![1];
    const stages = [
      ['世界观', 'world'],
      ['角色', 'characters'],
      ['大纲', 'outline'],
      ['写作', 'writing'],
      ['质量诊断', 'writing-quality'],
    ] as const;

    for (const [label, path] of stages) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/project/${projectId}/${path}$`));
      await expect(page.getByText('加载失败', { exact: true })).toHaveCount(0);
    }
  });
});
