import { AsyncLocalStorage } from 'node:async_hooks';
import { ConflictException } from '@nestjs/common';

export class GenerationCancelledError extends Error {
  constructor() { super('已取消生成，已完成成果和留存稿已保留'); this.name = 'GenerationCancelledError'; }
}
const context = new AsyncLocalStorage<AbortSignal>();
export function currentGenerationSignal(): AbortSignal | undefined { return context.getStore(); }
export function assertGenerationActive(): void {
  if (currentGenerationSignal()?.aborted) throw new GenerationCancelledError();
}
export class GenerationTasks {
  private readonly active = new Map<string, AbortController>();
  private key(scope: 'chapter' | 'creation' | 'discovery', projectId: string, chapterId = '') { return JSON.stringify([scope, projectId, chapterId]); }
  async run<T>(scope: 'chapter' | 'creation' | 'discovery', projectId: string, chapterId: string, work: () => Promise<T>): Promise<T> {
    const key = this.key(scope, projectId, chapterId);
    if (this.active.has(key)) throw new ConflictException('该任务仍在执行或停止中，请稍后再试');
    const controller = new AbortController();
    this.active.set(key, controller);
    try { return await context.run(controller.signal, work); }
    finally { if (this.active.get(key) === controller) this.active.delete(key); }
  }
  cancel(scope: 'chapter' | 'creation' | 'discovery', projectId: string, chapterId = '') {
    const controller = this.active.get(this.key(scope, projectId, chapterId));
    if (!controller) return { cancelled: false, message: '该任务已结束或没有正在执行的生成' };
    controller.abort(new GenerationCancelledError());
    return { cancelled: true, message: '正在停止生成，已完成成果和留存稿会保留' };
  }
}
export const generationTasks = new GenerationTasks();
