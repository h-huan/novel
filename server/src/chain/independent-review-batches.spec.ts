import { describe, it, expect, vi } from 'vitest';
import { independentReviewBatches } from './independent-review-batches';

describe('independent review scheduling', () => {
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
