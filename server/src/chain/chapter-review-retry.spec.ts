import { describe, expect, it } from 'vitest';
import { chapterReviewRetryContent } from './chapter-review-retry';
describe('chapter review retry provenance', () => {
  it('keeps one complete predecessor and authoritative review inputs after repeated context assembly',async()=>{
    const {ChainController}=await import('./chain.controller');const c=Object.create(ChainController.prototype) as any;
    const previous={id:'prior',chapter_index:1,title:'前章',content:'前章真实正文。'.repeat(2500)};
    c.db={getDb:()=>({prepare:()=>({get:()=>previous,all:()=>[]})})};
    const once=c.previousChapterReviewContext('p',2,'背景材料'.repeat(5000));
    const world='完整世界规则。'.repeat(3000)+'末尾实际冻结答案';
    const envelope=JSON.stringify({storyContext:once,reviewWorldContext:world,timePlanDirective:'已核对时间计划'});
    const twice=c.previousChapterReviewContext('p',2,envelope),third=c.previousChapterReviewContext('p',2,twice);
    expect(third).toBe(twice);const parsed=JSON.parse(third);
    expect(parsed.previousChapter).toEqual([{...previous,complete:true}]);expect(parsed.storyContext).toHaveLength(14000);
    expect(parsed.storyContext).not.toContain('previousChapter');expect(parsed.reviewWorldContext).toBe(world);expect(parsed.timePlanDirective).toBe('已核对时间计划');
    expect(parsed.historicalChapters).toEqual([]);
    c.db={getDb:()=>({prepare:()=>({get:()=>undefined})})};
    const missing=JSON.parse(c.previousChapterReviewContext('p',2,envelope));expect(missing.previousChapter).toEqual([]);expect(missing.reviewWorldContext).toBe(world);
    c.worldSettingService={findByProjectId:()=>[{id:'w'}],getWritingSummary:()=>({summary:'已脱敏创作摘要',profile:{rules:'普通钥匙可以开门。',ending:'最后把对手困住。'}})};
    const {sourceEvidenceCatalog,sourceBoundaryEvidenceContext,validateBodySourceBoundaryReview}=await import('../modules/writing-quality/source-quality-review');
    const sourceContext=sourceBoundaryEvidenceContext(JSON.stringify({reviewWorldContext:c.buildWorldWritingContext('p',false)}));
    const ending=sourceEvidenceCatalog(sourceContext).find(row=>row.path.endsWith('.ending'))!;
    expect(ending.text).toBe('最后把对手困住。');expect(c.buildWorldWritingContext('p')).toContain('已脱敏创作摘要');
    const checked=validateBodySourceBoundaryReview({checks:[{id:'B1',status:'supported',basisRef:ending.id,origin:'body',outlineEvidence:'',reason:'结局要求把对手困住，所以钥匙具有禁锢能力。'}]},[{id:'B1',content:'他反锁后屋内的人永远无法离开。'}],sourceContext,'');
    expect(checked.verified).toBe(false);expect(checked.errors.join('')).toContain('未来结局计划');
  });
  const run={project_id:'p',chapter_index:1,stage:'chapter',scenario:'writing',output_text:'她留下了清样。\n'};
  it('preserves exact persisted prose for all current gates',()=>expect(chapterReviewRetryContent(run,'p',1)).toBe(run.output_text));
  it('recovers terminal blocked prose without admitting review JSON',()=> {
    const blocked={...run,scenario:'review',status:'failed',gate_status:'blocked',error:'【本章大纲一致性】尚有问题'};
    expect(chapterReviewRetryContent(blocked,'p',1)).toBe(run.output_text);
    expect(()=>chapterReviewRetryContent({...blocked,output_text:'{"pass":true}'},'p',1)).toThrow();
  });
  it.each([{project_id:'other'},{chapter_index:2},{scenario:'review'},{stage:'idea'},{output_text:'{"pass":true}'}])('rejects non-prose or unrelated provenance %j',patch=>{
    expect(()=>chapterReviewRetryContent({...run,...patch},'p',1)).toThrow('已留存正文');
  });
});

