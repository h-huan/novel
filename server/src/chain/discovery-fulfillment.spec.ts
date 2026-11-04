import {it,expect} from 'vitest';
import {IDEA_DISCOVERY_MAX_WALL_MS} from '../../shared/src/执行标准';
import {provenFullCardDeficit,missingRequestedIdeaSlots,affordableFullCardRefillCount,affordableReviewedPremiseCount,premiseReviewCallFloor,reserveFinalRefillReviewCapacity,preselectionRecoveryTarget,minimumReselectionReviewCalls,plannedPreselectionCount,fundedSourceReviewGroups,retainValidStructuredIdeaTitle} from './discovery-fulfillment';

it('only proves an early full-card shortfall from settled, not pending, cards',()=>{
 expect(provenFullCardDeficit(5,6,1,4)).toBe(2);
 expect(provenFullCardDeficit(5,6,3,4)).toBe(0);
 expect(provenFullCardDeficit(5,6,3,6)).toBe(2);
 for(let requested=1;requested<=8;requested++)for(let chosen=0;chosen<=10;chosen++)
  for(let settled=0;settled<=chosen;settled++)for(let passed=0;passed<=settled;passed++)
   expect(provenFullCardDeficit(requested,chosen,passed,settled)).toBe(
    Math.max(0,requested-passed-(chosen-settled)));
 expect(()=>provenFullCardDeficit(5,6,3,2)).toThrow();
});

it('keeps final-card refill review credits without cloning or overspending the original allowance',()=>{
 const budget={remaining:12};
 const initial=reserveFinalRefillReviewCapacity(budget,4,2);
 expect(initial.remaining).toBe(10);
 initial.remaining-=4;expect(budget.remaining).toBe(8);expect(initial.remaining).toBe(6);
 initial.remaining-=3;expect(budget.remaining).toBe(5);
 initial.refundReservedCalls(1);expect(budget.remaining).toBe(6);
 // After preselection, the refill gets the REAL unused underlying credits.
 expect(budget.remaining).toBe(6);
 const tight={remaining:3};
 const noReserve=reserveFinalRefillReviewCapacity(tight,4,2);
 expect(noReserve.remaining).toBe(3);
 noReserve.remaining-=2;expect(tight.remaining).toBe(1);
 expect(()=>{initial.remaining=-1;}).toThrow();
 expect(()=>{initial.remaining=initial.remaining+1;}).toThrow('不能透支或重置');
 expect(()=>{initial.remaining=Number.NaN;}).toThrow('不能透支或重置');
 expect(()=>initial.refundReservedCalls(999)).toThrow('超过已使用额度');
 expect(budget.remaining).toBe(6);
 const empty={remaining:4},idle=reserveFinalRefillReviewCapacity(empty,2,1);
 expect(()=>idle.refundReservedCalls(1)).toThrow('超过已使用额度');
 expect(empty.remaining).toBe(4);
 expect(()=>reserveFinalRefillReviewCapacity({remaining:-1},1,2)).toThrow();
});

it('reserves independent quality-review calls for each affordable refill batch',()=>{
 expect(affordableFullCardRefillCount(5,9,2)).toBe(5);
 expect(affordableFullCardRefillCount(5,6,2)).toBe(4);
 expect(affordableFullCardRefillCount(5,4,2)).toBe(3);
 expect(affordableFullCardRefillCount(5,2,2)).toBe(1);
 expect(affordableFullCardRefillCount(5,1,2)).toBe(0);
 expect(affordableFullCardRefillCount(0,24,2)).toBe(0);
  // These cases previously rejected affordable 3-card refills by reserving
  // nonexistent second aggregate-review calls, causing real 5/5 shortfalls.
  expect(affordableFullCardRefillCount(3,4,2,0)).toBe(3);
  expect(affordableFullCardRefillCount(3,4,2,1)).toBe(2);
  expect(affordableFullCardRefillCount(4,5,2,0)).toBe(3);
  expect(affordableFullCardRefillCount(4,6,2,1)).toBe(4);
  expect(()=>affordableFullCardRefillCount(3,4,2,2)).toThrow('补足容量');
 expect(()=>affordableFullCardRefillCount(5,3,0)).toThrow();
});

it('does not pay for a replacement when its independent source and overlap reviews are unfundable',()=>{
 expect(minimumReselectionReviewCalls(5,true)).toBe(2);
 expect(minimumReselectionReviewCalls(8,true)).toBe(2);
 expect(minimumReselectionReviewCalls(5,false)).toBe(1);
 expect(minimumReselectionReviewCalls(1,true)).toBe(1);
 // A grouping-mode-1 original-pool repair of five changed premises needs
 // two source partitions and one independent changed-pair review, not two.
 expect(minimumReselectionReviewCalls(8,true,5,3,1)).toBe(3);
 expect(minimumReselectionReviewCalls(8,true,8,3,1)).toBe(4);
 expect(minimumReselectionReviewCalls(8,true,8,3,0)).toBe(4);
 expect(minimumReselectionReviewCalls(5,false,4,3,1)).toBe(2);
 expect(()=>minimumReselectionReviewCalls(5,true,6,3,1)).toThrow();
 expect(()=>minimumReselectionReviewCalls(5,true,1,0,1)).toThrow();
 expect(()=>minimumReselectionReviewCalls(5,true,1,3,2)).toThrow();
 expect(()=>minimumReselectionReviewCalls(0,true)).toThrow();
});

