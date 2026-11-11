import {afterEach,describe,expect,it,vi} from 'vitest';
import {GenerationTasks,GenerationDeadlineExceededError,assertGenerationActive,currentGenerationSignal,withGenerationSignal,waitForGeneration,remainingGenerationMs} from './generation-cancellation';
import {RealLLMService} from '../chain/real-llm.service';
afterEach(()=>vi.useRealTimers());
describe('explicit test-only deadlines and unbounded production-style discovery',()=>{
 it('cancels parallel child work and backoff under the original deadline, then releases the slot',async()=>{
  vi.useFakeTimers();const tasks=new GenerationTasks(),signals:AbortSignal[]=[];
  const task=tasks.run('discovery','same-request','',async()=>{
   await Promise.all([0,1,2].map(()=>withGenerationSignal(new AbortController().signal,async()=>{
    signals.push(currentGenerationSignal()!);await waitForGeneration(1000);throw Error('must never retry after deadline');
   })));
  },{deadlineAt:Date.now()+20}).then(()=>null,error=>error);
  await vi.advanceTimersByTimeAsync(20);expect(await task).toBeInstanceOf(GenerationDeadlineExceededError);
  expect(signals).toHaveLength(3);expect(signals.every(signal=>signal.aborted)).toBe(true);
  expect(tasks.isRunning('discovery','same-request')).toBe(false);
  await expect(tasks.run('discovery','same-request','',async()=>{assertGenerationActive();return 'next';})).resolves.toBe('next');
 });
 it('checks the original clock even before a delayed timer callback runs',async()=>{
  vi.useFakeTimers();const tasks=new GenerationTasks(),start=Date.now();
  await expect(tasks.run('discovery','clock','',async()=>{
   vi.setSystemTime(start+50);assertGenerationActive();
  },{deadlineAt:start+20})).rejects.toBeInstanceOf(GenerationDeadlineExceededError);
  const work=vi.fn(async()=>undefined);
  await expect(tasks.run('discovery','expired','',work,{deadlineAt:Date.now()-1})).rejects.toBeInstanceOf(GenerationDeadlineExceededError);
  expect(work).not.toHaveBeenCalled();
 });
 it('does not spend another physical attempt when the request expires during a model call',async()=>{
  vi.useFakeTimers();const tasks=new GenerationTasks();
  const metrics={beginRun:vi.fn(()=>({id:'deadline-run',constitution:null})),finishRun:vi.fn()};
  const service=new RealLLMService({getConfig:()=>({defaults:{maxTokens:4096}}),getModelForScenario:()=>({modelName:'fixture',modelVersion:'fixture',temperature:0})} as any,metrics as any);
  const call=vi.fn((...args:any[])=>new Promise((_resolve,reject)=>args[9].addEventListener('abort',()=>reject(Error('ECONNRESET')),{once:true})));
  (service as any).callModel=call;
  const task=tasks.run('discovery','model','',()=>service.generate({prompt:'候选',scenario:'idea_generate',responseFormat:'json_object',timeout:1200000,physicalCallBudget:{remaining:2}}),{deadlineAt:Date.now()+20}).then(()=>null,error=>error);
  await vi.advanceTimersByTimeAsync(20);expect(await task).toBeInstanceOf(GenerationDeadlineExceededError);
  expect(call).toHaveBeenCalledTimes(1);
  expect(metrics.finishRun).toHaveBeenCalledWith('deadline-run','cancelled',expect.any(Number),undefined,expect.stringContaining('整次请求总时限'));
 });
 it('does not throw away qualified cards or cancel work after eleven minutes without an explicit deadline',async()=>{
  vi.useFakeTimers();
  const tasks=new GenerationTasks();
  const passed=[{sourcePremiseId:'P1',gate:'passed'},{sourcePremiseId:'P2',gate:'passed'}];
  const task=tasks.run('discovery','production-style','',async()=>{
    await waitForGeneration(11*60*1000);
    return {success:true,ideas:passed,totalIdeas:2,appealGate:{qualified:2,returned:2,shortfall:0}};
  });
  await vi.advanceTimersByTimeAsync(11*60*1000);
  await expect(task).resolves.toMatchObject({
    success:true,ideas:passed,totalIdeas:2,
    appealGate:{qualified:2,returned:2,shortfall:0},
  });
  expect(tasks.isRunning('discovery','production-style')).toBe(false);
 });
 it('hard-stops a creation task at 30 minutes and reports the deadline as unfinished',async()=>{
  vi.useFakeTimers();
  const tasks=new GenerationTasks();
  const task=tasks.run('creation','project-30m','',async()=>{
    await waitForGeneration(31*60*1000);
    return 'must never finish after the deadline';
  },{deadlineAt:Date.now()+30*60*1000}).then(()=>null,error=>error);
  await vi.advanceTimersByTimeAsync(30*60*1000);
  const error=await task;
  expect(error).toBeInstanceOf(GenerationDeadlineExceededError);
  expect((error as Error).message).toContain('项目创建超过整次请求总时限（30 分钟');
  expect(tasks.isRunning('creation','project-30m')).toBe(false);
 });
 it('exposes the remaining request lifetime so a repair round can refuse to start',async()=>{
  const tasks=new GenerationTasks();
  const start=Date.now();
  let inside:number|undefined;
  await tasks.run('creation','remaining','',async()=>{
   inside=remainingGenerationMs();
  },{deadlineAt:start+30*60*1000});
  expect(inside).toBeGreaterThan(0);
  expect(inside).toBeLessThanOrEqual(30*60*1000);
  expect(remainingGenerationMs()).toBeUndefined();
 });
});
