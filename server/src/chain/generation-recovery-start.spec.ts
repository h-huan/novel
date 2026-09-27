import { describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { ChainController } from './chain.controller';

function controllerWithAudit(audit: object) {
  const controller = Object.create(ChainController.prototype) as any;
  controller.generationRecovery = { audit: vi.fn().mockResolvedValue(audit) };
  controller.projectCreationEventHistory = new Map();
  controller.projectLastPercent = new Map();
  controller.projectCreationListeners = new Map();
  controller.logger = { debug: vi.fn() };
  controller.writingGateway = { notifyProjectCreationProgress: vi.fn() };
  controller.resumeFailedGeneration = vi.fn(() => new Promise(() => {}));
  return controller;
}

describe('失败项目重写启动接口', () => {
  it('不等待整个模型生成即返回，并留下可回放的首个进度事件', async () => {
    const controller = controllerWithAudit({ canResume: true, running: false });
    const result = await controller.startFailedGenerationRecovery('p-1');
    expect(result).toEqual({ success: true, projectId: 'p-1', status: 'creating' });
    expect(controller.resumeFailedGeneration).toHaveBeenCalledWith('p-1');
    expect(controller.projectCreationEventHistory.get('p-1')).toMatchObject([
      { type: 'progress', step: 'recovery', percent: 1, status: 'running' },
    ]);
  });

  it('正在执行的项目不能重复启动', async () => {
    const controller = controllerWithAudit({ canResume: false, running: true, recommendedAction: '' });
    await expect(controller.startFailedGenerationRecovery('p-1')).rejects.toBeInstanceOf(ConflictException);
    expect(controller.resumeFailedGeneration).not.toHaveBeenCalled();
  });
});
