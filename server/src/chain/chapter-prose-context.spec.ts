import {describe,it,expect,vi} from 'vitest';
import { createRequire } from 'node:module';
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
import {chapterLengthReviewInput,chapterLengthReviewBatches,chapterLengthReviewFindings,chapterLengthConflictProofErrors,validateChapterLengthReview,applyChapterLengthInsertions} from './chapter-length-expansion';
import {ChainController} from './chain.controller';
import {ChapterService} from '../modules/chapter/chapter.service';
import {WritingQualityService} from '../modules/writing-quality/writing-quality.service';

const source='她把卡片放在长椅上。\n\n雨棚外的车还在等她。\n\n她看了一眼门口。\n\n他没有回答。\n\n她问他还等什么。\n\n他捏起卡片。\n\n墙上的灯还亮着。';
describe('chapter character source authority',()=>{
 it('explicitly forbids inventing a surname for a confirmed unnamed first-person lead',()=>{
  const controller=Object.create(ChainController.prototype) as any;
  const names=['未具名（第一人称‘我’）','马长顺'];
  controller.characterService={
   findByProjectId:()=>names.map((name,index)=>({id:'c'+index,name,age:30})),
   getWritingSummary:(_projectId:string,id:string)=>({profile:{identity_occupation:id==='c0'?'收废品主角':'项目经理'}}),
  };
  const prompt=controller.buildCharacterWritingContext('project-1');
  expect(prompt).toContain('【未具名第一人称主角】');
  expect(prompt).toContain('不得自行给“我”添加“小陈”');
  expect(prompt).toContain('无姓名、无台词、不推动剧情');
  expect(prompt).toContain('【出场角色白名单】');
  expect(prompt).toContain('马长顺');
 });
 it('applies the same first-chapter prohibition when the protagonist card is simply unnamed',()=>{
  for(const placeholder of ['未具名','未命名','待命名']){
   const controller=Object.create(ChainController.prototype) as any;
   controller.characterService={
    findByProjectId:()=>[{id:'lead',name:placeholder,role:'protagonist',age:28},
      {id:'guard',name:'马长顺',role:'main',age:51}],
    getWritingSummary:()=>({profile:{identity_occupation:'当前确认的角色身份'}}),
   };
   const prompt=controller.buildCharacterWritingContext('project-unnamed');
   expect(prompt).toContain('【未具名第一人称主角】');
   expect(prompt).toContain('不得自行给“我”添加“小陈”');
   expect(prompt).toContain('马长顺');
  }
 });
 it('does not impose an unnamed narrator restriction just because a background role lacks a name',()=>{
  const controller=Object.create(ChainController.prototype) as any;
  controller.characterService={
   findByProjectId:()=>[{id:'lead',name:'陈光',role:'protagonist'},
     {id:'background',name:'未具名',role:'other'}],
   getWritingSummary:()=>({profile:{identity_occupation:'人物原有身份'}}),
  };
  expect(controller.buildCharacterWritingContext('project-named')).not.toContain('【未具名第一人称主角】');
 });
 it('does not apply unnamed lead restriction to a project with an explicitly named hero',()=>{
  const controller=Object.create(ChainController.prototype) as any;
  controller.characterService={
   findByProjectId:()=>[{id:'lead',name:'陈光',age:28}],
   getWritingSummary:()=>({profile:{identity_occupation:'工厂门卫'}}),
  };
  const prompt=controller.buildCharacterWritingContext('project-2');
  expect(prompt).toContain('陈光');
  expect(prompt).not.toContain('【未具名第一人称主角】');
 });
});

