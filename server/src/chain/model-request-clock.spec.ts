import {afterEach,expect,it,vi} from 'vitest';
import {bindModelRequestClock,remainingModelRequestTime,ModelRequestExpiredError} from './model-request-clock';
import {RealLLMService} from './real-llm.service';
import {IdempotentRealLLMService} from './idempotent-real-llm.service';
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
it('inherits the original deadline on re-entry and rejects expired work before dispatch',()=>{
 vi.useFakeTimers();const first=bindModelRequestClock({prompt:'same',timeout:100});vi.setSystemTime(Date.now()+90);
 const next=bindModelRequestClock(first);expect(next.deadlineAt).toBe(first.deadlineAt);expect(remainingModelRequestTime(next)).toBe(10);
 vi.setSystemTime(Date.now()+11);expect(()=>bindModelRequestClock(next)).toThrow(ModelRequestExpiredError);
});
it('rejects a late provider success when the event loop resumes before its timeout callback',async()=>{
 vi.useFakeTimers();const service=new RealLLMService({getConfig:()=>({defaults:{maxTokens:4096}}),getModelForScenario:()=>({modelName:'fixture',modelVersion:'fixture',temperature:0})} as any);
 const physical=vi.fn(async()=>{vi.setSystemTime(Date.now()+21);return {content:'{}',finishReason:'stop'};});(service as any).callModel=physical;
 await expect(service.generate({prompt:'same',timeout:20,responseFormat:'json_object'})).rejects.toBeInstanceOf(ModelRequestExpiredError);
 expect(physical).toHaveBeenCalledTimes(1);
});
it('does not re-enter the provider after an exhausted outer network recovery allowance',async()=>{
 vi.useFakeTimers();const base=vi.spyOn(RealLLMService.prototype,'generate').mockImplementation(async()=>{vi.setSystemTime(Date.now()+21);throw Error('ECONNRESET');});
 const service=new IdempotentRealLLMService({} as any,{} as any,{} as any);
 await expect(service.generate({prompt:'same',timeout:20})).rejects.toBeInstanceOf(ModelRequestExpiredError);
 expect(base).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
});