it('recovers the exact full draft preserved on review protocol failure',()=>{
  const run={project_id:'p',chapter_index:1,stage:'refinement',scenario:'review',status:'failed',gate_status:'blocked',error:'【评审未完成】报告语法无效',output_text:'她留下了清样。\n完整补写仍在。'};
  expect(chapterReviewRetryContent(run,'p',1)).toBe(run.output_text);
  expect(()=>chapterReviewRetryContent({...run,status:'success'},'p',1)).toThrow();
  expect(()=>chapterReviewRetryContent({...run,gate_status:'not_evaluated'},'p',1)).toThrow();
  expect(()=>chapterReviewRetryContent({...run,output_text:'{"pass":true}'},'p',1)).toThrow();
});

it('recovers terminal language-blocked prose while still rejecting successful reports and JSON',()=>{const run={project_id:'p',chapter_index:1,stage:'refinement',scenario:'review',status:'failed',gate_status:'blocked',error:'【正文硬红线】需复检',output_text:'她留下原稿。'};expect(chapterReviewRetryContent(run,'p',1)).toBe(run.output_text);expect(()=>chapterReviewRetryContent({...run,status:'success'},'p',1)).toThrow();expect(()=>chapterReviewRetryContent({...run,output_text:'{"prosePassed":true}'},'p',1)).toThrow();});

it('restores only the source tied to the retained exact draft and same project chapter',async()=>{
 const {createHash}=await import('node:crypto');const {chapterReviewRetrySource}=await import('./chapter-review-retry');
 const run={project_id:'p',chapter_index:1,stage:'chapter',scenario:'writing',output_text:'她把门关上。',quality_payload:JSON.stringify({expansionSource:{version:1,sourceDraft:'她站在门外。',draftHash:createHash('sha256').update('她把门关上。').digest('hex')}})};
 expect(chapterReviewRetrySource(run,'p',1)).toBe('她站在门外。');
 expect(chapterReviewRetrySource({...run,output_text:'不同的正文'},'p',1)).toBeUndefined();
 expect(chapterReviewRetrySource({...run,quality_payload:'{}'},'p',1)).toBeUndefined();
 expect(()=>chapterReviewRetrySource(run,'other',1)).toThrow();
});

it('stores source provenance without altering a blocked gate or existing quality evidence',async()=>{
 const {createRequire}=await import('node:module');const {DatabaseSync}=createRequire(import.meta.url)('node:sqlite');const {GenerationMetricsService}=await import('../modules/generation-metrics/generation-metrics.service');
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE generation_runs(id TEXT PRIMARY KEY, quality_payload TEXT, gate_status TEXT)');
 db.prepare('INSERT INTO generation_runs VALUES(?,?,?)').run('r',JSON.stringify({gate:{passed:false,status:'blocked'},existingEvidence:['keep']}),'blocked');
 const service=Object.create(GenerationMetricsService.prototype) as any;service.databaseService={getDb:()=>db};service.attachExpansionSource('r','来源原稿','hash');
 const row=db.prepare('SELECT * FROM generation_runs WHERE id=?').get('r') as any;const payload=JSON.parse(row.quality_payload);
 expect(row.gate_status).toBe('blocked');expect(payload.gate).toEqual({passed:false,status:'blocked'});expect(payload.existingEvidence).toEqual(['keep']);expect(payload.expansionSource).toEqual({version:1,sourceDraft:'来源原稿',draftHash:'hash'});db.close();
});

it('stores and recovers a time plan only for the same draft and unchanged chapter contract',async()=>{
 const {createRequire}=await import('node:module');const {DatabaseSync}=createRequire(import.meta.url)('node:sqlite');const {GenerationMetricsService}=await import('../modules/generation-metrics/generation-metrics.service');const {createHash}=await import('node:crypto');const {chapterReviewRetryTimePlan}=await import('./chapter-review-retry');
 const body='她离开站点。',outline='24小时倒计时。她离开站点。';const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
 const timers=[{id:'期限',basisEvidence:'24小时倒计时',initialSeconds:86400,steps:[{eventEvidence:'她离开站点。',elapsedSeconds:10,display:'模型错误展示'}]}];
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE generation_runs(id TEXT PRIMARY KEY, quality_payload TEXT, gate_status TEXT)');db.prepare('INSERT INTO generation_runs VALUES(?,?,?)').run('r',JSON.stringify({gate:{passed:false},existingEvidence:['keep']}),'blocked');
 const service=Object.create(GenerationMetricsService.prototype) as any;service.databaseService={getDb:()=>db};service.attachTimePlanProvenance('r',{draftHash:hash(body),outlineHash:hash(outline),timers});
 const row=db.prepare('SELECT * FROM generation_runs WHERE id=?').get('r') as any;const run={...row,project_id:'p',chapter_index:1,stage:'chapter',scenario:'writing',output_text:body};
 expect(chapterReviewRetryTimePlan(run,'p',1,outline)?.[0].steps[0].display).toBe('23:59:50');expect(row.gate_status).toBe('blocked');expect(JSON.parse(row.quality_payload).existingEvidence).toEqual(['keep']);
 expect(chapterReviewRetryTimePlan({...run,output_text:'另一稿'},'p',1,outline)).toBeUndefined();expect(chapterReviewRetryTimePlan(run,'p',1,outline+'改过章纲')).toBeUndefined();expect(()=>chapterReviewRetryTimePlan(run,'other',1,outline)).toThrow();db.close();
});

