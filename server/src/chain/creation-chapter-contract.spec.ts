import {describe,expect,it,vi} from 'vitest';
import {creationChapterContracts,creationResponsibilityPlan} from './creation-chapter-contract';
import {buildChapterResponsibilityAuditPrompt,chapterResponsibilityAuditOutputContract} from '../../shared/src/chapter-responsibility-review';
import {buildNarrativeBeatPlan} from './adaptive-narrative';
import {ChainController} from './chain.controller';
import {findChapterOutline,creationTimelineFallbackChapters} from './chapter-outline-coordinate';
import {OUTLINE_PROJECTION_POLICY,STORY_CAUSAL_REVIEW_POLICY} from '../../shared/src/system-workflow-rules.registry';
const plan=()=>({chapterResponsibilities:[{chapter:1,title:'进入',function:'opening',responsibility:'住户取出旧钥匙并开门，让主角进入',prerequisites:['住户持有仍有效的旧钥匙并在场'],timeline:'当夜，钥匙尚未被收回',exitState:'主角进入屋内，尚未找到文件'},{chapter:2,title:'取得',function:'climax',responsibility:'主角在屋内找到并取得文件',prerequisites:['已进入屋内且屋内文件尚在'],timeline:'进入以后、清场以前',exitState:'主角持有文件'}]});
describe('source contract regression',()=>{
it('enforces the same evidenced-outcome and reputation boundaries during chapter generation and causal review',()=>{
 const factRule='无评价依据时生成与修订只陈述实际可证明的事件';
 expect(OUTLINE_PROJECTION_POLICY).toContain(factRule);
 expect(STORY_CAUSAL_REVIEW_POLICY).toContain(factRule);
 expect(STORY_CAUSAL_REVIEW_POLICY.split(factRule)).toHaveLength(2);
 expect(OUTLINE_PROJECTION_POLICY).toContain('highlights、characterStates');
 expect(OUTLINE_PROJECTION_POLICY).toContain('承诺在某期限给出意见');
 expect(OUTLINE_PROJECTION_POLICY).toContain('实际决定主体、采纳依据与已发生的生效行动');
});
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


it('rejects duplicate/missing prior chapter indices even when the number of rows looks complete',()=>{
 const controller=Object.create(ChainController.prototype) as any;
 const original=[{chapter_index:1,title:'开端',content:'保留第一章已发生事实',status:'draft'},
   {chapter_index:2,title:'调查',content:'保留第二章已发生事实',status:'draft'}];
 const rows=original.map(row=>({...row}));
 controller.db={getDb:()=>({prepare:()=>({all:()=>rows})})};
 expect(controller.buildPreviousChapterLedger('project',3).previousChapterEnd).toContain('第二章已发生事实');
 rows[1].chapter_index=1;
 expect(()=>controller.buildPreviousChapterLedger('project',3)).toThrow('前文章节与大纲序号不连续');
 rows[0].chapter_index=2;rows[1].chapter_index=2;
 expect(()=>controller.buildPreviousChapterLedger('project',3)).toThrow('前文章节与大纲序号不连续');
});

it('never assigns a neighbouring outline when a persisted chapter binding has broken',()=>{
 const db={prepare:(sql:string)=>({
   get:()=>sql.includes('JOIN outlines')?undefined:{id:'chapter-2',outline_id:'stale-outline'},
   all:()=>[{id:'first-outline'},{id:'second-outline'}],
 })};
 expect(()=>findChapterOutline(db as any,'project',2)).toThrow('章纲绑定失效');
 const manualDraftWithoutOutline={prepare:(sql:string)=>({
   get:()=>sql.includes('JOIN outlines')?undefined:{id:'manual-chapter',outline_id:null},
   all:()=>[],
 })};
 expect(findChapterOutline(manualDraftWithoutOutline as any,'project',1)).toBeUndefined();
 const deletedOutline={prepare:(sql:string)=>({
   get:()=>sql.includes('JOIN outlines')?undefined:{id:'chapter-2',outline_id:'deleted'},
   all:()=>[],
 })};
 expect(()=>findChapterOutline(deletedOutline as any,'project',2)).toThrow('章纲绑定失效');
 const beforeAnyChapter={prepare:(sql:string)=>({
   get:()=>undefined,
   all:()=>[{id:'first-outline'},{id:'second-outline'}],
 })};
 expect(findChapterOutline(beforeAnyChapter as any,'project',2)).toEqual({id:'second-outline'});
 const correctlyLinked={prepare:(sql:string)=>({
   get:()=>sql.includes('JOIN outlines')?{id:'linked-outline'}:undefined,
   all:()=>{throw Error('合法绑定不得按排序回退');},
 })};
 expect(findChapterOutline(correctlyLinked as any,'project',2)).toEqual({id:'linked-outline'});
});

 it('keeps global timeline chapter indices when a new volume restarts local order',()=>{
  const rows=[{title:'卷一首章',content:'开端',order:0},{title:'卷一次章',content:'推进',order:1},{title:'卷二首章',content:'承接',order:0}];
  const db={prepare:(sql:string)=>({all:(id:string)=>{expect(id).toBe('project');expect(sql).toContain('COALESCE(p."order",0)');return rows;}})};
  expect(creationTimelineFallbackChapters(db as any,'project')).toEqual([
   {title:'卷一首章',content:'开端',description:'开端',chapterReference:1},
   {title:'卷一次章',content:'推进',description:'推进',chapterReference:2},
   {title:'卷二首章',content:'承接',description:'承接',chapterReference:3},
  ]);
 });

});

describe('same chapter audit envelope for both creator paths',()=>{
 const input={executionStandard:'只使用已确认世界规则',creativeBrief:'主人公按原故事推进',
  shortStoryCard:{ending:'已承诺的结局'},worldContinuityDirective:'保留已有事实',
  plan:[{chapter:1,responsibility:'当事人出示原来保留的记录',exitState:'记录已经被核对'}]};
 it('includes every chapter condition check in both consistent and conflicting examples',()=>{
  const prompt=buildChapterResponsibilityAuditPrompt({...input,entryExitContract:true});
  const finalContract=prompt.slice(prompt.lastIndexOf('只输出JSON对象：'));
  expect(finalContract).toContain('{"consistent":true,"contradictions":[],"conditionChecks":');
  expect(finalContract).toContain('{"consistent":false,"contradictions":');
  expect(finalContract).not.toContain('"exitStateEvidence":');
  expect(finalContract).not.toContain('"taskEvidence":');
  expect(finalContract).toContain('"bridgeEvidence":');
  expect(prompt).toContain('服务器按真实章号绑定responsibility与exitState原文');
  expect(finalContract).toContain('conditionChecks必须每章一项');
  expect(finalContract).toContain('gap必须对应contradictions');
 });
 it('keeps ID based framework checks on one server-owned evidence transport',()=>{
  const prompt=buildChapterResponsibilityAuditPrompt({...input,entryExitContract:true,evidenceMode:'anchors'});
  expect(prompt).toContain('"taskAnchorId":"chapter:c1:task"');
  expect(prompt).toContain('"bridgeAnchorIds":["chapter:c1:task"]');
  expect(prompt).not.toContain('"bridgeSource":"body"');
  expect(prompt).toContain('conditionChecks必须每章一项');
 });
 it('keeps generic review callers on the existing ordinary verdict without extra condition fields',()=>{
  const ordinary=chapterResponsibilityAuditOutputContract(false);
  expect(ordinary).toContain('{"consistent":true,"contradictions":[]}');
  expect(ordinary).not.toContain('"conditionChecks"');
 });
});
