/** An early refill can use the EXISTING wave only after settled final reviews
 * prove that the remaining first-wave slots cannot meet the request. */
export function provenFullCardDeficit(requested:number,selected:number,accepted:number,settled:number):number {
 if(![requested,selected,accepted,settled].every(Number.isSafeInteger)
   ||requested<1||selected<0||accepted<0||settled<accepted||settled>selected)
  throw Error('已确定完整卡缺额的请求数量或状态无效');
 return Math.max(0,requested-accepted-(selected-settled));
}

/** Lend initial preselection only its share of the EXISTING review calls.
 * Keep enough credits for a potential final-card deficit. Both stages still
 * use independent semantic/source/overlap Gates; credits are never cloned.
 * A live getter ensures nested partition reservations/refunds hit the parent. */
export function reserveFinalRefillReviewCapacity(
 parent:{remaining:number},initialReviewFloor:number,requiredRefillFloor:number,
):{remaining:number; refundReservedCalls:(amount:number)=>void} {
 if(!Number.isInteger(parent.remaining)||parent.remaining<0
   ||![initialReviewFloor,requiredRefillFloor].every(Number.isInteger)
   ||initialReviewFloor<0||requiredRefillFloor<0)
  throw Error('预选与补足审核额度无效');
 const reserve=parent.remaining>=initialReviewFloor+requiredRefillFloor
   ?requiredRefillFloor:0;
 let debited=0;
 return {
  get remaining(){return parent.remaining-reserve;},
  set remaining(value:number){
   const available=this.remaining;
   if(!Number.isSafeInteger(value)||value<0||value>available)
     throw Error('预选审核额度不能透支或重置');
   const used=available-value;
   parent.remaining-=used;
   debited+=used;
  },
  refundReservedCalls(amount:number){
   if(!Number.isSafeInteger(amount)||amount<0||amount>debited)
     throw Error('审核归还额度无效或超过已使用额度');
   parent.remaining+=amount;
   debited-=amount;
  },
 };
}

/** Delivery slots are bounded by the user's request, never by the number of
 * independently vetted or fully generated candidate cards. */
/** The generation and final review share one non-increasing budget. Reserve
 * enough for one independent review per presentation batch before offering
 * new candidates to paid screening. Never allocate from a delivery shortfall
 * alone: a missing 3/5 and only 2 affordable reviews cannot complete 5/5. */
/** A preparation overlap knows a lower-bound deficit while initial final
 * reviews are pending. Preserve enough optional source capacity for their
 * possible failures; only the later actual gap controls full-card dispatch.
 * This is a count request, never a new call allowance or a quality verdict. */
export function plannedFullCardRefillCount(knownMissing:number,requested:number,accepted:number,preparing=false):number{
 if(![knownMissing,requested,accepted].every(Number.isInteger)||requested<1||knownMissing<0
  ||accepted<0||accepted>requested||knownMissing>requested-accepted)throw Error('补位准备的已知缺额或请求数量无效');
 if(!knownMissing)return 0;
 return Math.max(knownMissing+Math.ceil(knownMissing/2),preparing?requested-accepted:knownMissing);
}

export function affordableFullCardRefillCount(
 availableSeeds: number, physicalCredits: number, reviewBatchSize: number, groupingMode=0,
): number {
 if (![availableSeeds,physicalCredits,reviewBatchSize,groupingMode].every(Number.isInteger)
  || availableSeeds < 0 || physicalCredits < 0 || reviewBatchSize < 1 || ![0,1].includes(groupingMode))
  throw Error('完整卡补足容量参数无效');
 let count=Math.min(availableSeeds,physicalCredits);
 while(count>0) {
   // Default mode audits <=3 full cards in one aggregate call. Larger
   // groups must reserve the bounded split capacity: relying on an unfunded
   // oversized aggregate risks a token-cap failure without recovery credits.
   // Both modes still independently review every actual card.
   const reviewCalls=groupingMode===0&&count<4?1:Math.ceil(count/reviewBatchSize);
   if(count+reviewCalls<=physicalCredits)return count;
   count--;
 }
 return 0;
}