describe('canonical character preflight on the normal body entry',()=>{
 const controller=()=>{
  const c=Object.create(ChainController.prototype) as any;
  c.logger={log:vi.fn(),error:vi.fn()};
  c.workflowGuard={assertCanGenerateBody:vi.fn()};
  c.assertExecutionStandardsComplete=vi.fn();
  c.rolloutDetailedOutlines=vi.fn();
  c.db={getDb:()=>({prepare:()=>({get:()=>({id:'chapter-1',outline_id:'outline-1',chapter_index:1,target_words:3500}),all:()=>[]})})};
  c.getChapterWordRange=()=>({min:2500,max:5000});
  c.beginChapterGeneration=()=> 'run-1';
  c.finishChapterGeneration=vi.fn();
  c.repairOutlineConsistency=vi.fn();
  c.readChapterOutlineContract=()=>({title:'第一章',text:'本章只执行此前确定的事件'});
  c.realLLM={generate:vi.fn()};
  return c;
 };
 it('uses the database chapter index when optional chapterNumber is absent',async()=>{
  const c=controller();
  c.assertRollingEntitiesConfirmed=vi.fn(()=>{throw Error('有待确认新实体');});
  await expect(c.generate({projectId:'p',chapterId:'chapter-1'})).resolves.toMatchObject({success:false,error:'有待确认新实体'});
  expect(c.assertRollingEntitiesConfirmed).toHaveBeenCalledWith('p',1);
  expect(c.realLLM.generate).not.toHaveBeenCalled();
 });
 it('stops before calling a model when the confirmed character inventory is empty',async()=>{
  const c=controller();
  c.characterService={findByProjectId:()=>[]};
  await expect(c.generate({projectId:'p',chapterId:'chapter-1'})).rejects.toThrow('缺少已确稿角色白名单');
  expect(c.realLLM.generate).not.toHaveBeenCalled();
  expect(c.finishChapterGeneration).toHaveBeenCalledWith('run-1');
 });
 it('does not silently drop a named cast after canonical state context loading fails',async()=>{
  const c=controller();
  c.characterService={findByProjectId:()=>[{id:'lead',name:'未具名（第一人称‘我’）',age:28}],
    getWritingSummary:()=>({profile:{identity_occupation:'废品站收购员'}})};
  c.buildWritingStateContext=()=>{throw Error('已确稿状态读取中断')};
  await expect(c.generate({projectId:'p',chapterId:'chapter-1'})).rejects.toThrow('已确稿写作上下文加载失败');
  expect(c.realLLM.generate).not.toHaveBeenCalled();
 });
 it('includes confirmed world, location and writing state once in the ordinary body prompt',async()=>{
  const c=controller();
  c.buildCharacterWritingContext=()=> '已确认角色：林川';
  c.buildWritingStateContext=()=>({contextText:'写作状态：证物已移交',pendingTotal:0,pendingSummary:[],stateGuard:'不得改变已确认事实'});
  c.buildWorldWritingContext=()=> '世界规则：夜间禁止开门';
  c.buildLocationWritingContext=()=> '地点：北城值班室';
  c.resolvePlatformToneDirective=()=> '采用平台标准';
  c.authorRevisionRequirements=()=> '';
  c.chapterRetryParameters=()=> ({});
  c.buildSubsequentChapterBoundary=()=> '';
  c.generateBodyWithAlignmentGuard=vi.fn().mockResolvedValue({content:'林川收起证物。',qualityReport:{}});
  c.assertNoBlockingGeneratedContentIssues=vi.fn();
  c.characterService={checkConsistency:vi.fn().mockReturnValue({})};
  c.worldSettingService={checkConsistency:vi.fn().mockReturnValue({})};
  c.mapPointService={checkConsistency:vi.fn().mockReturnValue({})};
  const result=await c.generate({projectId:'p',chapterId:'chapter-1',outline:{title:'第一章'},chapterContext:{pov:'第三人称'}});
  expect(result.success).toBe(true);
  const args=c.generateBodyWithAlignmentGuard.mock.calls[0][0];
  for(const fact of ['世界规则：夜间禁止开门','地点：北城值班室','写作状态：证物已移交']){
    expect(args.basePrompt.split(fact)).toHaveLength(2);
    expect(args.storyContext).toContain(fact);
  }
  expect(args.basePrompt).not.toContain('【已确稿 RAG 补充】');
  expect(args.basePrompt).toContain('## 不可偏离的详细大纲');
  expect(args.basePrompt).toContain('已确认角色：林川');
 });
});
describe('long-novel pending entity preflight before prose model cost',()=>{
 it('blocks any unconfirmed or rejected rolled-out entity and names the review target',()=>{
  const c=Object.create(ChainController.prototype) as any;
  c.db={getDb:()=>({prepare:()=>({all:()=>[{target_type:'character',target_label:'沈诺'}]})})};
  expect(()=>c.assertRollingEntitiesConfirmed('p',21)).toThrow('沈诺');
 });
 it('blocks prose for an earlier still-unconfirmed entity, not just entities introduced in this chapter',()=>{
  const controller=Object.create(ChainController.prototype) as any;
  const all=vi.fn(()=>[{target_type:'character',target_label:'沈诺'}]);
  const prepare=vi.fn(()=>({all}));
  controller.db={getDb:()=>({prepare})};
  expect(()=>controller.assertRollingEntitiesConfirmed('p',25)).toThrow('沈诺');
  expect(prepare.mock.calls[0][0]).toContain('JOIN chapters c');
  expect(prepare.mock.calls[0][0]).toContain('c.chapter_index<=?');
  expect(prepare.mock.calls[0][0]).toContain('AND EXISTS (SELECT 1 FROM outlines o');
  expect(all).toHaveBeenCalledWith('p',25,25);
 });
 it('blocks a previously rejected character still mentioned in later outlines, but allows a genuinely revised story',()=>{
  const db=new DatabaseSync(':memory:');
  try {
    db.exec(`
      CREATE TABLE chapters(id TEXT,project_id TEXT,chapter_index INTEGER);
      CREATE TABLE outlines(id TEXT,project_id TEXT,level TEXT,"order" INTEGER,title TEXT,content TEXT,scenes TEXT);
      CREATE TABLE state_items(project_id TEXT,source_type TEXT,source_chapter_id TEXT,
        target_type TEXT,target_label TEXT,status TEXT,authority TEXT);
      INSERT INTO chapters VALUES ('c21','p',21),('c25','p',25);
      INSERT INTO outlines VALUES ('o21','p','chapter',20,'首次出场','沈诺来到西坡站','[]');
      INSERT INTO outlines VALUES ('o25','p','chapter',24,'继续调查','沈诺交出资料','[]');
      INSERT INTO state_items VALUES ('p','rollout_outline','c21','character','沈诺','rejected','excluded');
    `);
    const c=Object.create(ChainController.prototype) as any;
    c.db={getDb:()=>db};
    expect(()=>c.assertRollingEntitiesConfirmed('p',25)).toThrow('沈诺');
    db.prepare("UPDATE outlines SET content='换由另一名已确认角色调查' WHERE id='o21'").run();
    expect(()=>c.assertRollingEntitiesConfirmed('p',25)).toThrow('沈诺');
    db.prepare("UPDATE outlines SET content='已确稿人员交出资料' WHERE id='o25'").run();
    expect(()=>c.assertRollingEntitiesConfirmed('p',25)).not.toThrow();
    db.prepare("UPDATE outlines SET content='沈诺交出资料' WHERE id='o25'").run();
    db.prepare("UPDATE state_items SET status='confirmed',authority='hard_fact'").run();
    expect(()=>c.assertRollingEntitiesConfirmed('p',25)).not.toThrow();
  } finally {db.close();}
 });
 it('allows a chapter whose own rolled-out entity dossiers have all been resolved',()=>{
  const c=Object.create(ChainController.prototype) as any;
  c.db={getDb:()=>({prepare:()=>({all:()=>[]})})};
  expect(()=>c.assertRollingEntitiesConfirmed('p',21)).not.toThrow();
 });
});

