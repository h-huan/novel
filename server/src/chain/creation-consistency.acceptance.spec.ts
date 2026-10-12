import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { Migrator } from '../database/migrator';
import { seedAcceptanceProject } from '../acceptance/test-project-fixture';
import { buildCanonPolicyDirective } from '../modules/canon/canon-policy';
import { ChainController } from './chain.controller';
import { CROSS_STAGE_REVIEW_POLICY } from '../../shared/src/system-workflow-rules.registry';

let db: DatabaseSync;
let controller: any;
const review = (consistent: boolean, contradictions: string[] = []) => ({ data: { consistent, contradictions, unrelatedInventions: [] }, warnings: [] });
const patch = (replacement: string) => ({ data: { patches: [{ entityType: 'foreshadowing', entityId: 'clue', field: 'planned_recovery_chapter_index', match: '3', replacement }] }, warnings: [] });
const chapterValue = () => (db.prepare('SELECT planned_recovery_chapter_index AS value FROM foreshadowings WHERE id=?').get('clue') as any).value;
const run = () => controller.reviewCreationConsistency('p', { selectedIdea: {} }, '{}', '', [], vi.fn());

beforeEach(async () => {
  db = new DatabaseSync(':memory:');
  await new Migrator(db).runMigrations();
  seedAcceptanceProject(db, { id: 'p', type: 'short_story' });
  const now = new Date().toISOString();
  db.prepare('INSERT INTO world_settings(id,project_id,name,era,created_at,updated_at) VALUES(?,?,?,?,?,?)')
    .run('world', 'p', '冻结世界', '古代边镇', now, now);
  db.prepare('INSERT INTO world_system_profiles(id,project_id,world_setting_id,hierarchy_rules,created_at,updated_at) VALUES(?,?,?,?,?,?)')
    .run('profile', 'p', 'world', '边军不得越级调兵。\n' + buildCanonPolicyDirective(), now, now);
  for (let index = 0; index < 5; index++) {
    db.prepare('INSERT INTO outlines(id,project_id,level,"order",title,content,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
      .run('chapter' + index, 'p', 'chapter', index, '章节' + index, '第三章回收。' + '保留正文规划。'.repeat(600), now, now);
  }
  db.prepare('INSERT INTO foreshadowings(id,project_id,content,buried_chapter_index,planned_recovery_chapter_index,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
    .run('clue', 'p', '刀上的印记', 1, 3, now, now);
  controller = Object.create(ChainController.prototype);
  controller.db = { getDb: () => db };
  controller.logger = { warn: vi.fn(), error: vi.fn() };
  controller.llmCallWithRetry = vi.fn();
  controller.reviewOutlineFacts = vi.fn().mockResolvedValue({consistent:true,contradictions:[],ledger:[]});
});
afterEach(() => db.close());

describe('production cross-module commit boundary with native SQLite', () => {
  it('reviews all outline fields consumed by prose instead of omitting auxiliary scene copies', async () => {
    const values={hot_scenes:JSON.stringify(['截图发到群里，群友看不见那行字。']),setback_scenes:JSON.stringify(['受阻场景完整原文']),
      highlight_points:JSON.stringify(['高潮来源完整原文']),core_content:'补全内容完整原文',plot_points:JSON.stringify({coreEvent:'核心事件完整原文'}),
      detail_json:JSON.stringify({characterKnowledge:['深度计划原文']}),goal_arc:'章节目标原文',system_hints:'设定提示原文'};
    for(const [field,value] of Object.entries(values))db.prepare(`UPDATE outlines SET ${field}=? WHERE id=?`).run(value,'chapter0');
    const row=db.prepare('SELECT * FROM outlines WHERE id=?').get('chapter0');
    const profile=JSON.stringify({identity_occupation:'当前人物身份原文',catchphrase_speech_style:'当前人物声音原文'});
    db.prepare('INSERT INTO characters(id,project_id,name,age,appearance,dialogue_style,profile_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .run('voice','p','甲',31,'人物外貌原文','对白风格原文',profile,'now','now');
    db.prepare('INSERT INTO characters(id,project_id,name,profile_json,created_at,updated_at) VALUES(?,?,?,?,?,?)')
      .run('legacy','p','乙','{}','now','now');
    for(const id of ['voice','legacy'])db.prepare('INSERT INTO character_extended_profiles(id,project_id,character_id,speech_style,created_at,updated_at) VALUES(?,?,?,?,?,?)')
      .run('profile-'+id,'p',id,'旧版声音原文','now','now');
    const writing=controller.buildChapterOutlineContext(row);
    controller.llmCallWithRetry.mockImplementation(async(label:string,prompt:string)=>{
      expect(label).toBe('跨模块故事一致性审查');
      const bundle=JSON.parse(prompt.split('【生成资料】')[1].split('\n重点检查：')[0]);
      const chapter=bundle.chapters.find((item:any)=>item.id==='chapter0');
      expect(chapter).toMatchObject(values);
      expect(bundle.characters.find((item:any)=>item.id==='voice')).toMatchObject({age:31,appearance:'人物外貌原文',dialogue_style:'对白风格原文',profile_json:profile});
      expect(bundle.legacyCharacterProfiles).toHaveLength(1);
      expect(bundle.legacyCharacterProfiles[0]).toMatchObject({character_id:'legacy',speech_style:'旧版声音原文'});
      for(const field of ['project_id','created_at','updated_at','order','parent_id'])expect(chapter).not.toHaveProperty(field);
      for(const text of ['截图发到群里','受阻场景完整原文','高潮来源完整原文','补全内容完整原文','核心事件完整原文']) {
        expect(writing).toContain(text);expect(prompt).toContain(text);
      }
      throw Error('已捕获实际审查输入');
    });
    await expect(run()).rejects.toThrow('已捕获实际审查输入');
    expect(db.prepare('SELECT hot_scenes FROM outlines WHERE id=?').get('chapter0')).toEqual({hot_scenes:values.hot_scenes});
  });
  it.each([1, 2])('stops at repair budget %i after confirmed stage failure without unused source reviews or publishing candidates', async (budget) => {
    const content='主角还原唯一时间窗，但仅申请资料，尚未拿到筹码。';
    db.prepare('UPDATE outlines SET content=? WHERE id=?').run(content,'chapter0');
    let repairs=0,sourceReviews=0;
    controller.llmCallWithRetry.mockImplementation(async(label:string)=>{
      if(label.includes('候选复查')||label==='跨模块故事一致性审查')return review(true);
      if(label==='阶段兑现独立验收')return {data:{checks:[{ref:'P1',status:'weakened',candidateEvidence:content,reason:'本阶段仅申请资料，没有取得承诺的反制筹码'}]},warnings:[]};
      if(label==='章纲来源边界专项复核'){
        sourceReviews++;
        return {data:{checks:[{id:'chapter0-B-content-0',status:'supported',basisEvidence:'边军不得越级调兵。',reason:'模拟该专项已完成核对，不代替阶段成果验收'}]},warnings:[]};
      }
      if(label.startsWith('跨模块故事一致性修订')){
        const current=(db.prepare('SELECT content FROM outlines WHERE id=?').get('chapter0') as any).content;
        repairs++;
        return {data:{patches:[{entityType:'chapter',entityId:'chapter0',field:'content',match:current,
          replacement:content+'本次方案'+repairs+'仍待取得。'}]},warnings:[]};
      }
      throw Error('unexpected review: '+label);
    });
    const brief=JSON.stringify({confirmedStory:{scopeBreakdown:[{chapters:1,outcome:'主角取得反制筹码。'}]}});
    await expect(controller.reviewCreationConsistency('p',{selectedIdea:{}},brief,'',[],vi.fn(),[],budget)).rejects.toThrow(`经${budget}次自动修订`);
    expect(repairs).toBe(budget);
    expect(sourceReviews).toBe(budget); // initial and earlier candidates; final failure already decides rejection
    expect(controller.reviewOutlineFacts.mock.calls.some((call:any[])=>JSON.stringify(call).includes('本次方案'+budget))).toBe(false);
    expect((db.prepare('SELECT content FROM outlines WHERE id=?').get('chapter0') as any).content).toBe(content);
  });
  it('does not let a green broad review bypass the independent stage outcome gate', async () => {
    const content='主角仅申请调取材料，尚未拿到反制筹码。';
    db.prepare('UPDATE outlines SET content=? WHERE id=?').run(content,'chapter0');
    let independentlyChecked=false;
    controller.llmCallWithRetry.mockImplementation(async(label:string,prompt:string)=>{
      if(label==='跨模块故事一致性审查')return review(true);
      if(label==='阶段兑现独立验收'){
        expect(prompt).toContain(content);expect(prompt).toContain('全书目标或后章未来安排不能代替');independentlyChecked=true;
        expect(prompt).not.toContain('第三章回收。');
        const actual=JSON.parse(prompt.split('【实际阶段章纲】')[1].split('\n只返回JSON:')[0]);
        expect(actual.chapters.map((row:any)=>row.id)).toEqual(['chapter0']);
        return {data:{checks:[{ref:'P1',status:'weakened',candidateEvidence:content,reason:'已承诺拿到反制筹码，本阶段仍只申请而尚未取得'}]},warnings:[]};
      }
      expect(independentlyChecked).toBe(true);throw Error('stage gap reached upstream repair');
    });
    const brief=JSON.stringify({confirmedStory:{scopeBreakdown:[{chapters:1,outcome:'主角取得反制筹码，夺回主动权。'}]}});
    await expect(controller.reviewCreationConsistency('p',{selectedIdea:{}},brief,'',[],vi.fn())).rejects.toThrow('stage gap reached upstream repair');
    expect(independentlyChecked).toBe(true);
    expect((db.prepare('SELECT content FROM outlines WHERE id=?').get('chapter0') as any).content).toBe(content);
  });
  it('routes a preserved label with a suspicion-only reason to upstream repair without committing it', async () => {
    const content='主角仅得到一个嫌疑方向，尚未排除其它通道。';
    db.prepare('UPDATE outlines SET content=? WHERE id=?').run(content,'chapter0');
    let reached=false;
    controller.llmCallWithRetry.mockImplementation(async(label:string,prompt:string)=>{
      if(label==='跨模块故事一致性审查')return review(true);
      if(label==='阶段兑现独立验收')return {data:{checks:[{ref:'P1',status:'preserved',candidateEvidence:content,reason:'本阶段所得属嫌疑方向，未声称已经排除其它路径'}]},warnings:[]};
      if(label.startsWith('跨模块故事一致性修订')){
        expect(prompt).toContain('评审结论与依据不一致');expect(prompt).toContain('主角确定唯一通道。');
        expect(prompt).toContain('必要条件有缺口时，先补对应阶段的实际取得或处置行动');
        reached=true;throw Error('negative evidence reached source repair');
      }
      throw Error('unexpected review: '+label);
    });
    const brief=JSON.stringify({confirmedStory:{scopeBreakdown:[{chapters:1,outcome:'主角确定唯一通道。'}]}});
    await expect(controller.reviewCreationConsistency('p',{selectedIdea:{}},brief,'',[],vi.fn())).rejects.toThrow('negative evidence reached source repair');
    expect(reached).toBe(true);
    expect((db.prepare('SELECT content FROM outlines WHERE id=?').get('chapter0') as any).content).toBe(content);
  });
  it('stops a explicitly blocked source plan without protocol retries, candidate reviews or Canon writes', async () => {
    const content='仅提交申请，材料尚未取得。';
    db.prepare('UPDATE outlines SET content=? WHERE id=?').run(content,'chapter0');
    let repairs=0;
    controller.llmCallWithRetry.mockImplementation(async(label:string,prompt:string,options:any)=>{
      if(label==='跨模块故事一致性审查')return review(true);
      if(label==='阶段兑现独立验收')return {data:{checks:[{ref:'P1',status:'weakened',candidateEvidence:content,reason:'只有申请，没有取得承诺的材料'}]},warnings:[]};
      if(label.startsWith('跨模块故事一致性修订')) {
        expect(prompt).toContain('先完成路径设计');repairs++;
        const data={repairPlans:[{ref:'P1',status:'blocked',remainingCounterexamples:['现有来源与权限无法完成取得']}],edits:[]};
        expect(options.validate(data)).toBe(true);
        return {data,warnings:[]};
      }
      throw Error('不应继续调用 '+label);
    });
    const brief=JSON.stringify({confirmedStory:{scopeBreakdown:[{chapters:1,outcome:'取得材料。'}]}});
    await expect(controller.reviewCreationConsistency('p',{selectedIdea:{}},brief,'',[],vi.fn())).rejects.toThrow('上游替代路径未形成');
    expect(repairs).toBe(1);
    expect((db.prepare('SELECT content FROM outlines WHERE id=?').get('chapter0') as any).content).toBe(content);
  });
  it.each(['supported','gap'])('reconciles disputed prerequisite evidence before a plan repair while retaining %s verdicts', async (verdict) => {
    const content='来访者把对手关在屋内。对手主动留在屋内收拾痕迹，没有追出去。';
    const basis='对手主动留在屋内收拾痕迹，没有追出去。';
    db.prepare('UPDATE outlines SET content=?,scenes=? WHERE id=?').run(content,JSON.stringify({characterActions:[{character:'来访者',action:'离开房间，对手选择留下',result:'双方暂时分开'}]}),'chapter0');
    let reconciled=false;
    controller.llmCallWithRetry.mockImplementation(async(label:string,prompt:string)=>{
      if(label==='跨模块故事一致性审查')return review(true);
      if(label==='章纲来源边界专项复核')return {data:{checks:[{id:'chapter0-B-content-0',status:'gap',basisEvidence:basis,reason:'只关门不能限制对手自行离开'}]},warnings:[]};
      if(label==='章纲关键结果专项复核')return {data:{checks:[{ref:'chapter0-A1-R1',status:'supported',evidence:'双方暂时分开',basisEvidence:basis,reason:'对手选择留下，来访者离开，双方自然分开'}]},warnings:[]};
      if(label==='章纲专项证据分歧核对'){
        expect(prompt).toContain('来源专项原判');expect(prompt).toContain('对手选择留下');expect(prompt).toContain(basis);
        expect(prompt).toContain('不因另一专项通过就放行');reconciled=true;
        return {data:{checks:[{id:'chapter0-B-content-0',status:verdict,basisEvidence:basis,reason:verdict==='supported'?'对手主动选择留下，不是由关门强制限制':'虽有自主留下，但强制关在屋内的表述仍扩大动作效果'}]},warnings:[]};
      }
      expect(reconciled).toBe(true);throw Error('real gap reached repair');
    });
    if(verdict==='supported')await run();
    else await expect(run()).rejects.toThrow('real gap reached repair');
    expect(reconciled).toBe(true);
    expect((db.prepare('SELECT content FROM outlines WHERE id=?').get('chapter0') as any).content).toBe(content);
  });
  it('supplies existing resources and actual acquisition plans to boundary review without making plans world abilities', async () => {
    const now=new Date().toISOString();
    db.prepare('INSERT INTO characters(id,project_id,name,abilities,arc,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
      .run('owner','p','房主','只持有本人门卡','当晚把备用门卡交给来访者',now,now);
    db.prepare('UPDATE outlines SET content=?,scenes=? WHERE id=?').run('个人授权使闸机一直敞开。',JSON.stringify({characterActions:[{character:'房主',action:'把备用门卡交给来访者',result:'来访者拿到门卡'}]}),'chapter0');
    controller.llmCallWithRetry.mockResolvedValueOnce(review(true)).mockImplementationOnce(async(_label:string,prompt:string)=>{
      expect(prompt).toContain('只持有本人门卡');expect(prompt).toContain('把备用门卡交给来访者');
      expect(prompt).toContain('当前待验候选');expect(prompt).not.toContain('existingCharacterResources');
      expect(prompt).toContain(CROSS_STAGE_REVIEW_POLICY);
      expect(prompt).toContain('候选动作与交付只证明计划前提');expect(prompt).toContain('不能赋予新能力');
      throw Error('prerequisites verified');
    });
    await expect(run()).rejects.toThrow('prerequisites verified');
    expect((db.prepare('SELECT content FROM outlines WHERE id=?').get('chapter0') as any).content).toBe('个人授权使闸机一直敞开。');
  });
  it('rechecks candidate event facts after a broad pass and keeps them unpublished until the ledger passes', async () => {
    controller.llmCallWithRetry.mockResolvedValueOnce(review(true)).mockResolvedValueOnce(patch('5')).mockResolvedValueOnce(review(true));
    controller.reviewOutlineFacts.mockResolvedValueOnce({consistent:false,contradictions:['chapter0 与 clue 的回收时点互斥'],ledger:[]})
      .mockResolvedValueOnce({consistent:true,contradictions:[],ledger:[]})
      .mockImplementation(async()=>{expect(chapterValue()).toBe(3);return {consistent:true,contradictions:[],ledger:[]};});
    await run();
    expect(chapterValue()).toBe(5);
    expect(controller.reviewOutlineFacts).toHaveBeenCalledTimes(3);
    expect(controller.reviewOutlineFacts.mock.calls[2][5][0].id).toBe('chapter0');
    expect(controller.reviewOutlineFacts.mock.calls[2][9]).toBe('creation_outline_fact_dependencies');
  });
  it('rejects unseen concurrent field changes instead of committing a different reviewed version', async () => {
    const original=(db.prepare('SELECT content FROM outlines WHERE id=?').get('chapter0') as any).content;
    controller.llmCallWithRetry.mockResolvedValueOnce(review(false,['chapter0 回收安排互斥']))
      .mockImplementationOnce(async()=>{
        db.prepare('UPDATE outlines SET content=? WHERE id=?').run(original+'并发增加的事实。','chapter0');
        return {data:{patches:[{entityType:'chapter',entityId:'chapter0',field:'content',match:'第三章回收。',replacement:'第五章回收。'}]},warnings:[]};
      });
    await expect(run()).rejects.toThrow('不是同一版本');
    expect((db.prepare('SELECT content FROM outlines WHERE id=?').get('chapter0') as any).content).toBe(original+'并发增加的事实。');
  });
  it('commits required dependent edits with the same reason only after full candidate approval', async () => {
    const original=(db.prepare('SELECT content FROM outlines WHERE id=?').get('chapter0') as any).content;
    controller.llmCallWithRetry.mockResolvedValueOnce(review(false,['clue 与 chapter0 回收安排互斥']))
      .mockResolvedValueOnce({data:{patches:[
        {...patch('5').data.patches[0],reason:'同步回收安排'},
        {entityType:'chapter',entityId:'chapter0',field:'content',match:'第三章回收。',replacement:'第五章回收。',reason:'同步回收安排'},
      ]},warnings:[]})
      .mockImplementationOnce(async()=>{expect(chapterValue()).toBe(3);expect((db.prepare('SELECT content FROM outlines WHERE id=?').get('chapter0') as any).content).toBe(original);return review(true);});
    await run();
    expect(chapterValue()).toBe(5);
    expect((db.prepare('SELECT content FROM outlines WHERE id=?').get('chapter0') as any).content).toBe(original.replace('第三章回收。','第五章回收。'));
  });
  it('includes book and volume sources in the same guarded candidate scope', async () => {
    const now=new Date().toISOString();
    db.prepare('INSERT INTO outlines(id,project_id,level,"order",title,content,book_skeleton,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .run('book','p','book',0,'总纲','原始总纲方法','{"ending":"原始总纲方法"}',now,now);
    controller.llmCallWithRetry.mockImplementationOnce(async (_label:string,prompt:string)=>{
      const bundle=JSON.parse(prompt.split('【生成资料】')[1].split('\n')[0]);
      expect(bundle.chapters.find((row:any)=>row.id==='book')).toMatchObject({level:'book',content:'原始总纲方法',book_skeleton:'{"ending":"原始总纲方法"}',chapterIndex:null});
      throw Error('coverage verified');
    });
    await expect(run()).rejects.toThrow('coverage verified');
    expect((db.prepare('SELECT content FROM outlines WHERE id=?').get('book') as any).content).toBe('原始总纲方法');
  });
  it('keeps a reported target in candidate review after its risk keywords are removed', async () => {
    const original='授权有效时门一直开，后来的人不用刷卡。';
    const corrected='授权有效时本人须刷卡进入，闸机随即关闭。';
    db.prepare('UPDATE outlines SET content=? WHERE id=?').run(original,'chapter0');
    db.prepare('UPDATE world_settings SET rules=? WHERE id=?').run('许可只供本人刷卡进入。','world');
    controller.llmCallWithRetry.mockResolvedValueOnce(review(true))
      .mockResolvedValueOnce({data:{checks:[{id:'chapter0-B-content-0',status:'gap',origin:'chapter_plan',evidence:original.slice(0,-1),
        outlineEvidence:original.slice(0,-1),basisEvidence:'许可只供本人刷卡进入。',reason:'个人许可被扩大为持续开门与他人免刷卡'}]},warnings:[]})
      .mockImplementationOnce(async(_label:string,prompt:string)=>{
        expect(prompt).toContain('主体在时段内具有许可不等于对象持续处于某物理状态');
        expect(prompt).toContain('不为保留悬念追加未授权效果');
        expect(prompt).toContain('替代方案不能用新的未经授权效果替换旧效果');
        expect(prompt).toContain(CROSS_STAGE_REVIEW_POLICY);
        return {data:{patches:[{entityType:'chapter',entityId:'chapter0',field:'content',match:original,replacement:corrected}]},warnings:[]};
      })
      .mockImplementationOnce(async()=>{expect((db.prepare('SELECT content FROM outlines WHERE id=?').get('chapter0') as any).content).toBe(original);return review(true);})
      .mockImplementationOnce(async(label:string,prompt:string)=>{
        expect(label).toBe('章纲来源边界专项复核');
        expect(prompt).toContain(corrected.slice(0,-1));
        expect((db.prepare('SELECT content FROM outlines WHERE id=?').get('chapter0') as any).content).toBe(original);
        return {data:{checks:[{id:'chapter0-B-content-0',status:'supported',origin:'chapter_plan',evidence:corrected.slice(0,-1),outlineEvidence:corrected.slice(0,-1),basisEvidence:'许可只供本人刷卡进入。',reason:'本人刷卡，未扩展他人权限'}]},warnings:[]};
      });
    await run();
    expect((db.prepare('SELECT content FROM outlines WHERE id=?').get('chapter0') as any).content).toBe(corrected);
    expect(controller.llmCallWithRetry).toHaveBeenCalledTimes(5);
  });
  it('retains tail mechanism rules and extended world constraints in the actual creation review', async () => {
    const rules='普通背景。'.repeat(150)+'复制文件不改变其内容；个人许可不授予他人权限。';
    db.prepare('UPDATE world_settings SET rules=?,constraints=?,social_rules=?,special_settings=? WHERE id=?')
      .run(rules,'{"endingDirection":"目标不能授予设备新能力"}','住户另有个人卡权限。','没有超自然感知能力。','world');
    const scenes=JSON.stringify({setup:'正常场景。'.repeat(160),outcome:'末尾出口必须有实际取得权限的行动。'});
    db.prepare('UPDATE outlines SET scenes=?,ending_setup=?,conflict_design=? WHERE id=?')
      .run(scenes,'终局是救人，不是凭空控制对手。','设备与账号的能力范围不能混同。','chapter0');
    controller.llmCallWithRetry.mockImplementation(async (_label:string,prompt:string)=>{
      expect(prompt).toContain(rules);
      expect(prompt).toContain('目标不能授予设备新能力');
      expect(prompt).toContain('住户另有个人卡权限');
      expect(prompt).toContain('没有超自然感知能力');
      const generated=JSON.parse(prompt.split('【生成资料】')[1].split('\n')[0]);
      expect(generated.chapters[0].scenes).toBe(scenes);
      expect(generated.chapters[0].ending_setup).toContain('不是凭空控制对手');
      expect(generated.chapters[0].conflict_design).toContain('不能混同');
      return review(true);
    });
    await run();
    expect(controller.llmCallWithRetry).toHaveBeenCalledTimes(1);
  });
  it('corrects the logged contradictory review before attempting any Canon repair', async () => {
    delete controller.llmCallWithRetry;
    const inconsistentProtocol = { consistent: true, contradictions: [], unrelatedInventions: ['地点未被使用，属于冗余'] };
    const corrected = { consistent: true, contradictions: [], unrelatedInventions: [], warnings: ['地点未被使用，属于冗余'] };
    controller.realLLM = { generate: vi.fn()
      .mockResolvedValueOnce({ content: JSON.stringify(inconsistentProtocol) })
      .mockImplementationOnce(async (options: any) => {
        expect(options.prompt).toContain('自相矛盾');
        expect(options.prompt).toContain('不修改输入资料，不生成patches');
        return { content: JSON.stringify(corrected) };
      }) };
    const warnings: string[] = [];
    await controller.reviewCreationConsistency('p', { selectedIdea: {} }, '{}', '', warnings, vi.fn());
    expect(controller.realLLM.generate).toHaveBeenCalledTimes(2);
    expect(warnings.join('；')).toContain('跨模块资料建议：地点未被使用');
    expect(chapterValue()).toBe(3);
    expect((db.prepare('SELECT era FROM world_settings WHERE id=?').get('world') as any).era).toBe('古代边镇');
  });

  it('blocks activation without modifying Canon when contradictory review correction also fails', async () => {
    db.prepare("UPDATE projects SET status='generating' WHERE id=?").run('p');
    delete controller.llmCallWithRetry;
    const invalid = { consistent: true, contradictions: ['真实时间互斥'], unrelatedInventions: [] };
    controller.realLLM = { generate: vi.fn().mockResolvedValue({ content: JSON.stringify(invalid) }) };
    await expect(run()).rejects.toThrow('自相矛盾');
    expect(controller.realLLM.generate).toHaveBeenCalledTimes(2);
    expect(chapterValue()).toBe(3);
    expect((db.prepare('SELECT status FROM projects WHERE id=?').get('p') as any).status).not.toBe('active');
  });

  it('uses the same protocol correction for a candidate and only then commits', async () => {
    delete controller.llmCallWithRetry;
    const initial = review(false, ['回收章节冲突']).data;
    const invalid = { consistent: true, contradictions: [], unrelatedInventions: ['背景资料冗余'] };
    controller.realLLM = { generate: vi.fn()
      .mockResolvedValueOnce({ content: JSON.stringify(initial) })
      .mockResolvedValueOnce({ content: JSON.stringify(patch('5').data) })
      .mockImplementationOnce(async () => { expect(chapterValue()).toBe(3); return { content: JSON.stringify(invalid) }; })
      .mockImplementationOnce(async (options: any) => {
        expect(chapterValue()).toBe(3);
        expect(options.prompt).toContain('不修改输入资料，不生成patches');
        return { content: JSON.stringify({ ...review(true).data, warnings: ['背景资料冗余'] }) };
      }) };
    await run();
    expect(chapterValue()).toBe(5);
    expect(controller.realLLM.generate).toHaveBeenCalledTimes(4);
  });

  it('retains failed candidate diagnostics as feedback without promoting candidate facts to Canon', async () => {
    const originalPolicy = (db.prepare('SELECT hierarchy_rules FROM world_system_profiles WHERE id=?').get('profile') as any).hierarchy_rules;
    controller.llmCallWithRetry
      .mockImplementationOnce(async (_name: string, prompt: string) => {
        const generated = JSON.parse(prompt.split('【生成资料】')[1].split('\n')[0]);
        expect(generated.worldProfiles[0].hierarchy_rules).toBe('边军不得越级调兵。');
        expect(generated.chapters.map((chapter: any) => chapter.chapterIndex)).toEqual([1, 2, 3, 4, 5]);
        expect(generated.chapters[0]).not.toHaveProperty('order');
        expect(generated.foreshadowings[0].buried_chapter_index).toBe(1);
        expect(prompt).not.toContain('数据库order是从0开始的同级内部排序'); // Provider injects the active execution standard.
        return review(false, ['原始回收章节冲突']);
      })
      .mockResolvedValueOnce(patch('4'))
      .mockImplementationOnce(async () => { expect(chapterValue()).toBe(3); return review(false, ['只在失败候选中出现的问题']); })
      .mockImplementationOnce(async (_name: string, prompt: string) => {
        expect(prompt).toContain('只在失败候选中出现的问题');
        expect(prompt).toContain('原Canon保留为提交校验基线');
        expect(prompt).toContain('planned_recovery_chapter_index');
        const positions = JSON.parse(prompt.split('【完整目标位置目录】')[1].split('\n')[0]);
        expect(positions.find((entry: any) => entry.entityId === 'clue').fields.planned_recovery_chapter_index[0][2]).toBe('4');
        expect(chapterValue()).toBe(3);
        return {data:{patches:[{entityType:'foreshadowing',entityId:'clue',field:'planned_recovery_chapter_index',match:'4',replacement:'5'}]},warnings:[]};
      })
      .mockImplementationOnce(async () => { expect(chapterValue()).toBe(3); return review(true); });
    await run();
    expect(chapterValue()).toBe(5);
    expect(typeof chapterValue()).toBe('number');
    expect((db.prepare('SELECT hierarchy_rules FROM world_system_profiles WHERE id=?').get('profile') as any).hierarchy_rules).toBe(originalPolicy);
  });
  it('stops a repeated failed candidate before paying for another review', async () => {
    controller.llmCallWithRetry.mockResolvedValueOnce(review(false,['clue原始章节冲突']))
      .mockResolvedValueOnce(patch('4')).mockResolvedValueOnce(review(false,['候选出口仍不成立']))
      .mockImplementationOnce(async(_name:string,prompt:string)=>{
        expect(prompt).toContain('候选出口仍不成立');expect(chapterValue()).toBe(3);return patch('4');
      });
    await expect(run()).rejects.toThrow(/没有形成|重复返回|没有改变/);
    expect(controller.llmCallWithRetry).toHaveBeenCalledTimes(4);
    expect(chapterValue()).toBe(3);
  });

  it('blocks optimistic commit if live data changes during candidate review', async () => {
    controller.llmCallWithRetry.mockResolvedValueOnce(review(false, ['回收章节冲突'])).mockResolvedValueOnce(patch('5'))
      .mockImplementationOnce(async () => {
        db.prepare('UPDATE foreshadowings SET planned_recovery_chapter_index=4 WHERE id=?').run('clue');
        return review(true);
      });
    await expect(run()).rejects.toThrow('提交冲突');
    expect(chapterValue()).toBe(4);
  });

  it('preserves text beyond the audit preview when committing an anchored patch', async () => {
    const original = (db.prepare('SELECT content FROM outlines WHERE id=?').get('chapter0') as any).content;
    controller.llmCallWithRetry.mockResolvedValueOnce(review(false, ['章纲回收章节冲突']))
      .mockResolvedValueOnce({ data: { patches: [{ entityType: 'chapter', entityId: 'chapter0', field: 'content', match: '第三章回收', replacement: '第五章回收' }] }, warnings: [] })
      .mockResolvedValueOnce(review(true));
    await run();
    expect((db.prepare('SELECT content FROM outlines WHERE id=?').get('chapter0') as any).content).toBe(original.replace('第三章回收', '第五章回收'));
  });
});