/** Minimum independent source/payoff and overlap calls required to vet
 * a fixed number of newly selected premises. Never borrow credits from
 * selection or presentation budgets to fabricate an approved result. */
export function premiseReviewCallFloor(count:number, sourceBatchSize:number, groupingMode=0):number {
 if(!Number.isInteger(count)||count<0||!Number.isInteger(sourceBatchSize)||sourceBatchSize<1
   ||!Number.isInteger(groupingMode)||![0,1].includes(groupingMode))
  throw Error('题材独立复核预算参数无效');
 if(!count)return 0;
 // Every mode respects the configured source batch ceiling. Fine-grained
 // concurrency may spend extra calls only when the shared allowance funds it.
 const sourceCalls=Math.ceil(count/sourceBatchSize);
 return sourceCalls+(count>1?1:0);
}

/** Trim only optional refill hedges when source review cannot cover them.
 * The mandatory delivery gap remains a hard requirement at the call site.
 * No review is skipped for any candidate actually returned. */
export function affordableReviewedPremiseCount(
 availableCount:number,sourceCredits:number,sourceBatchSize:number,groupingMode=0,
 mandatoryCount=0,
):number {
 if(!Number.isInteger(availableCount)||availableCount<0||!Number.isInteger(sourceCredits)||sourceCredits<0
   ||!Number.isInteger(mandatoryCount)||mandatoryCount<0||mandatoryCount>availableCount)
  throw Error('补充题材审核额度无效');
 let count=availableCount;
 while(count>0&&premiseReviewCallFloor(count,sourceBatchSize,groupingMode)>sourceCredits)count--;
 // Demand never creates credits. Report a real deficit rather than buying
 // an unpartitioned review outside the admission planner's capacity model.
 return count;
}

export function missingRequestedIdeaSlots(slotIds:readonly string[],acceptedIds:ReadonlySet<string>,requestedCount:number):string[] {
  if (!Number.isInteger(requestedCount) || requestedCount < 0) throw Error('请求交付数量无效');
  const uniqueSlots = [...new Set(slotIds.filter(id => !!id))];
  // Only approved identities belonging to this reviewed batch satisfy its delivery demand.
  // Unknown or duplicate IDs must not hide a genuine shortfall.
  const approvedInBatch = uniqueSlots.filter(id => acceptedIds.has(id)).length;
  return uniqueSlots.filter(id => !acceptedIds.has(id)).slice(0, Math.max(0, requestedCount - approvedInBatch));
}

/** Lower bound for the NEXT independently reviewed original-pool correction.
 * A changed/new narrative needs source/payoff review; replacing an identity
 * in a multi-card shortlist also changes pairs and needs overlap review.
 * This is an admission check, never a quality pass or a new call allowance.
 */
export function minimumReselectionReviewCalls(
 selectedCount:number,forcesNewIdentity:boolean,changedCount=1,sourceBatchSize=3,groupingMode=0,
):number {
 if(!Number.isInteger(selectedCount)||selectedCount<1
   ||!Number.isInteger(changedCount)||changedCount<1||changedCount>selectedCount
   ||!Number.isInteger(sourceBatchSize)||sourceBatchSize<1||![0,1].includes(groupingMode))
  throw Error('重选复核的已选数量或来源分组无效');
 // Use the same source partition floor as execution in BOTH modes.
 const sourceCalls=premiseReviewCallFloor(changedCount,sourceBatchSize,groupingMode)
   -(changedCount>1?1:0);
 return sourceCalls+(forcesNewIdentity&&selectedCount>1?1:0);
}

/** One scoped preselection repair wave: optional screening surplus is not
 * a delivery deficit. Only actual missing delivery slots are mandatory.
 * A small model-reviewed hedge remains for full-card rejection, without
 * filling every failed optional screening slot through serial reselection. */
