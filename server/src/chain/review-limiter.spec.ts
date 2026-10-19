import {it,expect} from 'vitest';
import {createReviewLimiter} from './review-limiter';
it('shares two slots across independent review groups and nested capacity fallbacks',async()=>{
 const run=createReviewLimiter(2),releases:Array<()=>void>=[],started:string[]=[];
 const call=(id:string)=>run(async()=>{started.push(id);await new Promise<void>(resolve=>releases.push(resolve));return id;});
 const source=(async()=>{await call('aggregate');return Promise.all([call('fallback1'),call('fallback2')]);})();
 const overlap=call('overlap');expect(started).toEqual(['aggregate','overlap']);
 releases[0]();await new Promise(resolve=>setTimeout(resolve,0));expect(started).toEqual(['aggregate','overlap','fallback1']);
 releases[1]();await new Promise(resolve=>setTimeout(resolve,0));expect(started).toEqual(['aggregate','overlap','fallback1','fallback2']);
 releases[2]();releases[3]();await Promise.all([source,overlap]);
});
it('releases a slot after failure',async()=>{
 const run=createReviewLimiter(1);await expect(run(async()=>{throw Error('protocol incomplete');})).rejects.toThrow('protocol');
 expect(await run(async()=>42)).toBe(42);
});
