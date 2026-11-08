import { AsyncLocalStorage } from 'node:async_hooks';
import { ConflictException } from '@nestjs/common';

export class GenerationCancelledError extends Error {
  constructor() { super('已取消生成，已完成成果和留存稿已保留'); this.name = 'GenerationCancelledError'; }
}
export class GenerationDeadlineExceededError extends GenerationCancelledError {
  readonly code = 'GENERATION_DEADLINE_EXCEEDED';
  constructor(readonly scope: string, readonly deadlineBudgetMs?: number) {
    super(); this.name = 'GenerationDeadlineExceededError';
    const minutes = deadlineBudgetMs != null && Number.isFinite(deadlineBudgetMs) && deadlineBudgetMs >= 60000
      ? Math.round(deadlineBudgetMs / 60000)
      : null;
    const label = scope === 'discovery' ? '灵感发现' : scope === 'creation' ? '项目创建' : '生成任务';
    this.message = `${label}超过整次请求总时限${minutes != null ? `（${minutes} 分钟，判定为不合格）` : ''}，已停止在途调用并保留已验收结果；本次未完成`;
  }
}
const context = new AsyncLocalStorage<{signal:AbortSignal;checkDeadline?:()=>void}>();
export function currentGenerationSignal(): AbortSignal | undefined { return context.getStore()?.signal; }
export function withGenerationSignal<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  const parent = context.getStore();
  const combined = parent ? AbortSignal.any([parent.signal, signal]) : signal;
  return context.run({signal:combined,checkDeadline:parent?.checkDeadline}, async () => { assertGenerationActive(); return work(); });
}
export function generationCancellationReason(signal = currentGenerationSignal()): GenerationCancelledError {
  return signal?.reason instanceof GenerationCancelledError ? signal.reason : new GenerationCancelledError();
}
export function assertGenerationActive(): void {
  context.getStore()?.checkDeadline?.();
  if (currentGenerationSignal()?.aborted) throw generationCancellationReason();
}
/** Retry backoff consumes the same request lifetime and ends on cancellation. */
export function waitForGeneration(ms: number): Promise<void> {
  assertGenerationActive();
  const signal = currentGenerationSignal();
  return new Promise((resolve,reject)=>{
    const finish = () => { signal?.removeEventListener('abort',abort); resolve(); };
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort',abort); reject(generationCancellationReason(signal)); };
    const timer = setTimeout(finish,ms);
    signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted)abort();
  });
}
export class GenerationTasks {
  private readonly active = new Map<string, AbortController>();
  private key(scope: 'chapter' | 'creation' | 'discovery', projectId: string, chapterId = '') { return JSON.stringify([scope, projectId, chapterId]); }
  isRunning(scope: 'chapter' | 'creation' | 'discovery', projectId: string, chapterId = ''): boolean {
    return this.active.has(this.key(scope, projectId, chapterId));
  }
  async run<T>(scope: 'chapter' | 'creation' | 'discovery', projectId: string, chapterId: string, work: () => Promise<T>, options: { deadlineAt?: number } = {}): Promise<T> {
    const key = this.key(scope, projectId, chapterId);
    if (this.active.has(key)) throw new ConflictException('该任务仍在执行或停止中，请稍后再试');
    if(options.deadlineAt !== undefined && !Number.isFinite(options.deadlineAt))throw new RangeError('生成任务截止时间无效');
    const deadlineBudgetMs = options.deadlineAt !== undefined && Number.isFinite(options.deadlineAt)
      ? options.deadlineAt - Date.now()
      : undefined;
    const controller = new AbortController();
    const expire = () => controller.abort(new GenerationDeadlineExceededError(scope, deadlineBudgetMs));
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    if(options.deadlineAt !== undefined){
      const remaining = options.deadlineAt - Date.now();
      if(remaining <= 0)expire();
      else { deadlineTimer = setTimeout(expire,remaining); deadlineTimer.unref?.(); }
    }
    this.active.set(key, controller);
    try { return await context.run({signal:controller.signal,checkDeadline:()=>{if(options.deadlineAt !== undefined && Date.now() >= options.deadlineAt)expire();}}, async()=>{assertGenerationActive();return work();}); }
    finally {
      if(deadlineTimer)clearTimeout(deadlineTimer);
      if (this.active.get(key) === controller) this.active.delete(key);
    }
  }
  cancel(scope: 'chapter' | 'creation' | 'discovery', projectId: string, chapterId = '') {
    const controller = this.active.get(this.key(scope, projectId, chapterId));
    if (!controller) return { cancelled: false, message: '该任务已结束或没有正在执行的生成' };
    controller.abort(new GenerationCancelledError());
    return { cancelled: true, message: '正在停止生成，已完成成果和留存稿会保留' };
  }
}
export const generationTasks = new GenerationTasks();
