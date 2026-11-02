import { isDeepStrictEqual } from 'node:util';
import { withGenerationSignal } from '../common/generation-cancellation';
import { independentReviewBatches, type ReviewCallBudget } from './independent-review-batches';

export type DiscoveryCardResult<T, R> = {
 item:T; index:number; result:PromiseSettledResult<R>; stoppedAfterFulfillment:boolean;
};

/** Scheduling only: the caller may release an item ONLY after its source,
 * causal/category/genre and pairwise Gates pass. Every generated card still
 * enters the existing independent final Gate. First calls and final-review
 * credits share the original allowance and remain protected from recoveries. */
export class DiscoveryCardWork<T, R> {
 private readonly reviews=new Set<Promise<unknown>>();
 readonly results:DiscoveryCardResult<T,R>[]=[];
 private readonly slots:Array<{key:string;item?:T;resolved:boolean;resolve:(item:T|undefined)=>void;ready:Promise<T|undefined>}>;
 private readonly abort=new AbortController();
 private readonly waiting=new Set<()=>void>();
 private readonly queue:DiscoveryCardResult<T,R>[]=[];
 private readonly task:Promise<unknown>;
 readonly individuallyFundedReviews:boolean;
 private reviewCredits:number;
 private startedReviews=0;
 private finished=false;
 private sealed=false;
 private stopping=false;
 private closeTask?:Promise<void>;

 constructor(items:readonly T[],private readonly key:(item:T)=>string,
  private readonly parent:ReviewCallBudget,reviewCalls:number,
  run:<V>(task:()=>Promise<V>)=>Promise<V>,
  generate:(item:T,index:number,budget:ReviewCallBudget)=>Promise<R>) {
  const keys=items.map(key);
  if(new Set(keys).size!==keys.length||keys.some(id=>!id))throw Error('成卡调度身份未知或重复');
  if(!Number.isInteger(reviewCalls)||reviewCalls<0||parent.remaining<items.length+reviewCalls)
   throw Error('完整卡共享预算不足以覆盖首轮生成与独立终审');
  this.slots=keys.map(id=>{
   let resolve!:(item:T|undefined)=>void;
   const ready=new Promise<T|undefined>(done=>{resolve=done;});
   return {key:id,resolved:false,ready,resolve};
  });
  this.individuallyFundedReviews=reviewCalls>=items.length;
  this.reviewCredits=reviewCalls;parent.remaining-=reviewCalls;
  // Waiters do not hold remote-call slots. The ONE supplied limiter bounds
  // actual source reviews and card generations together, including retries.
  this.task=independentReviewBatches(this.slots,parent,Math.max(1,items.length),async(slot,index,budget)=>{
   const item=await slot.ready;if(item===undefined)return;
   let result:PromiseSettledResult<R>;
   try{result={status:'fulfilled',value:await run(()=>withGenerationSignal(this.abort.signal,()=>generate(item,index,budget)))};}
   catch(reason){result={status:'rejected',reason};}
   const row={item,index,result,stoppedAfterFulfillment:this.stopping&&result.status==='rejected'};
   this.results.push(row);this.queue.push(row);this.notify();
  }).finally(()=>{this.finished=true;this.notify();});
 }

 limitReviewCalls(total:number){
  if(!Number.isInteger(total)||total<0)throw Error('终审首调用数量无效');
  const needed=Math.max(0,total-this.startedReviews);
  if(this.reviewCredits>needed){this.parent.remaining+=this.reviewCredits-needed;this.reviewCredits=needed;}
 }

 get preparationBudget(){return this.parent;}
 get availableReviewCalls(){return this.reviewCredits+this.parent.remaining;}
 get stoppedForFulfillment(){return this.stopping;}
 runReview<V>(review:(budget:ReviewCallBudget)=>Promise<V>):Promise<V>{
  if(this.closeTask)return Promise.reject(Error('成卡调度已结束'));
  if(this.reviewCredits>0)this.reviewCredits--;
  else if(this.parent.remaining>0)this.parent.remaining--;
  else return Promise.reject(Error('终审共享预算已耗尽'));
  this.startedReviews++;
  let credit=1;const parent=this.parent;
  const budget:ReviewCallBudget={
   get remaining(){return credit+parent.remaining;},
   set remaining(value:number){
    const used=this.remaining-value;
    if(!Number.isInteger(value)||value<0||used<0)throw Error('终审预算不得透支或重置');
    const reserved=Math.min(credit,used);credit-=reserved;parent.remaining-=used-reserved;
   },
   refundReservedCalls(amount:number){if(!Number.isInteger(amount)||amount<0)throw Error('终审退款无效');credit+=amount;},
  };
  const task=(async()=>{
   try{return await withGenerationSignal(this.abort.signal,()=>review(budget));}
   finally{parent.remaining+=credit;}
  })();
  this.reviews.add(task);
  task.then(()=>this.reviews.delete(task),()=>this.reviews.delete(task));
  return task;
 }

