import { assertGenerationActive, currentGenerationSignal, generationCancellationReason } from '../common/generation-cancellation';

/** One shared queue around actual independent review calls, including fallback
 * partitions. Outer orchestration must not hold a slot while waiting on
 * children. Cancellation must also remove not-yet-started work immediately:
 * otherwise a 10-minute discovery deadline can keep waiting for queued reviews
 * which will never become admissible output. */
export function createReviewLimiter(concurrency:number){
  if(!Number.isInteger(concurrency)||concurrency<1)throw Error('审核并发上限须为正整数');
  let active=0;
  const waiting:Array<{resume:()=>void}>=[];
  return async function run<T>(task:()=>Promise<T>):Promise<T>{
    assertGenerationActive();
    const signal=currentGenerationSignal();
    if(active>=concurrency){
      await new Promise<void>((resolve,reject)=>{
        const waiter={resume:()=>{
          signal?.removeEventListener('abort',abort);
          resolve();
        }};
        const abort=()=>{
          const index=waiting.indexOf(waiter);
          if(index<0)return; // Already assigned a slot; its caller now owns it.
          waiting.splice(index,1);
          signal?.removeEventListener('abort',abort);
          reject(generationCancellationReason(signal));
        };
        waiting.push(waiter);
        signal?.addEventListener('abort',abort,{once:true});
        if(signal?.aborted)abort();
      });
    }else active++;
    try{
      // A deadline can fire while this task waits for a slot. Never send a
      // new physical request after it has already expired.
      assertGenerationActive();
      return await task();
    }finally{
      const next=waiting.shift();
      if(next)next.resume();
      else active--;
    }
  };
}
