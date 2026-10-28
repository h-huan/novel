import {describe,expect,it} from 'vitest';
import {collectOutlineForeshadowings} from './chain.controller';
import {CHAPTER_FORESHADOWING_CONTRACT,GLOBAL_FORESHADOWING_CONTRACT,
  FORESHADOWING_INTERLEAVING_POLICY, mergePlannedForeshadowingActions} from './foreshadowing-contract';

const chapter=(content:string, action:string, reference?:string)=>({
 content,action,reference,scope:'volume',type:'clue',riskLevel:'medium',
 evidenceText:'已发生事件的章纲证据',recoveryWindowStart:12,
 recoveryWindowEnd:18,recoveryCondition:'取得证据',payoffDescription:'实际改变人物选择',
});
describe('concurrent, many-to-many foreshadow threads',()=>{
 it('plants two lines in one chapter, advances both across chapters and does not mutate their original setup',()=>{
  const first=mergePlannedForeshadowingActions([],[
    chapter('旧钟表','埋设'),chapter('失踪账册','埋设')],1);
  const progressed=mergePlannedForeshadowingActions(first,[
    chapter('旧钟表','提醒'),chapter('失踪账册','激活')],5);
  const withPayoff=mergePlannedForeshadowingActions(progressed,[
    chapter('旧钟表','回收'),chapter('失踪账册','提醒')],13);
  expect(first).toHaveLength(2);
  expect(withPayoff).toHaveLength(2);
  expect(withPayoff.map(row=>[row.content,row.setupChapter])).toEqual([
    ['旧钟表',1],['失踪账册',1]]);
  expect(first).toEqual(progressed);
  expect(progressed).toEqual(withPayoff);
 });
 it('does not create a new plant from a reminder or permit a duplicate or orphan',()=>{
  expect(()=>mergePlannedForeshadowingActions([],[
    chapter('未出现的钥匙','提醒')],7)).toThrow('缺少已埋设');
  const prior=mergePlannedForeshadowingActions([],[chapter('旧钟表','埋设')],1);
  expect(()=>mergePlannedForeshadowingActions(prior,[chapter('旧钟表','埋设')],8)).toThrow('重复埋设');
  expect(()=>mergePlannedForeshadowingActions(prior,[
    chapter('别的线索','回收','未登记的线索')],18)).toThrow('缺少已埋设');
 });
 it('uses one source contract in chapter and full-book planning without serial scope quota',()=>{
   expect(FORESHADOWING_INTERLEAVING_POLICY).toContain('多对多');
   expect(FORESHADOWING_INTERLEAVING_POLICY).toContain('不按长度');
   expect(FORESHADOWING_INTERLEAVING_POLICY).toContain('\n');
   expect(CHAPTER_FORESHADOWING_CONTRACT).toContain(FORESHADOWING_INTERLEAVING_POLICY);
   expect(GLOBAL_FORESHADOWING_CONTRACT).toContain(FORESHADOWING_INTERLEAVING_POLICY);
   expect(CHAPTER_FORESHADOWING_CONTRACT).toContain('reference');
 });
 it('the existing short-outline collector persists only the original plant across parallel later reminders',()=>{
  const rows=[
   {order:0, scenes:JSON.stringify({foreshadowing:[
      chapter('旧钟表','埋设'),chapter('失踪账册','埋设')]})},
   {order:1, scenes:JSON.stringify({foreshadowing:[
      chapter('旧钟表','提醒','旧钟表'),chapter('失踪账册','激活','失踪账册')]})},
   {order:2, scenes:JSON.stringify({foreshadowing:[
      chapter('旧钟表','回收','旧钟表'),chapter('失踪账册','提醒','失踪账册')]})},
  ];
  const result=collectOutlineForeshadowings(rows);
  expect(result).toHaveLength(2);
  expect(result.map(row=>[row.content,row.buriedChapter])).toEqual([
    ['旧钟表',1],['失踪账册',1]]);
 });
 it('short-outline collector rejects an orphan reminder instead of registering it as a new story fact',()=>{
   expect(()=>collectOutlineForeshadowings([
     {order:2,scenes:JSON.stringify({foreshadowing:[chapter('并不存在的旧钥匙','提醒')]})},
   ])).toThrow('缺少已埋设');
 });

});
