import {describe,it,expect,vi} from 'vitest';
import { StateItemService } from './state-item.service';

const proposal={type:'character',name:'沈诺',evidenceQuote:'巡检员沈诺进入西坡站',chapterNumber:21};
function fixture(sourceContent='巡检员沈诺进入西坡站，调查旧档案。', writerAvailable=true){
 const writer={create:vi.fn(()=>({id:'new-character'}))};
 const statusWrites:any[][]=[];
 const queries:string[]=[];
 const db={
  exec:vi.fn(),
  prepare:(sql:string)=>{
   queries.push(sql);
   return {
    get:()=>{
     if(sql.includes('FROM outlines'))return {id:'outline-21',order:20,content:sourceContent};
     if(sql.includes('SELECT id FROM characters'))return undefined;
     if(sql.includes('SELECT id,name FROM characters'))return {id:'new-character',name:'沈诺'};
     return undefined;
    },
    run:(...args:any[])=>{
     if(sql.includes('UPDATE state_items'))statusWrites.push(args);
     return {changes:1};
    },
   };
  },
 };
 const item={id:'candidate-1',sourceId:'outline-21',sourceType:'rollout_outline',
  status:'pending',targetType:'character',targetLabel:'沈诺',payload:{intent:'entity_create',entityProposal:proposal}};
 const service=new StateItemService({getDb:()=>db} as any,undefined,
  {get:vi.fn(()=>writerAvailable?writer:null)} as any);
 vi.spyOn(service,'get').mockReturnValue(item as any);
 return {db,service,writer,statusWrites,queries};
}
describe('rolling entity confirmation writes real canonical entity',()=>{
 it('calls existing character service and verifies persisted record before marking hard fact',()=>{
  const f=fixture();
  const result=f.service.confirm('novel','candidate-1');
  expect(result.writeback).toMatchObject({mode:'entity_create',verified:true,canonicalType:'character',canonicalId:'new-character',sourceOutlineId:'outline-21'});
  expect(f.writer.create).toHaveBeenCalledWith('novel',{name:'沈诺',role:'supporting',background:proposal.evidenceQuote});
  expect(f.statusWrites).toHaveLength(1);
  expect(f.statusWrites[0][0]).toBe('hard_fact');
  expect(f.db.exec.mock.calls.map((x:any[])=>x[0])).toEqual(['BEGIN','COMMIT']);
 });
 it('does not mark a proposal confirmed when its chapter evidence no longer matches',()=>{
  const f=fixture('另一段不包含这个人的旧正文');
  expect(()=>f.service.confirm('novel','candidate-1')).toThrow('证据已失效');
  expect(f.writer.create).not.toHaveBeenCalled();
  expect(f.statusWrites).toHaveLength(0);
  expect(f.db.exec.mock.calls.map((x:any[])=>x[0])).toEqual(['BEGIN','ROLLBACK']);
 });
 it('cannot claim success without a canonical writer',()=>{
  const f=fixture(undefined,false);
  expect(()=>f.service.confirm('novel','candidate-1')).toThrow('实体服务不可用');
  expect(f.statusWrites).toHaveLength(0);
 });
});
