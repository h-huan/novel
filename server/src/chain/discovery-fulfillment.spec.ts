import {it,expect} from 'vitest';
import {missingRequestedIdeaSlots,affordableFullCardRefillCount,preselectionRecoveryTarget,retainValidStructuredIdeaTitle} from './discovery-fulfillment';

it('reserves independent quality-review calls for each affordable refill batch',()=>{
 expect(affordableFullCardRefillCount(5,9,2)).toBe(5);
 expect(affordableFullCardRefillCount(5,6,2)).toBe(4);
 expect(affordableFullCardRefillCount(5,4,2)).toBe(2);
 expect(affordableFullCardRefillCount(5,2,2)).toBe(1);
 expect(affordableFullCardRefillCount(5,1,2)).toBe(0);
 expect(affordableFullCardRefillCount(0,24,2)).toBe(0);
 expect(()=>affordableFullCardRefillCount(5,3,0)).toThrow();
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

it('fills only bounded pre-vetted screening surplus from the original pool before paid full-card review',()=>{
 expect(preselectionRecoveryTarget(5,6,8)).toEqual({mandatory:0,hedge:2,total:2});
 expect(preselectionRecoveryTarget(5,7,8)).toEqual({mandatory:0,hedge:1,total:1});
 expect(preselectionRecoveryTarget(5,8,8)).toEqual({mandatory:0,hedge:0,total:0});
 expect(preselectionRecoveryTarget(5,3,8)).toEqual({mandatory:2,hedge:2,total:4});
 expect(preselectionRecoveryTarget(5,4,8)).toEqual({mandatory:1,hedge:2,total:3});
 expect(preselectionRecoveryTarget(5,4,6)).toEqual({mandatory:1,hedge:1,total:2});
 expect(preselectionRecoveryTarget(5,6,5)).toEqual({mandatory:0,hedge:0,total:0});
 expect(()=>preselectionRecoveryTarget(5,6,4)).toThrow();
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