 private notify(){for(const done of this.waiting)done();this.waiting.clear();}
 private release(slot:typeof this.slots[number],item:T|undefined){
  slot.item=item===undefined?undefined:structuredClone(item);slot.resolved=true;slot.resolve(slot.item);
 }
 approve(item:T,selection?:readonly T[]):boolean {
  if(selection){
   if(this.sealed)return false;
   const ids=selection.map(this.key),id=this.key(item);
   if(selection.length>this.slots.length||new Set(ids).size!==ids.length||ids.some(key=>!key))
    throw Error('补位成卡身份越界或重复');
   const current=selection.find(row=>this.key(row)===id);
   if(!current||!isDeepStrictEqual(current,item))throw Error('补位成卡没有同一已审核选择');
   // Validate the whole immutable released set BEFORE rebinding any pending
   // slot. A new independently approved identity reuses the original credit;
   // it must not steal a still-selected peer's pending slot or add capacity.
   for(const slot of this.slots.filter(row=>row.resolved&&row.item!==undefined)){
    const retained=selection.find(row=>this.key(row)===this.key(slot.item!));
    if(!retained||!isDeepStrictEqual(retained,slot.item))throw Error('提前成卡题材未保持同一已审核事实');
   }
   const unresolved=this.slots.filter(row=>!row.resolved);
   const retainedKeys=new Set(unresolved.filter(slot=>ids.includes(slot.key)).map(slot=>slot.key));
   const available=unresolved.filter(slot=>!retainedKeys.has(slot.key));
   const missing=ids.filter(key=>!this.slots.some(slot=>slot.key===key));
   if(missing.length>available.length)throw Error('补位成卡没有原有待审槽位');
   for(let index=0;index<available.length;index++)available[index].key=missing[index]||'';
  }
  const id=this.key(item),slot=this.slots.find(row=>row.key===id);
  if(!slot||this.sealed)return false;
  if(slot.resolved){if(!isDeepStrictEqual(slot.item,item))throw Error('提前成卡的已审核事实发生变化');return true;}
  this.release(slot,item);return true;
 }
 finish(items:readonly T[]){
  if(this.sealed)throw Error('成卡身份已锁定');
  const ids=items.map(this.key);
  if(items.length>this.slots.length||new Set(ids).size!==ids.length)throw Error('锁定成卡身份越界或重复');
  for(const slot of this.slots.filter(row=>row.resolved&&row.item!==undefined)){
   const current=items.find(item=>this.key(item)===this.key(slot.item!));
   if(!current||!isDeepStrictEqual(current,slot.item))throw Error('提前成卡题材未保持同一已审核事实');
  }
  for(const item of items){const slot=this.slots.find(row=>row.key===this.key(item));if(slot&&!slot.resolved)this.release(slot,item);}
  for(const item of items){
   if(this.slots.some(row=>row.item!==undefined&&this.key(row.item)===this.key(item)))continue;
   const slot=this.slots.find(row=>!row.resolved);if(!slot)throw Error('补位成卡身份没有原有槽位');this.release(slot,item);
  }
  for(const slot of this.slots)if(!slot.resolved)this.release(slot,undefined);
  this.sealed=true;
 }
 takeReady(){return this.queue.splice(0);}
 get done(){return this.finished;}
 get capacity(){return this.slots.length;}
 async waitForReady(){if(this.queue.length||this.finished)return;await new Promise<void>(done=>this.waiting.add(done));}
 stopSurplus(){this.stopping=true;this.abort.abort();for(const slot of this.slots)if(!slot.resolved)this.release(slot,undefined);}
 async close(){
  if(!this.closeTask)this.closeTask=(async()=>{
   if(!this.finished||this.reviews.size){this.abort.abort();for(const slot of this.slots)if(!slot.resolved)this.release(slot,undefined);}
   try{await this.task;await Promise.allSettled([...this.reviews]);}finally{this.parent.remaining+=this.reviewCredits;this.reviewCredits=0;}
  })();
  return this.closeTask;
 }
}
