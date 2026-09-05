/**
 * CreationContextMiddleware —— 全局请求中间件
 * 从每个请求的 params/query/body 提取 projectId，绑定到 AsyncLocalStorage，
 * 使该请求内全部 LLM 埋点自动归属到对应小说（无需在 30+ 调用点逐个传 projectId）。
 * 注意：next() 必须在 ALS.run 回调内调用，下游 async 链才会继承上下文。
 */
import { Injectable, NestMiddleware } from '@nestjs/common';
import { creationAsyncStorage, extractProjectId } from './creation-context';

@Injectable()
export class CreationContextMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void): void {
    const projectId =
      extractProjectId(req?.params) ??
      extractProjectId(req?.query) ??
      extractProjectId(req?.body);
    creationAsyncStorage.run({ projectId: projectId ?? null }, () => next());
  }
}
