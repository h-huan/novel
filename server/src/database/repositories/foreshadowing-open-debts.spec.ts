import {describe,expect,it} from 'vitest';
import {ForeshadowingRepository} from './foreshadowing.repository';
describe('open foreshadowing debt across independent concurrent threads',()=>{
 it('keeps buried, active, reminded and legacy-pending stories visible to ongoing planning and warnings',()=>{
  const queries:string[]=[];
  const repo=new ForeshadowingRepository({getDb:()=>({
    prepare:(sql:string)=>{queries.push(sql);return {all:()=>[]};},
  })} as any);
  repo.getPending('p');
  repo.getOverdueWarnings('p',30);
  expect(queries).toHaveLength(2);
  for(const q of queries)for(const status of ['buried','active','reminder','pending'])
    expect(q).toContain("'"+status+"'");
  expect(queries[0]).not.toContain("'recovered'");
  expect(queries[1]).not.toContain("'cancelled'");
 });
});
