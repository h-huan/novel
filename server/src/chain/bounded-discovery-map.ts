/** Keep original order while using each available slot; never exceed the existing call ceiling. */
export async function boundedDiscoveryMap<T, R>(items: readonly T[], concurrency: number, task: (item:T,index:number)=>Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next=0;
  const worker=async()=>{while(next<items.length){const index=next++;try{results[index]={status:'fulfilled',value:await task(items[index],index)};}catch(reason){results[index]={status:'rejected',reason};}}};
  await Promise.all(Array.from({length:Math.min(items.length,Math.max(1,Math.floor(concurrency)))},worker));
  return results;
}
