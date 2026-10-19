/** One shared queue around actual independent review calls, including fallback
 * partitions. Outer orchestration must not hold a slot while waiting on children. */
export function createReviewLimiter(concurrency:number){
  if(!Number.isInteger(concurrency)||concurrency<1)throw Error('审核并发上限须为正整数');
  let active=0;const waiting:Array<()=>void>=[];
  return async function run<T>(task:()=>Promise<T>):Promise<T>{
    if(active>=concurrency)await new Promise<void>(resolve=>waiting.push(resolve));else active++;
    try{return await task();}finally{const next=waiting.shift();if(next)next();else active--;}
  };
}
