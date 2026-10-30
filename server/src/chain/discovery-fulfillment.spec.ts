import {it,expect} from 'vitest';
import {missingRequestedIdeaSlots,affordableFullCardRefillCount} from './discovery-fulfillment';

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
});
