import {describe,expect,it,vi} from 'vitest';
import {creationChapterContracts,creationResponsibilityPlan} from './creation-chapter-contract';
import {buildNarrativeBeatPlan} from './adaptive-narrative';
import {ChainController} from './chain.controller';
const plan=()=>({chapterResponsibilities:[{chapter:1,title:'进入',function:'opening',responsibility:'住户取出旧钥匙并开门，让主角进入',prerequisites:['住户持有仍有效的旧钥匙并在场'],timeline:'当夜，钥匙尚未被收回',exitState:'主角进入屋内，尚未找到文件'},{chapter:2,title:'取得',function:'climax',responsibility:'主角在屋内找到并取得文件',prerequisites:['已进入屋内且屋内文件尚在'],timeline:'进入以后、清场以前',exitState:'主角持有文件'}]});
describe('source contract regression',()=>{
it('complete chapter contracts survive normalization, beat projection, saved JSON and prose context',()=>{
 const input=plan(),before=structuredClone(input);const rows=creationChapterContracts(input,v=>v),shared=creationResponsibilityPlan(rows),beats=buildNarrativeBeatPlan(shared);
 expect(shared).toEqual(input.chapterResponsibilities);expect(input).toEqual(before);expect(beats[1]).toMatchObject(input.chapterResponsibilities[1]);
 const controller=Object.create(ChainController.prototype) as any;const text=controller.buildChapterOutlineContext({title:'取得',content:'主角取得文件',scenes:JSON.stringify({responsibilityContract:shared[1]})});
 expect(text).toContain('进入以后、清场以前');expect(text).toContain('已进入屋内且屋内文件尚在');
});
it.each(['prerequisites','timeline','exitState'])('rejects missing %s before downstream generation instead of inventing a default',field=>{
 const value=plan();delete (value.chapterResponsibilities[0] as any)[field];const next=vi.fn();expect(()=>{creationChapterContracts(value,v=>v);next();}).toThrow();expect(next).not.toHaveBeenCalled();
});
it('does not manufacture a contract from the old four-column title plan or conflicting identities',()=>{
 expect(()=>creationChapterContracts({chapters:[{order:1,title:'进入',function:'opening',responsibility:'进入屋内'}]},v=>v)).toThrow();
 const value=plan();Object.assign(value.chapterResponsibilities[0],{order:2});expect(()=>creationChapterContracts(value,v=>v)).toThrow('章号互斥');
 expect(()=>creationChapterContracts({...plan(),chapters:[]},v=>v)).toThrow('两份规划');
});

});