it('preflights every source partition and the independent overlap before spending a refill selection',()=>{
 expect(premiseReviewCallFloor(0,3)).toBe(0);
 expect(premiseReviewCallFloor(1,3)).toBe(1);
 expect(premiseReviewCallFloor(3,3)).toBe(2);
 expect(premiseReviewCallFloor(3,2)).toBe(3); // all modes fund the same batch-size cap
 expect(premiseReviewCallFloor(3,2,1)).toBe(3); // configured split review
 expect(affordableReviewedPremiseCount(5,2,2,0)).toBe(2);
 expect(affordableReviewedPremiseCount(5,2,2,1)).toBe(2);
 // An unmet mandatory count is a real shortfall, not permission to ignore
 // the partition cost or trigger a slow monolithic fallback.
 expect(affordableReviewedPremiseCount(5,2,2,0,4)).toBe(2);
 expect(affordableReviewedPremiseCount(5,3,2,0,4)).toBe(4);
 expect(affordableReviewedPremiseCount(5,1,2,0,4)).toBe(1);
 expect(affordableReviewedPremiseCount(5,2,2,1,4)).toBe(2);
 expect(()=>affordableReviewedPremiseCount(3,2,2,0,4)).toThrow();
 expect(premiseReviewCallFloor(4,3)).toBe(3);
 expect(premiseReviewCallFloor(5,3)).toBe(3);
 // Actual failed run: four needed with only two independent review credits.
 // Do not pay for the extra pool + selection calls when 4/5 cannot be audited.
 expect(affordableReviewedPremiseCount(5,2,3)).toBe(3);
 expect(affordableReviewedPremiseCount(5,1,3)).toBe(1);
 expect(affordableReviewedPremiseCount(5,0,3)).toBe(0);
 // Three mandatory cards can proceed with two credits; optional hedges
 // cannot displace the independently verifiable delivery floor.
 expect(affordableReviewedPremiseCount(5,2,3)).toBe(3);
 expect(affordableReviewedPremiseCount(5,3,3)).toBe(5);
 expect(()=>affordableReviewedPremiseCount(3,-1,3)).toThrow();
 expect(()=>premiseReviewCallFloor(4,0)).toThrow();
});

it('never confuses surplus vetted candidates with user delivery slots',()=>{
 const ids=['P1','P2','P3','P4','P5','P6','P7','P8'];
 expect(missingRequestedIdeaSlots(ids,new Set(['P1','P2','P3','P4','P5']),5)).toEqual([]);
 expect(missingRequestedIdeaSlots(ids,new Set(['P2','P3','P4','P6']),5)).toHaveLength(1);
 expect(missingRequestedIdeaSlots(ids,new Set(ids),5)).toEqual([]);
 expect(missingRequestedIdeaSlots(ids,new Set(),5)).toEqual(ids.slice(0,5));
 expect(missingRequestedIdeaSlots(ids,new Set(['P1','OUTSIDE']),5)).toEqual(['P2','P3','P4','P5']);
 expect(missingRequestedIdeaSlots(['P1','P1','P2','P3'],new Set(['P1']),3)).toEqual(['P2','P3']);
 expect(()=>missingRequestedIdeaSlots(ids,new Set(),-1)).toThrow();
});

it('limits costly preselection reselection to real user delivery deficits plus bounded hedge',()=>{
 // Historical real trace: eight initially screened, three genuinely passed,
 // yet the former loop demanded five mandatory replacements for five delivery.
 expect(preselectionRecoveryTarget(5,3)).toEqual({mandatory:2,hedge:2,total:4});
 expect(preselectionRecoveryTarget(5,4)).toEqual({mandatory:1,hedge:1,total:2});
 expect(preselectionRecoveryTarget(5,5)).toEqual({mandatory:0,hedge:0,total:0});
 expect(preselectionRecoveryTarget(5,5,8)).toEqual({mandatory:0,hedge:0,total:0});
 expect(preselectionRecoveryTarget(5,6,8)).toEqual({mandatory:0,hedge:0,total:0});
 expect(preselectionRecoveryTarget(5,8,8)).toEqual({mandatory:0,hedge:0,total:0});
 expect(preselectionRecoveryTarget(5,4,8)).toEqual({mandatory:1,hedge:1,total:2});
 expect(preselectionRecoveryTarget(5,7)).toEqual({mandatory:0,hedge:0,total:0});
 expect(()=>preselectionRecoveryTarget(5,5,4)).toThrow('预选交付容量参数无效');
 expect(preselectionRecoveryTarget(1,0)).toEqual({mandatory:1,hedge:1,total:2});
 expect(preselectionRecoveryTarget(10,3)).toEqual({mandatory:7,hedge:2,total:9});
 expect(()=>preselectionRecoveryTarget(5,-1)).toThrow();
});

