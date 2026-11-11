import { describe, it, expect, vi } from 'vitest';
import { independentReviewBatches } from './independent-review-batches';
import { reserveFinalRefillReviewCapacity } from './discovery-fulfillment';

describe('independent review scheduling', () => {
  it('runs nested initial reviews concurrently while preserving exactly two original credits for final-card refill',async()=>{
    const parent={remaining:12};
    const scoped=reserveFinalRefillReviewCapacity(parent,4,2);
    const initial=await independentReviewBatches(['source','overlap'],scoped,2,
      async(mode,_index,budget)=>{
        if(mode==='source'){
          await independentReviewBatches([0,1,2],budget,3,async(_item,_inner,credit)=>{
            credit.remaining--;return true;
          });
        }else budget.remaining--;
        return mode;
      });
    expect(initial).toEqual(['source','overlap']);
    expect(parent.remaining).toBe(8);expect(scoped.remaining).toBe(6);
    // Paid correction can spend all of its remaining escrowed credits, not
    // the two already protected for the independent post-card refill.
    await independentReviewBatches([0,1,2,3,4,5],scoped,3,async(_item,_i,credit)=>{
      credit.remaining--;return true;
    });
    expect(scoped.remaining).toBe(0);expect(parent.remaining).toBe(2);
    await independentReviewBatches(['refill-source','refill-overlap'],parent,2,
      async(_item,_i,credit)=>{credit.remaining--;});
    expect(parent.remaining).toBe(0);
  });

  it('replays recorded batch durations to verify reduced scheduling wait, without model calls', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      const durations = [135873, 142654, 61530], parent = { remaining: 3 };
      const running = independentReviewBatches(durations, parent, 2, async (ms, _index, budget) => {
        budget.remaining--; await new Promise(resolve => setTimeout(resolve, ms)); return ms;
      });
      await vi.runAllTimersAsync();
      expect(await running).toEqual(durations);
      expect(Date.now()).toBe(197403);
      expect(Date.now()).toBeLessThan(durations.reduce((sum, ms) => sum + ms, 0));
      expect(parent.remaining).toBe(0);
    } finally { vi.useRealTimers(); }
  });
  it('overlaps independent work within two slots, preserves order and counts only actual calls', async () => {
    const parent = { remaining: 6 }, started: number[] = [];
    const release: Array<() => void> = [];
    let active = 0, peak = 0;
    const running = independentReviewBatches([0, 1, 2], parent, 2, async (item, _index, budget) => {
      started.push(item); active++; peak = Math.max(peak, active); budget.remaining--;
      await new Promise<void>(resolve => { release[item] = resolve; }); active--; return item;
    });
    expect(started).toEqual([0, 1]);
    release[1](); await new Promise(resolve => setTimeout(resolve, 0));
    expect(started).toEqual([0, 1, 2]);
    release[2](); release[0]();
    expect(await running).toEqual([0, 1, 2]); expect(peak).toBe(2); expect(parent.remaining).toBe(3);
  });
  it('structures independently selected replacement cards together while preserving the separate final-review credit and failed-card identity', async () => {
    const physical={remaining:5}; // two cards + one review + existing surplus
    const finalReviewCredits=1;
    physical.remaining-=finalReviewCredits;
    let active=0,peak=0;
    const inputs=[{premiseId:'P7',position:0},{premiseId:'P8',position:2}];
    const settled=await independentReviewBatches(inputs,physical,2,async(premise,_index,budget)=>{
      active++;peak=Math.max(peak,active);
      budget.remaining--;
      await Promise.resolve();
      active--;
      return premise.premiseId==='P8'
        ? {status:'rejected' as const,reason:new Error('原质量Gate不通过')}
        : {status:'fulfilled' as const,value:{sourcePremiseId:premise.premiseId}};
    });
    physical.remaining+=finalReviewCredits;
    expect(peak).toBe(2);
    expect(settled).toMatchObject([
      {status:'fulfilled',value:{sourcePremiseId:'P7'}},
      {status:'rejected',reason:expect.any(Error)},
    ]);
    expect(physical.remaining).toBe(3);
    // The reserved final review credit is still available. Unqualified
    // replacements cannot be silently promoted into the accepted card set.
    const finished=settled.filter(row=>row.status==='fulfilled').map(row=>row.value.sourcePremiseId);
    expect(finished).toEqual(['P7']);
  });
  it('protects every first call from another batch consuming retry surplus', async () => {
    const parent = { remaining: 4 }, used: number[] = [];
    await independentReviewBatches([0, 1, 2], parent, 2, async (item, _index, budget) => {
      used[item] = 0;
      do { budget.remaining--; used[item]++; } while (item === 0 && budget.remaining > 0);
      expect(() => budget.remaining = -1).toThrow('不得透支'); return item;
    });
    expect(used).toEqual([2, 1, 1]); expect(parent.remaining).toBe(0);
  });
  it('waits for in-flight failure peers, cancels unstarted batches, refunds unused credits', async () => {
    const parent = { remaining: 5 }, started: number[] = [];
    let release!: () => void, drained = false, finished = false;
    const running = independentReviewBatches([0, 1, 2], parent, 2, async (item, _index, budget) => {
      started.push(item); budget.remaining--;
      if (item === 0) throw new Error('真实审核失败');
      await new Promise<void>(resolve => { release = resolve; }); drained = true; return item;
    });
    const outcome = running.catch(error => { finished = true; return error; });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(finished).toBe(false); expect(started).toEqual([0, 1]);
    release(); expect((await outcome).message).toBe('真实审核失败');
    expect(drained).toBe(true); expect(parent.remaining).toBe(3);
  });
  it('does not start incomplete coverage and restores unused credits after a local preflight failure', async () => {
    let calls = 0;
    await expect(independentReviewBatches([1, 2], { remaining: 1 }, 2, async () => ++calls)).rejects.toThrow('预算不足');
    expect(calls).toBe(0);
    const parent = { remaining: 3 };
    await expect(independentReviewBatches([1, 2], parent, 2, async () => { throw new Error('本地错误'); })).rejects.toThrow('本地错误');
    expect(parent.remaining).toBe(3);
  });
});

it('returns nested unused reservations without minting calls or resetting physical allowances',async()=>{
 const parent={remaining:6};
 await independentReviewBatches(['source','overlap'],parent,2,async(mode,_index,budget)=>{
  if(mode==='overlap'){budget.remaining--;return;}
  await expect(independentReviewBatches([1,2],budget,2,async()=>{throw Error('local preflight');})).rejects.toThrow('local preflight');
  await independentReviewBatches([1,2],budget,2,async(_item,_i,child)=>{child.remaining--;});
  expect(()=>budget.remaining=budget.remaining+1).toThrow('不得透支或重置');
 });
 expect(parent.remaining).toBe(3);
});
