import { describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { ChainController } from './chain.controller';
import { generationTasks } from '../common/generation-cancellation';
import { createRequire } from 'node:module';

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

  it('direct resume refuses a live create worker without acquiring recovery or changing project state', async () => {
    const controller = Object.create(ChainController.prototype) as any;
    controller.generationRecovery = { acquire: vi.fn(), isCreationBusy: vi.fn(() => true) };
    let finish!: () => void;
    const hold = new Promise<void>(resolve => { finish = resolve; });
    const task = generationTasks.run('creation', 'p-1', '', async () => { await hold; });
    try {
      await expect(controller.resumeFailedGeneration('p-1')).rejects.toBeInstanceOf(ConflictException);
      expect(controller.generationRecovery.acquire).not.toHaveBeenCalled();
    } finally { finish(); await task; }
  });

  it('keeps an accepted active source intact after failed explicit rebuild and records the true recovery failure', async () => {
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE projects (id TEXT PRIMARY KEY,title TEXT,type TEXT,target_words INTEGER,target_platform TEXT,settings TEXT,status TEXT,updated_at TEXT)');
    db.prepare('INSERT INTO projects VALUES (?,?,?,?,?,?,?,?)').run('p-active','受保护的作品','short_story',20000,'fanqie',
      JSON.stringify({creativeConstitution:{confirmedStory:{title:'已确认题材'}}}),'active',new Date().toISOString());
    const c = Object.create(ChainController.prototype) as any;
    const recovery = {
      acquire:vi.fn(),release:vi.fn(),captureSnapshot:vi.fn(async()=>({projectId:'p-active',status:'active'})),
      clearForExplicitSourceRebuild:vi.fn(async()=>{ throw Error('rebuild-rejected'); }),
      restoreSnapshot:vi.fn(async()=>{db.prepare("UPDATE projects SET status='active' WHERE id='p-active'").run();}),
    };
    c.db={getDb:()=>db};c.generationRecovery=recovery;
    c.safeExtractJson=(value:string)=>JSON.parse(value);
    c.generationMetrics={beginRun:vi.fn(()=>({id:'recovery-failure'})),finishRun:vi.fn()};
    c.logger={warn:vi.fn(),error:vi.fn()};
    try {
      await expect(c.resumeFailedGeneration('p-active',true)).rejects.toThrow('rebuild-rejected');
      expect((db.prepare("SELECT status FROM projects WHERE id='p-active'").get() as any).status).toBe('active');
      expect(recovery.restoreSnapshot).toHaveBeenCalledOnce();
      expect(recovery.release).toHaveBeenCalledWith('p-active');
      expect(c.generationMetrics.beginRun).toHaveBeenCalledOnce();
      expect(c.generationMetrics.finishRun).toHaveBeenCalledWith('recovery-failure','failed',expect.any(Number),
        expect.stringContaining('"kind":"creation_stage_failure"'),expect.stringContaining('rebuild-rejected'));
    } finally {db.close();}
  });

  it('正在执行的项目不能重复启动', async () => {
    const controller = controllerWithAudit({ canResume: false, running: true, recommendedAction: '' });
    await expect(controller.startFailedGenerationRecovery('p-1')).rejects.toBeInstanceOf(ConflictException);
    expect(controller.resumeFailedGeneration).not.toHaveBeenCalled();
  });
});