describe('chapter outline context scene plan',()=>{
 it('renders object scenes with goal/conflict/outcome and per-scene budget instead of [object Object]',()=>{
  const c=Object.create(ChainController.prototype) as any;
  const text=c.buildChapterOutlineContext({
    title:'第一章',chapter_function:'setup',target_words:4000,
    content:'1) 我→夜班→取耳机→被发现→保留',
    scenes:JSON.stringify({
      wordCountReason:'两场推进',
      scenes:[
        {location:'宿舍',goal:'弄懂耳机',conflict:'每听一次忘一段',outcome:'知道里面有一句话'},
        {location:'值班室',goal:'核对签字',conflict:'随时有人来',outcome:'确认同一只手'},
      ],
    }),
  });
  expect(text).not.toContain('[object Object]');
  expect(text).toContain('场景1：地点=宿舍；目标=弄懂耳机；阻碍=每听一次忘一段；结果=知道里面有一句话');
  expect(text).toContain('场景2：地点=值班室');
  expect(text).toContain('本章目标字数：4000');
 });
 it('uses the structured event frame plus the event-chain reference for prose',async()=>{
  const c=Object.create(ChainController.prototype) as any;
  const text=await c.buildChapterOutlineGenerationContext({
    title:'第一章',chapter_function:'setup',target_words:4000,
    content:'这是一段已经写成叙事的摘要，正文不得原样复述。',
    core_content:'另一段叙事补全。',
    scenes:JSON.stringify({
      responsibilityContract:{entryState:'耳机在袖口',exitState:'决定交出'},
      scenes:[{location:'宿舍',goal:'弄懂耳机',conflict:'每听一次忘一段',outcome:'知道里面有一句话',beats:['我→戴上耳机→听见一句话→摘下又空一块','我→再听一次→想听清那句→又忘一段']}],
      characterActions:[{character:'我',action:'戴上耳机',result:'听见一句话'}],
      conflicts:[{name:'听还是不听',parties:['我','耳机'],trigger:'第一回听完',escalation:'第三回抵掉妈的声音',resolution:'不再听'}],
      hook:'决定交出',emotionalTone:'发冷',
    }),
    location_summary:'宿舍、值班室',
    ending_setup:'天亮前决定交',
  });
  expect(text).toContain('【本章事件骨架】');
  expect(text).toContain('场景1：地点=宿舍；目标=弄懂耳机；阻碍=每听一次忘一段；结果=知道里面有一句话');
  expect(text).toContain('节拍1：我→戴上耳机→听见一句话');
  expect(text).toContain('人物行动与结果：我：戴上耳机→听见一句话');
  expect(text).toContain('冲突设计：听还是不听');
  expect(text).toContain('必须写成现场对白');
  expect(text).toContain('这是一段已经写成叙事的摘要');
  expect(text).toContain('不得原样复述句子');
 });
});

