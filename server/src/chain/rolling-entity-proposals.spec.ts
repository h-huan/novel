import {describe,it,expect} from 'vitest';
import {validateRollingEntityProposals} from './rolling-entity-proposals';

const chapters=[{content:'巡检员沈诺进入西坡站，发现灰钥匙被人动过。'}];
const valid={newEntities:[{type:'character',name:'沈诺',evidenceQuote:'巡检员沈诺进入西坡站',chapterNumber:21},
 {type:'map_point',name:'西坡站',evidenceQuote:'沈诺进入西坡站，发现灰钥匙',chapterNumber:21},
 {type:'foreshadowing',name:'灰钥匙',evidenceQuote:'发现灰钥匙被人动过',chapterNumber:21}]};
describe('rolling source anchored entity proposals',()=>{
 it('accepts source quotes anchored to a reviewed chapter',()=>{
   expect(validateRollingEntityProposals(valid,chapters,[21])).toHaveLength(3);
 });
 it('rejects fabricated facts and invalid chapter coordinates',()=>{
   expect(()=>validateRollingEntityProposals({newEntities:[{...valid.newEntities[0],evidenceQuote:'沈诺其实一直是秘密首领'}]},chapters,[21])).toThrow('逐字引用');
   expect(()=>validateRollingEntityProposals({newEntities:[{...valid.newEntities[0],chapterNumber:22}]},chapters,[21])).toThrow('无效');
 });
 it('requires an explicit manifest and never assumes omitted entity checking passed',()=>{
   expect(()=>validateRollingEntityProposals({chapters},chapters,[21])).toThrow('newEntities');
   expect(validateRollingEntityProposals({newEntities:[]},chapters,[21])).toEqual([]);
 });
 it('does not double-promote one entity identity',()=>{
   expect(validateRollingEntityProposals({newEntities:[valid.newEntities[0],valid.newEntities[0]]},chapters,[21])).toHaveLength(1);
 });
});
