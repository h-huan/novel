import {expect,it} from 'vitest';
import {DiscoveryCardWork} from './discovery-card-work';
import {createReviewLimiter} from './review-limiter';
import {currentGenerationSignal,generationTasks} from '../common/generation-cancellation';
const tick=()=>new Promise<void>(done=>setImmediate(done));
const deferred=<T>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};};
const key=(row:{id:string})=>row.id;

it('starts an approved identity before the source wave ends, once only, and refunds unused original credits',async()=>{
 const parent={remaining:24},calls:string[]=[];
 const a=deferred<string>(),b=deferred<string>();
 const work=new DiscoveryCardWork([{id:'A'},{id:'B'},{id:'C'}],key,parent,3,createReviewLimiter(2),async(item,_i,budget)=>{
  budget.remaining--;calls.push(item.id);return item.id==='A'?a.promise:b.promise;
 });
 expect(calls).toEqual([]);
 expect(work.approve({id:'outside'})).toBe(false);
 work.approve({id:'A'});work.approve({id:'A'});await tick();
 expect(calls).toEqual(['A']);
 work.finish([{id:'A'},{id:'B'}]);await tick();expect(calls).toEqual(['A','B']);
 a.resolve('card A');b.resolve('card B');await tick();
 expect(work.takeReady().map(row=>row.result.status)).toEqual(['fulfilled','fulfilled']);
 await Promise.all([work.runReview(async budget=>{budget.remaining--;}),work.runReview(async budget=>{budget.remaining--;})]);await work.close();await work.close();
 expect(parent.remaining).toBe(20); // exactly two generations and two final reviews
});

it('assigns a new independently approved replacement to an existing unused slot',async()=>{
 const parent={remaining:6},calls:string[]=[];
 const work=new DiscoveryCardWork([{id:'A'},{id:'rejected'}],key,parent,2,createReviewLimiter(2),async(item,_i,budget)=>{
  budget.remaining--;calls.push(item.id);return item.id;
 });
 work.approve({id:'A'});work.finish([{id:'A'},{id:'new'}]);await tick();await work.close();
 expect(calls).toEqual(['A','new']);expect(parent.remaining).toBe(4);
});

it('rejects changed or removed already-approved facts instead of publishing a stale card',async()=>{
 const parent={remaining:6};
 const work=new DiscoveryCardWork([{id:'A',fact:'old'}],key,parent,1,createReviewLimiter(1),async(item,_i,budget)=>{budget.remaining--;return item;});
 work.approve({id:'A',fact:'old'});
 expect(()=>work.finish([{id:'A',fact:'changed'}])).toThrow('同一已审核事实');
 await work.close();expect(parent.remaining).toBeGreaterThanOrEqual(5);
});

it('protects every unstarted generation and final review from an earlier recovery spending their first calls',async()=>{
 const parent={remaining:6},available:number[]=[];
 const work=new DiscoveryCardWork([{id:'A'},{id:'B'}],key,parent,2,createReviewLimiter(1),async(item,_i,budget)=>{
  available.push(budget.remaining);budget.remaining-=item.id==='A'?3:1;return item.id;
 });
 work.approve({id:'A'});await tick();
 expect(work.preparationBudget.remaining).toBe(0);
 await Promise.all([work.runReview(async budget=>{expect(budget.remaining).toBe(1);budget.remaining--;}),work.runReview(async budget=>{expect(budget.remaining).toBe(1);budget.remaining--;})]);
 work.finish([{id:'A'},{id:'B'}]);await tick();await work.close();
 expect(available).toEqual([3,1]);expect(parent.remaining).toBe(0);
});

it('stops only surplus work and drains active model calls before returning unused review credits',async()=>{
 const parent={remaining:8};let active=0;
 const work=new DiscoveryCardWork([{id:'A'},{id:'B'}],key,parent,2,createReviewLimiter(2),async(item,_i,budget)=>{
  budget.remaining--;active++;
  try{return await new Promise<string>((_resolve,reject)=>currentGenerationSignal()!.addEventListener('abort',()=>reject(Error('stopped')),{once:true}));}
  finally{active--;}
 });
 work.finish([{id:'A'},{id:'B'}]);await tick();expect(active).toBe(2);
 work.stopSurplus();await work.close();
 expect(active).toBe(0);expect(work.results.every(row=>row.result.status==='rejected'&&row.stoppedAfterFulfillment)).toBe(true);
 expect(parent.remaining).toBe(6);
});

it('inherits the caller cancellation even while running under its own surplus signal',async()=>{
 const started=deferred<void>();
 const task=generationTasks.run('discovery','card-work-parent-test','',async()=>{
  const parent={remaining:4};
  const work=new DiscoveryCardWork([{id:'A'}],key,parent,1,createReviewLimiter(1),async(_item,_i,budget)=>{
   budget.remaining--;started.resolve();
   return new Promise<string>((_resolve,reject)=>currentGenerationSignal()!.addEventListener('abort',()=>reject(Error('parent stopped')),{once:true}));
  });
  work.finish([{id:'A'}]);await work.waitForReady();await work.close();return work.results;
 });
 await started.promise;expect(generationTasks.cancel('discovery','card-work-parent-test').cancelled).toBe(true);
 const results=await task;expect(results[0].result.status).toBe('rejected');expect(results[0].stoppedAfterFulfillment).toBe(false);
});

it('drains unreleased slots without model calls when upstream fails',async()=>{
 const parent={remaining:6};let calls=0;
 const work=new DiscoveryCardWork([{id:'A'},{id:'B'}],key,parent,2,createReviewLimiter(2),async()=>{calls++;return '';});
 await work.close();expect(calls).toBe(0);expect(parent.remaining).toBe(6);expect(work.done).toBe(true);
});