describe('first-pass scene plan carries beats and emotion into the contract',()=>{
 it('parses scene beats and renders them in the coverage contract',()=>{
  const c=Object.create(ChainController.prototype) as any;
  const basePrompt='## 大纲\n场景顺序（按顺序写；场景篇幅按冲突强度和信息量自然分配）：\n'
    +'场景1：地点=宿舍；目标=A；阻碍=B；结果=C\n'
    +'  节拍1：我→戴上耳机→听见一句话\n'
    +'  节拍2：我→想再听→发现忘了一段→决定记下来\n'
    +'场景2：地点=值班室；目标=D；阻碍=E；结果=F\n'
    +'  节拍1：我→查登记簿→老周回来→记住签字\n'
    +'  节拍2：我→被问来意→掩饰→关系变紧\n\n【后续】不得提前消费';
  const plan=c.firstPassScenePlan(basePrompt);
  expect(plan.map((scene:any)=>scene.index)).toEqual([1,2]);
  expect(plan[0].beats).toEqual(['我→戴上耳机→听见一句话','我→想再听→发现忘了一段→决定记下来']);
  expect(plan[1].beats[1]).toContain('关系变紧');
  const coverage=c.firstPassSceneCoverage(plan,4000,3500);
  expect(coverage).toContain('节拍：我→戴上耳机→听见一句话');
  expect(coverage).toContain('每场至少一次人物反应、关系变化或处境变化');
 });
});