it('uses only authored, correctly sized title alternatives before unchanged quality Gates',()=>{
 const original={title:'这是一个超过标准长度而无法使用的完整小说标题名称',alternateTitles:['我让老人坐了起来','更短故事'],sourcePremiseId:'P5'};
 const fixed=retainValidStructuredIdeaTitle(original,'伺候人的手艺，不丢人');
 expect(fixed.title).toBe('我让老人坐了起来');
 expect(original.title).not.toBe(fixed.title);
 expect(fixed.sourcePremiseId).toBe('P5');
 expect(retainValidStructuredIdeaTitle({...original,title:'原本就合格'},'备用')).toMatchObject({title:'原本就合格'});
 expect(retainValidStructuredIdeaTitle({...original,alternateTitles:[]},'伺候人的手艺，不丢人').title).toBe('伺候人的手艺，不丢人');
 expect(retainValidStructuredIdeaTitle({...original,alternateTitles:[]},'无').title).toBe(original.title);
});

it('reserves the complete dynamic refill floor before admitting initial review',()=>{
 for(const count of [1,2,5,8]){
  const floor=premiseReviewCallFloor(count,2,0),budget={remaining:12};
  const initial=reserveFinalRefillReviewCapacity(budget,5,floor);
  if(5+floor<=12){initial.remaining=0;expect(budget.remaining).toBe(floor);}
 }
});

it('plans optional screening surplus and funded per-premise reviews together with the original final reserve',()=>{
 const count=plannedPreselectionCount(5,8,12,2,0,7);expect(count).toBe(8);
 const refill=premiseReviewCallFloor(5,2,0),initial=12-refill;
 const firstGroups=fundedSourceReviewGroups(count,2,initial-1,7,0);
 expect(firstGroups).toBe(4);
 // One source/overlap correction of up to four rejected identities still fits.
 expect(firstGroups+1+premiseReviewCallFloor(4,2,0)+refill).toBe(12);
 expect(fundedSourceReviewGroups(5,2,5,7,0)).toBe(3);
 expect(fundedSourceReviewGroups(5,2,9,7,0)).toBe(5);
 expect(fundedSourceReviewGroups(5,3,9,4,0)).toBe(4); // one wave, no 5th serial call
 expect(fundedSourceReviewGroups(5,3,9,3,0)).toBe(2); // unfunded fine grouping stays bounded
 expect(fundedSourceReviewGroups(8,2,13,5,0)).toBe(5); // eight full premises, five source groups
 expect(fundedSourceReviewGroups(5,3,9,4,1)).toBe(2); // manual grouping mode unchanged

 expect(plannedPreselectionCount(5,8,12,3,0,7)).toBe(8);
 expect(plannedPreselectionCount(5,8,12,2,0,2)).toBe(8);
 expect(fundedSourceReviewGroups(8,2,7,2,0)).toBe(4);
 for(let demand=1;demand<=10;demand++)for(let credits=1;credits<=12;credits++){
  const desired=demand+Math.min(3,Math.ceil(demand/2)),actual=plannedPreselectionCount(demand,desired,credits,2,0,7);
  if(actual){expect(actual).toBeGreaterThanOrEqual(demand);expect(actual).toBeLessThanOrEqual(desired);expect(premiseReviewCallFloor(actual,2,0)).toBeLessThanOrEqual(credits);}
 }
});

it('does not freeze a prepared refill at a deficit that can still grow before the initial Gate ends',async()=>{
 const {plannedFullCardRefillCount}=await import('./discovery-fulfillment');
 expect(plannedFullCardRefillCount(2,5,0,true)).toBe(5);
 expect(plannedFullCardRefillCount(2,5,3)).toBe(3);
 for(let requested=1;requested<=10;requested++)for(let accepted=0;accepted<requested;accepted++){
   const remaining=requested-accepted;
   for(let known=1;known<=remaining;known++){
     const prepared=plannedFullCardRefillCount(known,requested,accepted,true);
     for(let laterFailed=0;laterFailed<=remaining-known;laterFailed++)expect(prepared).toBeGreaterThanOrEqual(known+laterFailed);
     expect(plannedFullCardRefillCount(known,requested,accepted)).toBe(known+Math.ceil(known/2));
   }
 }
 expect(()=>plannedFullCardRefillCount(3,2,0,true)).toThrow();
});

it('enforces the eight-minute total discovery wall clock',()=>{expect(IDEA_DISCOVERY_MAX_WALL_MS).toBe(8*60*1000);});
