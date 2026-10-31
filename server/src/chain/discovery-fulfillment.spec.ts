import {it,expect} from 'vitest';
import {missingRequestedIdeaSlots,affordableFullCardRefillCount,affordableReviewedPremiseCount,premiseReviewCallFloor,preselectionRecoveryTarget,minimumReselectionReviewCalls,retainValidStructuredIdeaTitle} from './discovery-fulfillment';

it('reserves independent quality-review calls for each affordable refill batch',()=>{
 expect(affordableFullCardRefillCount(5,9,2)).toBe(5);
 expect(affordableFullCardRefillCount(5,6,2)).toBe(4);
 expect(affordableFullCardRefillCount(5,4,2)).toBe(2);
 expect(affordableFullCardRefillCount(5,2,2)).toBe(1);
 expect(affordableFullCardRefillCount(5,1,2)).toBe(0);
 expect(affordableFullCardRefillCount(0,24,2)).toBe(0);
 expect(()=>affordableFullCardRefillCount(5,3,0)).toThrow();
});

it('does not pay for a replacement when its independent source and overlap reviews are unfundable',()=>{
 expect(minimumReselectionReviewCalls(5,true)).toBe(2);
 expect(minimumReselectionReviewCalls(8,true)).toBe(2);
 expect(minimumReselectionReviewCalls(5,false)).toBe(1);
 expect(minimumReselectionReviewCalls(1,true)).toBe(1);
 expect(()=>minimumReselectionReviewCalls(0,true)).toThrow();
});

it('preflights every source partition and the independent overlap before spending a refill selection',()=>{
 expect(premiseReviewCallFloor(0,3)).toBe(0);
 expect(premiseReviewCallFloor(1,3)).toBe(1);
 expect(premiseReviewCallFloor(3,3)).toBe(2);
 expect(premiseReviewCallFloor(3,2)).toBe(2); // default monolithic 3-card source review
 expect(premiseReviewCallFloor(3,2,1)).toBe(3); // configured split review
 expect(affordableReviewedPremiseCount(5,2,2,0)).toBe(3);
 expect(affordableReviewedPremiseCount(5,2,2,1)).toBe(2);
 // Default mode has an existing monolithic source-review fallback for a
 // mandatory set; never silently discard required slots to save a credit.
 expect(affordableReviewedPremiseCount(5,2,2,0,4)).toBe(4);
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
 expect(preselectionRecoveryTarget(5,7)).toEqual({mandatory:0,hedge:0,total:0});
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