describe('chapter beat completion',()=>{
 it('derives and caches scene beats for an old outline without beats',async()=>{
  const c=Object.create(ChainController.prototype) as any;
  c.chapterBeatCache=new Map();
  c.realLLM={generate:vi.fn().mockResolvedValue({content:JSON.stringify({scenes:[
    {beats:['甲→做A→受阻→结果A','乙→做B→反制→结果B','甲→做A2→受阻→结果A2','乙→做B2→反制→结果B2','甲→做A3→受阻→结果A3']},
    {beats:['甲→做C→受阻→结果C','乙→做D→反制→结果D','甲→做C2→受阻→结果C2','乙→做D2→反制→结果D2','甲→做C3→受阻→结果C3']},
  ]})})};
  const outline={id:'o1',title:'第一章',order:0,content:'事件链',scenes:JSON.stringify({scenes:[
    {location:'A',goal:'g1',conflict:'c1',outcome:'r1'},
    {location:'B',goal:'g2',conflict:'c2',outcome:'r2'},
  ]})};
  const plan=await c.ensureChapterBeats(outline);
  expect(plan.scenes[0].beats.slice(0,2)).toEqual(['甲→做A→受阻→结果A','乙→做B→反制→结果B']);
  expect(plan.scenes[1].beats[0]).toContain('做C');
  expect(c.realLLM.generate.mock.calls[0][0].metrics.stepKey).toBe('chapter_beat_plan');
  await c.ensureChapterBeats(outline);
  expect(c.realLLM.generate).toHaveBeenCalledTimes(1);
 });
});

describe('single-pass first draft length contract',()=>{
 it.each([2478,2785])('expands a retained %i-word draft once and still blocks if it stays short',async words=>{
  const c=Object.create(ChainController.prototype) as any;
  const original='她'.repeat(words)+'。';
  c.generationMetrics={getLengthCalibration:()=>({samples:8,ratio:0.6})};
  c.resolveHardlineProfile=()=>undefined;
  c.realLLM={generate:vi.fn().mockResolvedValue({content:original})};
  await expect(c.generateBodyWithLengthGuard({basePrompt:'本章冲突',initialContent:original,targetWords:4000,scenario:'writing',metricsContext:{projectId:'p'}})).rejects.toThrow('低于单章下限');
  expect(c.realLLM.generate).toHaveBeenCalledTimes(1);
  expect(c.realLLM.generate.mock.calls[0][0].metrics.stepKey).toBe('body_expand');
 });
 it('accepts a single first draft that reaches the target',async()=>{
  const c=Object.create(ChainController.prototype) as any;
  const full='她'.repeat(4000)+'。';
  c.resolveHardlineProfile=()=>undefined;
  c.realLLM={generate:vi.fn().mockResolvedValue({content:full})};
  const progress=vi.fn();
  await expect(c.generateBodyWithLengthGuard({basePrompt:'拒绝签字',targetWords:4000,scenario:'writing',onProgress:progress})).resolves.toBe(full);
  expect(c.realLLM.generate).toHaveBeenCalledTimes(1);
  const prompt=c.realLLM.generate.mock.calls[0][0].prompt;
  expect(prompt).toContain('本章篇幅·验收硬条件');
  expect(prompt).toContain('低于 3500 字视为本章未完成');
  expect(prompt).toContain('收尾前自检');
  expect(prompt).toContain('同一动作链能用逗号承接');
  expect(prompt).toContain('三项以上的同构排比');
  expect(prompt).toContain('章末钩子必须落到具体的威胁');
  expect(c.realLLM.generate.mock.calls[0][0].metrics.stepKey).toBe('body_first');
  expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({label:'进入正文质量审核'}));
 });
 it('blocks a short first draft after one targeted expansion',async()=>{
  const c=Object.create(ChainController.prototype) as any;
  const short='她拒绝了，把信退回去。';
  c.resolveHardlineProfile=()=>undefined;
  c.realLLM={generate:vi.fn().mockResolvedValue({content:short})};
  await expect(c.generateBodyWithLengthGuard({basePrompt:'拒绝签字',targetWords:4000,scenario:'writing'})).rejects.toThrow('低于单章下限');
  expect(c.realLLM.generate).toHaveBeenCalledTimes(2);
  expect(c.realLLM.generate.mock.calls[0][0].metrics.stepKey).toBe('body_first');
  expect(c.realLLM.generate.mock.calls[1][0].metrics.stepKey).toBe('body_expand');
 });
 it('does not run a chapter-wide style rewrite after the first draft',async()=>{
  const c=Object.create(ChainController.prototype) as any;
  c.resolveHardlineProfile=()=>undefined;
  c.realLLM={generate:vi.fn().mockResolvedValue({content:'她'.repeat(4000)+'。'})};
  await c.generateBodyWithLengthGuard({basePrompt:'拒绝签字',targetWords:4000,scenario:'writing'});
  expect(c.realLLM.generate.mock.calls.map((call:any[])=>call[0].metrics?.stepKey)).toEqual(['body_first']);
 });
 it('rejects an AI-trace paragraph patch that changes numbers or quoted dialogue',()=>{
  const c=Object.create(ChainController.prototype) as any;
  const original='他数到3次，说“走吧”。';
  expect(c.aiTracePatchPreservesFacts(original,'他数到三次，说“走吧”。')).toBe(false);
  expect(c.aiTracePatchPreservesFacts(original,'他数到3次，说“现在走”。')).toBe(false);
  expect(c.aiTracePatchPreservesFacts(original,'他数到3次，说完“走吧”才起身。')).toBe(true);
 });
});

