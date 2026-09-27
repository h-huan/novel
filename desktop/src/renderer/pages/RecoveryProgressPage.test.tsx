import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RecoveryProgressPage from './RecoveryProgressPage';

const { getGenerationRecovery, fetchProjects } = vi.hoisted(() => ({
  getGenerationRecovery: vi.fn(), fetchProjects: vi.fn(),
}));
vi.mock('../lib/generationRecovery', () => ({ getGenerationRecovery }));
vi.mock('../stores/projectStore', () => ({ useProjectStore: (selector: any) => selector({ fetchProjects }) }));
vi.mock('../lib/api', () => ({ initializeApiBaseUrl: async () => null, getBaseUrl: () => '/api/v1' }));
vi.mock('../lib/openProject', () => ({ openProject: vi.fn() }));

let stream: MockEventSource;
class MockEventSource {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor(public url: string) { stream = this; }
  send(event: object) { this.onmessage?.({ data: JSON.stringify(event) }); }
}

let root: ReturnType<typeof createRoot>;
let host: HTMLElement;
beforeEach(() => {
  getGenerationRecovery.mockResolvedValue({ status: 'generation_failed', running: true, recommendedAction: '' });
  fetchProjects.mockResolvedValue(undefined);
  vi.stubGlobal('EventSource', MockEventSource);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function renderPage() {
  await act(async () => {
    root.render(<MemoryRouter initialEntries={[{ pathname: '/generation-progress/p-1', state: { title: '测试短篇' } }]}>
      <Routes><Route path="/generation-progress/:projectId" element={<RecoveryProgressPage />} /></Routes>
    </MemoryRouter>);
    await Promise.resolve();
  });
}

describe('重新生成进度页', () => {
  it('进入后立即连接对应项目，显示真实阶段与百分比', async () => {
    await renderPage();
    expect(stream.url).toBe('/api/v1/chain/project-creation-progress/p-1');
    expect(host.textContent).toContain('正在重新生成创作资料');
    await act(async () => stream.send({ type: 'progress', step: 'world', percent: 42, message: '正在生成世界观…' }));
    expect(host.textContent).toContain('42%');
    expect(host.textContent).toContain('正在生成世界观…');
    expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('42');
  });

  it('收到成功事件后显示进入项目，不继续等待', async () => {
    await renderPage();
    await act(async () => stream.send({ type: 'done', message: '创作资料已生成' }));
    expect(host.textContent).toContain('创作资料生成完成');
    expect(host.textContent).toContain('100%');
    expect(host.textContent).toContain('进入项目');
    expect(stream.close).toHaveBeenCalled();
  });

  it('失败事件先核实恢复状态，再显示失败诊断', async () => {
    await renderPage();
    getGenerationRecovery.mockResolvedValue({ status: 'generation_failed', running: false, recommendedAction: '请检查质量门' });
    await act(async () => {
      stream.send({ type: 'error', message: '跨模块一致性未通过' });
      await Promise.resolve();
    });
    expect(host.textContent).toContain('重新生成未完成');
    expect(host.textContent).toContain('跨模块一致性未通过');
    expect(host.textContent).toContain('返回项目列表查看诊断');
  });
});
