import {it,expect} from 'vitest';
import {createReviewLimiter} from './review-limiter';
import {GenerationTasks,GenerationDeadlineExceededError} from '../common/generation-cancellation';
import {vi} from 'vitest';
it('shares two slots across independent review groups and nested capacity fallbacks',async()=>{
 const run=createReviewLimiter(2),releases:Array<()=>void>=[],started:string[]=[];
 const call=(id:string)=>run(async()=>{started.push(id);await new Promise<void>(resolve=>releases.push(resolve));return id;});
 const source=(async()=>{await call('aggregate');return Promise.all([call('fallback1'),call('fallback2')]);})();
 const overlap=call('overlap');expect(started).toEqual(['aggregate','overlap']);
 releases[0]();await new Promise(resolve=>setTimeout(resolve,0));expect(started).toEqual(['aggregate','overlap','fallback1']);
 releases[1]();await new Promise(resolve=>setTimeout(resolve,0));expect(started).toEqual(['aggregate','overlap','fallback1','fallback2']);
 releases[2]();releases[3]();await Promise.all([source,overlap]);
});
it('releases a slot after failure',async()=>{
 const run=createReviewLimiter(1);await expect(run(async()=>{throw Error('protocol incomplete');})).rejects.toThrow('protocol');
 expect(await run(async()=>42)).toBe(42);
});


it('removes cancelled queued reviews without waiting for the running model or leaking a slot',async()=>{
 vi.useFakeTimers();
 try{
  const tasks=new GenerationTasks(),run=createReviewLimiter(1);
  const started:string[]=[];
  let releaseFirst!:()=>void;
  const firstPending=new Promise<void>(resolve=>{releaseFirst=resolve;});
  let cancelledQueueError:unknown;
  const execution=tasks.run('discovery','queued-review-deadline','',async()=>{
   const first=run(async()=>{started.push('first');await firstPending;return 'first';});
   const second=run(async()=>{started.push('second');return 'second';})
    .catch(error=>{cancelledQueueError=error;return 'cancelled';});
   return Promise.all([first,second]);
  },{deadlineAt:Date.now()+20});
  await vi.advanceTimersByTimeAsync(20);
  expect(cancelledQueueError).toBeInstanceOf(GenerationDeadlineExceededError);
  expect(started).toEqual(['first']);
  releaseFirst();
  await expect(execution).resolves.toEqual(['first','cancelled']);
  expect(tasks.isRunning('discovery','queued-review-deadline')).toBe(false);
  await expect(run(async()=>42)).resolves.toBe(42);
 }finally{vi.useRealTimers();}
});