describe('chapter expansion prose context',()=>{
 it('allows a rich over-target first draft up to the split threshold',async()=>{
  const c=Object.create(ChainController.prototype) as any;
  c.resolveHardlineProfile=()=>undefined;c.realLLM={generate:vi.fn().mockResolvedValue({content:'她'.repeat(5001)})};
  await expect(c.generateBodyWithLengthGuard({basePrompt:'本章',targetWords:4000,scenario:'writing'})).resolves.toHaveLength(5001);
  expect(c.realLLM.generate).toHaveBeenCalledTimes(1);
 });


 it('allows rich prose over target but rejects at the chapter split threshold',()=>{
  const controller=Object.create(ChainController.prototype) as any;
  expect(controller.assertGeneratedChapterLength('她'.repeat(3000),4000)).toBe(3000);
  expect(controller.assertGeneratedChapterLength('她拒绝了。',4000)).toBe(4);
  expect(()=>controller.assertGeneratedChapterLength('',4000)).toThrow('为空');
  expect(controller.assertGeneratedChapterLength('她'.repeat(5001),4000)).toBe(5001);
  expect(()=>controller.assertGeneratedChapterLength('她'.repeat(6601),4000)).toThrow('拆分阈值');
  const chapter=Object.create(ChapterService.prototype) as any;
  chapter.repo={findOutlineTargetWords:()=>4000};
  expect(()=>chapter.assertPublishableWordCount({content:'她'.repeat(3000)})).not.toThrow();
  expect(()=>chapter.assertPublishableWordCount({content:'她拒绝了。'})).toThrow('低于');
  expect(()=>chapter.assertPublishableWordCount({content:''})).toThrow('为空');
  expect(()=>chapter.assertPublishableWordCount({content:'她'.repeat(5001)})).not.toThrow();
  expect(()=>chapter.assertPublishableWordCount({content:'她'.repeat(6601)})).toThrow('拆分');
 });
 
 it('still blocks chapter locking on continuity defects when length is fine',async()=>{
  const chapter=Object.create(ChapterService.prototype) as any;
  chapter.repo={findOutlineTargetWords:()=>4000,findById:()=>({id:'c',project_id:'p',content:'她拒绝了。'.repeat(800),status:'reviewing'}),lockChapter:vi.fn()};
  chapter.derivedDataSync={getLockGate:()=>({allowed:false,reasons:['事实冲突']})};
  await expect(chapter.lock('c')).rejects.toThrow('continuity gate');
  expect(chapter.repo.lockChapter).not.toHaveBeenCalled();
 });
 it('runs real quality analysis before review-state transition for short prose',async()=>{
  const service=Object.create(WritingQualityService.prototype) as any;
  service.chapterService={submitForReview:vi.fn()};
  service.dbService={getDb:()=>({prepare:()=>({get:()=>({content:'她拒绝了。'})})})};
  service.analyzeChapterQuality=vi.fn().mockRejectedValue(new Error('必要事件未完成'));
  await expect(service.submitChapterForQualityReview('p',{chapterId:'c'})).rejects.toThrow('必要事件未完成');
  expect(service.analyzeChapterQuality).toHaveBeenCalledTimes(1);
  expect(service.chapterService.submitForReview).not.toHaveBeenCalled();
 });
 it('never applies insertions when the same proposal reports insufficient scene capacity',()=>{
  const proposal={blocked:true,reason:'不能有效扩写',insertions:[{before:'她把卡片放在长椅上。',text:'凑字数'}]};
  expect(()=>applyChapterLengthInsertions(source,proposal)).toThrow('保留来源原稿');
 });
 it('sends the full original once per existing batch, retaining local entry and exit states',()=>{
  const input=chapterLengthReviewInput(source,{insertions:[{before:'他捏起卡片。',text:'她又把卡片放在长椅上。'}]});
  expect(input.items[0].previous).not.toContain('她把卡片放在长椅上。');
  const batches=chapterLengthReviewBatches(input);expect(batches).toHaveLength(1);
  const payload=JSON.parse(batches[0].prompt.slice(batches[0].prompt.indexOf('\n')+1));
  expect(payload.sourceText).toBe(source);expect(payload.items[0].following).toBe(input.items[0].following);
  expect(payload.items[0].sourceText).toBeUndefined();
  expect(batches[0].prompt).toContain('information_repeat');expect(batches[0].prompt).toContain('不能仅说无矛盾');
 });
 it('can cite an earlier completed action outside the old two-paragraph window',()=>{
  const input=chapterLengthReviewInput(source,{insertions:[{before:'他捏起卡片。',text:'她又把卡片放在长椅上。'}]});
  const verdict={checks:[{id:'I1',status:'conflict',addedEvidence:input.items[0].text,sourceEvidence:'她把卡片放在长椅上。',reason:'卡片已经放好，原稿没有取回，新增再次放置是无依据的重演',
   conflictProof:{kind:'action_replay',sourcePhase:'completed',addedPhase:'reexecute',sourceState:'卡片已放好',addedState:'再次放同一卡片',completionEvidence:'她把卡片放在长椅上。',incompatibility:'没有取回动作却再次放下同一卡片，重演原稿已完成动作'}}]};
  expect(chapterLengthConflictProofErrors(verdict,input.items,input.sourceText)).toEqual([]);
  expect(chapterLengthReviewFindings(verdict,input.items,input.sourceText)).toHaveLength(1);
  expect(()=>validateChapterLengthReview(verdict,input.items,input.sourceText)).toThrow('未通过');
 });
 it('does not let full context turn a future action into a completed earlier fact',()=>{
  const input=chapterLengthReviewInput(source,{insertions:[{before:'他捏起卡片。',text:'他先看向墙上的灯。'}]});
  const verdict={checks:[{id:'I1',status:'conflict',sourceEvidence:'墙上的灯还亮着。',conflictProof:{kind:'action_replay',sourcePhase:'completed',addedPhase:'reexecute',sourceState:'灯亮着',addedState:'看向灯',completionEvidence:'墙上的灯还亮着。',incompatibility:'假设后文观察已经发生以声称新增重演'}}]};
  expect(chapterLengthConflictProofErrors(verdict,input.items,input.sourceText).length).toBeGreaterThan(0);
 });
 it('accepts a located repetition finding without requiring an unrelated state contradiction',()=>{
  const body='雨水打在铁棚上，响得说话都听不清。\n\n她递过去一张纸。\n\n他看完上面的字。\n\n他把纸收好。';
  const input=chapterLengthReviewInput(body,{insertions:[{before:'他把纸收好。',text:'棚上的雨声又密又响，仍是那阵雨。'}]});
  const verdict={checks:[{id:'I1',status:'conflict',addedEvidence:input.items[0].text,sourceEvidence:body.split('\n')[0],reason:'再次说明同一雨声，没有新观察或情绪、判断与行动上的作用',
   conflictProof:{kind:'information_repeat',sourcePhase:'static',addedPhase:'static',sourceState:'雨声大且密',addedState:'同样的雨声大且密',incompatibility:'只换词复述同一环境，没有带来判断或有效情绪体验的增量'}}]};
  expect(chapterLengthConflictProofErrors(verdict,input.items,input.sourceText)).toEqual([]);
  expect(()=>validateChapterLengthReview(verdict,input.items,input.sourceText)).toThrow('未通过');
 });
});
