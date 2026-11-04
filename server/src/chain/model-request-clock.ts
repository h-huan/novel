import type { LLMRequest } from './chain.types';
export class ModelRequestExpiredError extends Error {
 readonly code = 'MODEL_REQUEST_EXPIRED';
 constructor(){ super('模型请求的原始时限已耗尽，停止重发；保留未验收结果'); this.name='ModelRequestExpiredError'; }
}
/** Transport retries inherit one original allowance; never reset it on re-entry. */
export function bindModelRequestClock(request:LLMRequest):LLMRequest {
 const result={...request,deadlineAt:request.deadlineAt ?? Date.now()+(request.timeout ?? 600000)};
 if(!Number.isFinite(result.deadlineAt))throw new RangeError('模型请求截止时间无效');
 remainingModelRequestTime(result);return result;
}
export function remainingModelRequestTime(request:LLMRequest):number {
 const remaining=(request.deadlineAt ?? Date.now()+(request.timeout ?? 600000))-Date.now();
 if(remaining<=0)throw new ModelRequestExpiredError();
 return remaining;
}
