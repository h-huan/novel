import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '@novel/shared';
import { ProjectCard } from './ProjectListPage';

const roots: Array<ReturnType<typeof createRoot>> = [];

afterEach(() => {
  roots.forEach(root => act(() => root.unmount()));
  roots.length = 0;
  document.body.innerHTML = '';
});

function renderCard(status: string, onRetry = vi.fn(), onSelect = vi.fn(), recoveryRunning = false) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  const project = {
    id: 'failed-1', title: '拆到最后一户', status, type: 'short_story',
    creationSource: 'idea_discovery', targetPlatform: 'fanqie',
    currentWorkflowStage: 'outline', wordCount: 0, updatedAt: new Date(),
  } as Project;
  act(() => root.render(<ProjectCard
    project={project} onSelect={onSelect} onDelete={vi.fn()} onRetry={onRetry}
    retryBusy={false} retryDisabled={false} recoveryRunning={recoveryRunning} selected={false} onSelectionChange={vi.fn()}
  />));
  return { host, onRetry, onSelect };
}

describe('项目列表失败卡片', () => {
  it('将失败项目置灰并提供直接重新生成入口，点击按钮不会打开项目', () => {
    const { host, onRetry, onSelect } = renderCard('generation_failed');
    expect(host.textContent).toContain('生成失败 · 不可写作');
    expect(host.firstElementChild?.getAttribute('style')).toContain('dashed');
    const retry = host.querySelector('button[aria-label="重新生成 拆到最后一户"]') as HTMLButtonElement;
    expect(retry).not.toBeNull();
    act(() => retry.click());
    expect(onRetry).toHaveBeenCalledWith('failed-1');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('正常项目不显示重新生成按钮', () => {
    const { host } = renderCard('active');
    expect(host.querySelector('button[aria-label^="重新生成"]')).toBeNull();
    expect(host.textContent).toContain('可继续创作');
  });

  it('进行中的失败项目显示查看进度入口，不再显示重新生成', () => {
    const { host, onRetry } = renderCard('generation_failed', vi.fn(), vi.fn(), true);
    expect(host.textContent).toContain('正在重新生成 · 查看进度');
    expect(host.querySelector('button[aria-label="重新生成 拆到最后一户"]')).toBeNull();
    const progress = host.querySelector('button[aria-label="查看进度 拆到最后一户"]') as HTMLButtonElement;
    act(() => progress.click());
    expect(onRetry).toHaveBeenCalledWith('failed-1');
  });
});