it('uses one persisted row for retry parameters and rejects invalid API provenance as a client error',async()=>{
 const {ChainController}=await import('./chain.controller');const {vi}=await import('vitest');const c=Object.create(ChainController.prototype) as any;const run={project_id:'p',chapter_index:1,stage:'chapter',scenario:'writing',output_text:'留存正文'};const get=vi.fn(()=>run);c.db={getDb:()=>({prepare:()=>({get})})};
 expect(c.chapterRetryParameters(undefined,'p',1,'章纲')).toEqual({});expect(get).not.toHaveBeenCalled();expect(c.chapterRetryParameters('r','p',1,'章纲').initialContent).toBe('留存正文');expect(get).toHaveBeenCalledTimes(1);
 try{c.chapterRetryParameters('r','other',1,'章纲');throw Error('should fail');}catch(error:any){expect(error.getStatus()).toBe(400);}
});


it('preserves separate complete historical evidence across repeated assembly without replacing the latest state',async()=>{
 const {ChainController}=await import('./chain.controller');const {vi}=await import('vitest');
 const c=Object.create(ChainController.prototype) as any;
 const latest={id:'two',chapter_index:2,title:'第二章',content:'现在他在医院。'};
 const earlier={id:'one',chapter_index:1,title:'第一章',content:'昨天他在门厅接电话。'};
 const all=vi.fn(()=>[earlier]);
 c.db={getDb:()=>({prepare:()=>({get:()=>latest,all})})};
 const first=c.previousChapterReviewContext('p',3,'背景');
 const second=c.previousChapterReviewContext('p',3,JSON.stringify({storyContext:first,reviewWorldContext:'冻结规则'}));
 const parsed=JSON.parse(second);
 expect(parsed.previousChapter).toEqual([{...latest,complete:true}]);
 expect(parsed.historicalChapters).toEqual([{...earlier,complete:true}]);
 expect(parsed.storyContext).toBe('背景');expect(parsed.reviewWorldContext).toBe('冻结规则');
 expect(all).toHaveBeenCalledWith('p',2,'');
 expect(c.previousChapterReviewContext('p',3,second)).toBe(second);
});


it('lists only same-chapter retained prose, marks length limits and protects saved bodies',async()=>{
 const {ChainController}=await import('./chain.controller');
 const c=Object.create(ChainController.prototype) as any;
 let chapter:any={chapter_index:3,content:''};
 const base={project_id:'p',chapter_index:3,stage:'chapter',scenario:'writing',status:'failed',gate_status:'blocked'};
 const rows=[{...base,id:'long',output_text:'字'.repeat(5001)},{...base,id:'usable',output_text:'字'.repeat(4000)},{...base,id:'json',output_text:'{"pass":true}'},{...base,id:'foreign',project_id:'other',output_text:'字'.repeat(4000)}];
 c.db={getDb:()=>({prepare:(sql:string)=>({get:()=>sql.includes('FROM chapters')?chapter:{settings:'{}'},all:(projectId:string,index:number)=>{expect(projectId).toBe('p');expect(index).toBe(3);return rows;}})})};
 const listed=c.retainedChapterReviewCandidates('p','chapter');
 expect(listed.items.map((x:any)=>[x.runId,x.words,x.canReview])).toEqual([['long',5001,false],['usable',4000,true]]);
 expect(listed.items.every((x:any)=>!('output_text' in x))).toBe(true);
 chapter={chapter_index:3,content:'已保存的正文'};expect(c.retainedChapterReviewCandidates('p','chapter')).toEqual({items:[]});
 chapter=undefined;expect(()=>c.retainedChapterReviewCandidates('p','missing')).toThrow('章节不存在');
});