it.each([{items:[{id:'A'},{id:'A'}]},{items:[{id:''}]}])('rejects invalid identities before reserving budget',({items})=>{
 const parent={remaining:6};
 expect(()=>new DiscoveryCardWork(items,key,parent,1,createReviewLimiter(1),async()=>'' )).toThrow('身份');
 expect(parent.remaining).toBe(6);
});

it('does not create an allowance when the existing shared budget cannot fund generation and review',()=>{
 const parent={remaining:3};
 expect(()=>new DiscoveryCardWork([{id:'A'},{id:'B'}],key,parent,2,createReviewLimiter(1),async()=>'' )).toThrow('预算不足');
 expect(parent.remaining).toBe(3);
});

it('shares the actual remote-call limiter with source reviews rather than counting waiting approvals as calls',async()=>{
 const run=createReviewLimiter(2);let active=0,peak=0;
 const enter=async()=>{active++;peak=Math.max(peak,active);await new Promise(done=>setTimeout(done,10));active--;};
 const source=run(enter),parent={remaining:8};
 const work=new DiscoveryCardWork([{id:'A'},{id:'B'},{id:'C'}],key,parent,3,run,async(item,_i,budget)=>{budget.remaining--;await enter();return item.id;});
 work.finish([{id:'A'},{id:'B'},{id:'C'}]);
 while(!work.done){await work.waitForReady();work.takeReady();}
 await work.close();await source;expect(peak).toBe(2);expect(active).toBe(0);
});

it('does not let one final-review recovery consume later final-review or generation first calls',async()=>{
 const parent={remaining:8};
 const work=new DiscoveryCardWork([{id:'A'},{id:'B'}],key,parent,2,createReviewLimiter(2),async(item,_i,budget)=>{expect(budget.remaining).toBe(1);budget.remaining--;return item.id;});
 await work.runReview(async budget=>{expect(budget.remaining).toBe(5);budget.remaining-=5;});
 await work.runReview(async budget=>{expect(budget.remaining).toBe(1);budget.remaining--;});
 work.finish([{id:'A'},{id:'B'}]);while(!work.done){await work.waitForReady();work.takeReady();}await work.close();
 expect(parent.remaining).toBe(0);
});
it('releases only review reservations no longer needed after source rejection',async()=>{
 const parent={remaining:8};
 const work=new DiscoveryCardWork([{id:'A'},{id:'B'}],key,parent,2,createReviewLimiter(2),async(item,_i,budget)=>{budget.remaining--;return item.id;});
 work.finish([{id:'A'}]);work.limitReviewCalls(1);await tick();
 await work.runReview(async budget=>{budget.remaining--;});await work.close();expect(parent.remaining).toBe(6);
});
it('cancels and drains pending final review without promoting its incomplete verdict',async()=>{
 const parent={remaining:6},started=deferred<void>();let active=0;
 const work=new DiscoveryCardWork([{id:'A'}],key,parent,1,createReviewLimiter(1),async(item,_i,budget)=>{budget.remaining--;return item.id;});
 work.finish([{id:'A'}]);await tick();
 const review=work.runReview(async budget=>{budget.remaining--;active++;started.resolve();
  try{return await new Promise<void>((_resolve,reject)=>currentGenerationSignal()!.addEventListener('abort',()=>reject(Error('review stopped')),{once:true}));}
  finally{active--;}
 }).catch(error=>error);
 await started.promise;work.stopSurplus();await work.close();expect(await review).toBeInstanceOf(Error);
 expect(active).toBe(0);expect(parent.remaining).toBe(4);
});

it('starts independently approved replacements before the remaining source wave, preserving pending peers and original credits',async()=>{
 const parent={remaining:12},calls:string[]=[];
 const work=new DiscoveryCardWork([{id:'A'},{id:'B'},{id:'C'}],key,parent,3,createReviewLimiter(3),async(item,_index,budget)=>{budget.remaining--;calls.push(item.id);return item.id;});
 work.approve({id:'C'});await tick();
 const selection=[{id:'C'},{id:'new'},{id:'B'}];
 expect(work.approve({id:'new'},selection)).toBe(true);await tick();
 expect(calls).toEqual(['C','new']);
 expect(work.approve({id:'A'})).toBe(false);
 expect(work.approve({id:'B'},selection)).toBe(true);await tick();
 work.finish(selection);await tick();await work.close();
 expect(calls).toEqual(['C','new','B']);expect(parent.remaining).toBe(9);
});

it('rejects replacement attempts that mutate released facts or expand capacity before changing pending slots',async()=>{
 const parent={remaining:8};
 const work=new DiscoveryCardWork([{id:'A',fact:'old'},{id:'B',fact:'pending'}],key,parent,2,createReviewLimiter(2),async(item,_index,budget)=>{budget.remaining--;return item;});
 work.approve({id:'A',fact:'old'});
 expect(()=>work.approve({id:'new',fact:'x'},[{id:'A',fact:'changed'},{id:'new',fact:'x'}])).toThrow('同一已审核事实');
 expect(()=>work.approve({id:'new',fact:'x'},[{id:'A',fact:'old'},{id:'B',fact:'pending'},{id:'new',fact:'x'}])).toThrow('越界');
 work.finish([{id:'A',fact:'old'},{id:'B',fact:'pending'}]);await tick();await work.close();
 expect(work.results.map(row=>row.item.id).sort()).toEqual(['A','B']);expect(parent.remaining).toBe(6);
});