export function preselectionRecoveryTarget(deliveryCount:number,retainedApproved:number,screeningTarget=deliveryCount):{mandatory:number;hedge:number;total:number}{
 if(!Number.isInteger(deliveryCount)||deliveryCount<1||!Number.isInteger(retainedApproved)||retainedApproved<0
   ||!Number.isInteger(screeningTarget)||screeningTarget<deliveryCount)
   throw Error('预选交付容量参数无效');
 const mandatory=Math.max(0,deliveryCount-retainedApproved);
 // One optional source-vetted survivor avoids a slow post-final-card refill
 // when the initial shortlist had proven rejections. The caller must still
 // fund reselection and every independent review from the original allowance.
 const hedge=mandatory>0?Math.min(2,Math.max(1,Math.ceil(mandatory*3/4)))
   :0;
 return {mandatory,hedge,total:mandatory+hedge};
}

/** Reuse authored title options before paying for another card. Never invent a
 * title or relax the original length Gate: the resulting card still goes
 * through duplicate, appeal and independent presentation checks. */
export function retainValidStructuredIdeaTitle<T extends {title?:unknown;alternateTitles?:unknown}>(
 card:T,originalWorkingTitle:unknown,
):T {
 const valid=(value:unknown):value is string=>typeof value==='string'
   &&((value.replace(/[《》「」]/g,'').trim().replace(/[，、,\s]/g,'').length)>=4)
   &&((value.replace(/[《》「」]/g,'').trim().replace(/[，、,\s]/g,'').length)<=16);
 if(valid(card.title))return card;
 const alternatives=Array.isArray(card.alternateTitles)?card.alternateTitles:[];
 const replacement=[...alternatives,originalWorkingTitle].find(valid);
 return replacement?{...card,title:replacement}:card;
}

/** Optional screening surplus must fit the entire original review allowance.
 * Never reduce the actual user demand or borrow from the final refill reserve. */
export function preferFineSourceReview(count:number,batchSize:number,concurrency:number,groupingMode=0):boolean{
 return groupingMode===0&&count>batchSize&&concurrency>=Math.ceil(count/2)+1;
}
export function plannedPreselectionCount(requested:number,desired:number,credits:number,batchSize:number,groupingMode:number,concurrency:number):number{
 if(!Number.isInteger(requested)||requested<1||!Number.isInteger(concurrency)||concurrency<1)throw Error('选优容量参数无效');
 const mandatory=Math.min(requested,desired);
 const count=affordableReviewedPremiseCount(desired,credits,batchSize,groupingMode,mandatory);
 if(count<mandatory)return 0;
 // Screening surplus must not be traded for unaffordable extra partitions.
 // The scheduler below funds fine partitions only after a whole correction.
 return count;
}
export function fundedSourceReviewGroups(count:number,batchSize:number,credits:number,concurrency:number,groupingMode=0):number{
 const minimum=premiseReviewCallFloor(count,batchSize,groupingMode)-(count>1?1:0);
 if(!Number.isInteger(credits)||credits<0||!Number.isInteger(concurrency)||concurrency<1)throw Error('来源审核容量无效');
 if(!count||credits<minimum)return 0;
 const correctionFloor=premiseReviewCallFloor(count,batchSize,groupingMode);
 // Never spend the last correction credits merely to make the first audit
 // narrower. An independently rejected premise still needs replacement and
 // a new source/overlap verdict inside the same allowance.
 // At most one wave of concurrently runnable source partitions. More
 // partitions than live remote slots merely create a second serial wave,
 // increase wall time and spend calls that could fund a real correction.
 // Every actual selected premise remains independently reviewed, with the
 // same configured per-partition size ceiling and unchanged quality Gates.
 const oneWaveGroups=Math.max(minimum,Math.min(count,concurrency));
 return preferFineSourceReview(count,batchSize,concurrency,groupingMode)&&credits>=count+correctionFloor
  ?oneWaveGroups:minimum;
}

/** Full-card fulfillment is governed by real quality gates and the unchanged
 * physical-call budget, never by an elapsed-time cancellation. */
