import {afterEach,describe,expect,it,vi} from 'vitest';
import {GenerationTasks,GenerationDeadlineExceededError,assertGenerationActive,currentGenerationSignal,withGenerationSignal,waitForGeneration} from './generation-cancellation';
import {RealLLMService} from '../chain/real-llm.service';
import {discoveryDeadlineResult} from '../chain/discovery-fulfillment';
afterEach(()=>vi.useRealTimers());
describe('one discovery request lifetime',()=>{
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
 it('preserves qualified evidence and never calls partial or late delivery successful',()=>{
  const passed=[{sourcePremiseId:'P1',gate:'passed'},{sourcePremiseId:'P2',gate:'passed'}];
  const partial=discoveryDeadlineResult({success:false,ideas:[],qualifiedIdeas:passed,appealGate:{qualified:2}},5,600000,'deadline');
  expect(partial).toMatchObject({success:false,status:'incomplete',ideas:[],totalIdeas:0,appealGate:{qualified:2,shortfall:3,returned:0,deadlineExceeded:true}});
  expect(partial.qualifiedIdeas).toBe(passed);
  const late=discoveryDeadlineResult({success:true,ideas:passed,totalIdeas:2},2,600000,'deadline');
  expect(late.success).toBe(false);expect(late.totalIdeas).toBe(0);expect(late.qualifiedIdeas).toBe(passed);
 });
});
