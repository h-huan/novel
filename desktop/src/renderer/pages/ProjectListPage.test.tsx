import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '@novel/shared';
import type { GenerationRecoveryAudit } from '../lib/generationRecovery';
import { ProjectCard } from './ProjectListPage';

const roots: Array<ReturnType<typeof createRoot>> = [];

afterEach(() => {
  roots.forEach(root => act(() => root.unmount()));
  roots.length = 0;
  document.body.innerHTML = '';
});

function audit(overrides: Partial<GenerationRecoveryAudit> = {}): GenerationRecoveryAudit {
  return {
    status: 'generation_failed',
    canResume: true,
    running: false,
    recommendedAction: '可以恢复',
    missingModules: [],
    consistencyIssues: [],
    protectionReasons: [],
    ...overrides,
  };
}

function renderCard(
  status: Project['status'],
  onRetry = vi.fn(),
  onSelect = vi.fn(),
  recoveryAudit: GenerationRecoveryAudit | null = null,
) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  const project: Project = {
    id: 'failed-1', title: '拆到最后一户', status, type: 'short_story', description: '',
    targetPlatform: 'fanqie', targetWords: 12_000, currentWorkflowStage: 'outline',
    wordCount: 0, chapterCount: 0, createdAt: new Date(), updatedAt: new Date(),
  };
  act(() => root.render(<ProjectCard
    project={project} onSelect={onSelect} onDelete={vi.fn()} onRetry={onRetry}
    retryBusy={false} retryDisabled={false} recoveryAudit={recoveryAudit} selected={false} onSelectionChange={vi.fn()}
  />));
  return { host, onRetry, onSelect };
}

describe('项目列表恢复卡片', () => {
  it('失败项目只有后端允许恢复时才显示恢复入口，点击按钮不会打开项目', () => {
    const { host, onRetry, onSelect } = renderCard('generation_failed', vi.fn(), vi.fn(), audit());
    expect(host.textContent).toContain('生成失败 · 可恢复');
    expect(host.firstElementChild?.getAttribute('style')).toContain('dashed');
    const retry = host.querySelector('button[aria-label="恢复生成 拆到最后一户"]') as HTMLButtonElement;
    expect(retry).not.toBeNull();
    act(() => retry.click());
    expect(onRetry).toHaveBeenCalledWith('failed-1');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('卡在 creating 且 worker 已停、canResume=true 时直接暴露恢复生成入口且按钮不误触发打开项目', () => {
    const onRetry = vi.fn();
    const onSelect = vi.fn();
    const { host } = renderCard('creating', onRetry, onSelect, audit({ status: 'creating', running: false, canResume: true }));
    expect(host.textContent).toContain('生成中断 · 可恢复');
    const retry = host.querySelector('button[aria-label="恢复生成 拆到最后一户"]') as HTMLButtonElement;
    expect(retry).not.toBeNull();
    expect(host.firstElementChild?.getAttribute('style')).toContain('dashed');
    act(() => retry.click());
    expect(onRetry).toHaveBeenCalledWith('failed-1');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('正常项目不显示恢复按钮', () => {
    const { host } = renderCard('active');
    expect(host.querySelector('button[aria-label^="恢复生成"]')).toBeNull();
    expect(host.textContent).toContain('可继续创作');
  });

  it('真正仍在运行的创建项目只显示查看进度，不允许再启动第二次恢复', () => {
    const { host, onRetry } = renderCard('creating', vi.fn(), vi.fn(), audit({ status: 'creating', running: true, canResume: true }));
    expect(host.textContent).toContain('资料生成中 · 查看进度');
    expect(host.querySelector('button[aria-label="恢复生成 拆到最后一户"]')).toBeNull();
    const progress = host.querySelector('button[aria-label="查看进度 拆到最后一户"]') as HTMLButtonElement;
    act(() => progress.click());
    expect(onRetry).toHaveBeenCalledWith('failed-1');
  });

  it('后端明确不允许恢复的失败项目只显示诊断，不发送恢复请求', () => {
    const { host } = renderCard('generation_failed', vi.fn(), vi.fn(), audit({ canResume: false, recommendedAction: '存在受保护人工内容，请先查看诊断' }));
    expect(host.textContent).toContain('生成失败 · 需查看诊断');
    expect(host.textContent).toContain('存在受保护人工内容，请先查看诊断');
    expect(host.querySelector('button[aria-label^="恢复生成"]')).toBeNull();
  });
});