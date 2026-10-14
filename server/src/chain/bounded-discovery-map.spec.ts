import {describe,it,expect} from 'vitest';
import {boundedDiscoveryMap} from './bounded-discovery-map';
describe('bounded discovery queue',()=>{
 it('starts the next card when either slot finishes and preserves original order',async()=>{
  let release!:()=>void;const held=new Promise<void>(r=>release=r);const started:number[]=[];let active=0,max=0;
  const work=boundedDiscoveryMap([0,1,2,3],2,async value=>{started.push(value);active++;max=Math.max(max,active);if(value===0)await held;active--;return value;});
  await Promise.resolve();await Promise.resolve();expect(started).toContain(2);expect(max).toBeLessThanOrEqual(2);release();
  expect((await work).map(row=>row.status==='fulfilled'?row.value:null)).toEqual([0,1,2,3]);
 });
 it('retains successful siblings and does not call a failed card again',async()=>{
  let calls=0;const result=await boundedDiscoveryMap([1,2,3],2,async value=>{calls++;if(value===2)throw Error('真实失败');return value;});
  expect(calls).toBe(3);expect(result.map(row=>row.status)).toEqual(['fulfilled','rejected','fulfilled']);
 });
});
