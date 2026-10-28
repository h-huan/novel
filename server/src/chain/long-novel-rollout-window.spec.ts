import { describe, expect, it, vi } from 'vitest';
import { ChainController } from './chain.controller';

function fixture(writtenMax: number, existingAuthoredChapter = false) {
  const controller = Object.create(ChainController.prototype) as any;
  const inserts: string[] = [];
  const detailRows = Array.from({ length: 20 }, (_, order) => ({ order }));
  const volumeRows = [{
    id: 'volume-1', title: '起势卷', content: '主线逐步推进', order: 0,
    volumes: JSON.stringify({ estimatedChapters: 60, theme: '追查', goal: '识别真相' }),
  }];
  const db = {
    exec: vi.fn(),
    prepare: (sql: string) => ({
      get: () => sql.includes('FROM projects')
        ? { title: '长篇测试', type: 'long_novel', target_words: 240000, target_platform: 'fanqie', settings: '{}' }
        : sql.includes('COALESCE(MAX(chapter_index),0)')
          ? { m: writtenMax }
          : sql.includes('FROM world_settings')
            ? { rules: '夜间仅持证者可入内', story_premise: '调查一座旧城' }
          : sql.includes('FROM chapters') && sql.includes('chapter_index=?')
            ? existingAuthoredChapter ? { id:'authored', content:'作者已经写过正文',word_count:9,status:'draft' } : undefined
            : sql.includes('FROM outlines') && sql.includes('"order"=?')
              ? sql.includes('SELECT id FROM outlines')
                ? undefined
                : { title:'前一章', content:'已经完成上一章的调查', scenes:'{}', chapter_function:'conflict' }
              : undefined,
      all: () => sql.includes("level='volume'") ? volumeRows
        : sql.includes("level='chapter'") ? detailRows
          : [],
      run: () => { inserts.push(sql); return {}; },
    }),
  };
  controller.db = { getDb: () => db };
  controller.logger = { log: vi.fn() };
  controller.resolvePlatformToneDirective = () => '项目已确认创作标准';
  controller.buildWorldWritingContext = () => '世界规则：夜间仅持证者可入内';
  controller.generatedCanonGuard = { assertStructuredCanCommit: vi.fn() };
  controller.reviewOutlineFacts = vi.fn(async () => ({ consistent: true, contradictions: [], ledger: [] }));
  controller.llmCallWithRetry = vi.fn(async (_step: string, prompt: string) => {
    const match = /本批范围：本卷第\d+-\d+章，即全书第(\d+)-(\d+)章，共(\d+)章/.exec(prompt);
    if (!match) throw Error('没有按卷传入合法滚动批次');
    const start = Number(match[1]);
    const count = Number(match[3]);
    return {
      data: { chapters: Array.from({ length: count }, (_, i) => ({
        title: `第${start+i}章`, content: '真实事件链：主角发现线索并决策',
        conflict: '调查遭遇拒绝', hook: '门外有人敲门',
        scenes: ['值班室'], targetWords: 4000,
        wordCountReason: '调查与选择需要两个有效场景', chapterFunction: 'conflict',
      })), newEntities: [] },
      runId: 'reviewed-outline-run',
    };
  });
  return { controller, inserts };
}

describe('ARCH-004 progressive outline window', () => {
  it.each([0, 1, 6, 14])('does not pay for new outlines when 20 exist and only %i chapters are written', async writtenMax => {
    const { controller, inserts } = fixture(writtenMax);
    const result = await controller.rolloutDetailedOutlines('project');
    expect(result.added).toBe(0);
    expect(result.detailedTotal).toBe(20);
    expect(controller.llmCallWithRetry).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
  });

  it('refills in bounded batches only after written progress reaches the existing trigger', async () => {
    const { controller, inserts } = fixture(15);
    const result = await controller.rolloutDetailedOutlines('project');
    expect(result).toMatchObject({ added: 15, target: 35, totalEstimated: 60 });
    expect(controller.llmCallWithRetry).toHaveBeenCalledTimes(4);
    const prompts=controller.llmCallWithRetry.mock.calls.map((call:any[])=>call[1]);
    expect(prompts.every((prompt:string)=>prompt.includes('世界规则：夜间仅持证者可入内'))).toBe(true);
    expect(prompts.every((prompt:string)=>prompt.includes('已经完成上一章的调查'))).toBe(true);
    expect(prompts.every((prompt:string)=>prompt.includes('项目已确认创作标准'))).toBe(true);
    expect(controller.generatedCanonGuard.assertStructuredCanCommit).toHaveBeenCalledTimes(4);
    expect(controller.reviewOutlineFacts).toHaveBeenCalledTimes(4);
    expect(controller.reviewOutlineFacts.mock.calls[0][9]).toBe('rollout_outline_fact_dependencies');
    const bookAndVolume = JSON.parse(controller.reviewOutlineFacts.mock.calls[0][2]);
    expect(bookAndVolume).toMatchObject({ title:'长篇测试', volumePlan:{id:'volume-1',title:'起势卷',theme:'追查',goal:'识别真相',content:'主线逐步推进'} });

    expect(inserts.filter(sql => sql.includes('INSERT INTO outlines'))).toHaveLength(15);
    expect(inserts.filter(sql => sql.includes('INSERT INTO chapters'))).toHaveLength(15);
    expect(inserts.filter(sql => sql.includes('UPDATE chapters'))).toHaveLength(0);
  });

  it('rejects an independently proven fact contradiction before writing the changed batch', async () => {
    const { controller, inserts } = fixture(15);
    controller.reviewOutlineFacts.mockResolvedValueOnce({
      consistent: false, contradictions: ['已举证事实冲突'], ledger: [],
    });
    controller.outlineFactGateError = (_projectId:string,message:string) => new Error(message);
    await expect(controller.rolloutDetailedOutlines('project')).rejects.toThrow('已举证事实矛盾');
    expect(controller.llmCallWithRetry).toHaveBeenCalledTimes(1);
    expect(controller.reviewOutlineFacts).toHaveBeenCalledTimes(1);
    expect(inserts).toHaveLength(0);
  });

  it('rejects an authored future chapter before buying another outline model call', async () => {
    const { controller, inserts } = fixture(15, true);
    await expect(controller.rolloutDetailedOutlines('project')).rejects.toThrow('已有正文或非草稿状态');
    expect(controller.llmCallWithRetry).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
  });
  it('serializes simultaneous refill requests for one project and avoids the second paid generation', async () => {
    const {controller} = fixture(15);
    // The fake DB must reflect the committed outline window on the second read.
    const db = controller.db.getDb();
    const originalPrepare = db.prepare;
    let updated = false;
    db.prepare = (sql:string) => {
      const statement = originalPrepare(sql);
      if (sql.includes("level='chapter'") && sql.includes('SELECT "order"')) {
        return {...statement, all:()=>Array.from({length:updated?35:20},(_,order)=>({order}))};
      }
      return statement;
    };
    const originalExecute = controller.rolloutDetailedOutlinesOnce.bind(controller);
    controller.rolloutDetailedOutlinesOnce = async (...args:any[])=>{
      const result=await originalExecute(...args);
      updated=true;
      return result;
    };
    const results = await Promise.all([
      controller.rolloutDetailedOutlines('project'),
      controller.rolloutDetailedOutlines('project'),
    ]);
    expect(results.map((r:any)=>r.added)).toEqual([15,0]);
    expect(controller.llmCallWithRetry).toHaveBeenCalledTimes(4);
  });

  it.each([1, 3, 5, 10])('manual list refill adds exactly %i chapters using the unchanged independent gates', async appendCount => {
    const {controller,inserts}=fixture(0);
    const result=await controller.rolloutOutline({projectId:'project',appendCount});
    expect(result).toMatchObject({success:true,added:appendCount,target:20+appendCount,detailedTotal:20+appendCount});
    expect(controller.llmCallWithRetry).toHaveBeenCalledTimes(Math.ceil(appendCount/4));
    expect(controller.reviewOutlineFacts).toHaveBeenCalledTimes(Math.ceil(appendCount/4));
    expect(controller.generatedCanonGuard.assertStructuredCanCommit).toHaveBeenCalledTimes(Math.ceil(appendCount/4));
    expect(inserts.filter(sql=>sql.includes('INSERT INTO outlines'))).toHaveLength(appendCount);
    expect(inserts.filter(sql=>sql.includes('INSERT INTO chapters'))).toHaveLength(appendCount);
    expect(inserts.filter(sql=>sql.includes('UPDATE chapters'))).toHaveLength(0);
  });

  it('rejects invalid manual counts and conflicting automatic parameters before spending on a model', async()=>{
    const {controller}=fixture(0);
    await expect(controller.rolloutOutline({projectId:'project',appendCount:2})).rejects.toThrow('仅可选择');
    await expect(controller.rolloutOutline({projectId:'project',appendCount:3,lookahead:20})).rejects.toThrow('不能同时');
    expect(controller.llmCallWithRetry).not.toHaveBeenCalled();
  });

  it('keeps automatic refill dormant but lets an explicit user request add chapters', async()=>{
    const {controller}=fixture(0);
    expect((await controller.rolloutDetailedOutlines('project')).added).toBe(0);
    expect((await controller.rolloutDetailedOutlines('project',{appendCount:3})).added).toBe(3);
    expect(controller.llmCallWithRetry).toHaveBeenCalledOnce();
  });

  it('does not overrun volume plan or silently fill a hole in the saved chapter tree', async()=>{
    const f=fixture(0);
    const db=f.controller.db.getDb();
    const orig=db.prepare;
    db.prepare=(sql:string)=>{
      const stmt=orig(sql);
      if(sql.includes("level='volume'"))return {...stmt,all:()=>[{id:'volume-1',title:'短卷',order:0,content:'主线',volumes:JSON.stringify({estimatedChapters:21})}]};
      return stmt;
    };
    await expect(f.controller.rolloutDetailedOutlines('project',{appendCount:3})).rejects.toThrow('仅剩1章');
    expect(f.controller.llmCallWithRetry).not.toHaveBeenCalled();

    db.prepare=(sql:string)=>{
      const stmt=orig(sql);
      if(sql.includes('SELECT "order"')&&sql.includes("level='chapter'")) return {...stmt,all:()=>[...Array.from({length:20},(_,order)=>({order})),{order:22}]};
      return stmt;
    };
    await expect(f.controller.rolloutDetailedOutlines('project',{appendCount:1})).rejects.toThrow('细纲不连续');
    expect(f.controller.llmCallWithRetry).not.toHaveBeenCalled();
  });

  it('persists each verified batch atomically', async () => {
    const {controller} = fixture(15);
    await controller.rolloutDetailedOutlines('project');
    const sql=controller.db.getDb().exec.mock.calls.map((call:any[])=>call[0]);
    expect(sql.filter((s:string)=>s==='BEGIN IMMEDIATE')).toHaveLength(4);
    expect(sql.filter((s:string)=>s==='COMMIT')).toHaveLength(4);
    expect(sql).not.toContain('ROLLBACK');
  });

  it('rejects a missing new-entity manifest before paying for the independent fact reviewer',async()=>{
    const {controller,inserts}=fixture(15);
    const generator=controller.llmCallWithRetry.getMockImplementation();
    controller.llmCallWithRetry.mockImplementationOnce(async(...args:any[])=>{
      const response=await generator(...args);
      delete response.data.newEntities;
      return response;
    });
    await expect(controller.rolloutDetailedOutlines('project')).rejects.toThrow('newEntities');
    expect(controller.reviewOutlineFacts).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
  });

  it('saves a cited new character only as a pending state item inside the audited outline transaction',async()=>{
    const {controller}=fixture(15);
    const savedOutlines=new Map<number,string>();
    const savedChapters=new Map<number,string>();
    const db=controller.db.getDb();
    const priorPrepare=db.prepare;
    db.prepare=(sql:string)=>{
      const st=priorPrepare(sql);
      if(sql.includes('INSERT INTO outlines'))return {...st,run:(id:string,_p:string,_level:string,_parent:string,order:number,...rest:any[])=>{
        savedOutlines.set(order,id);return st.run(id,_p,_level,_parent,order,...rest);
      }};
      if(sql.includes('INSERT INTO chapters'))return {...st,run:(id:string,_p:string,_outline:string,volumeNo:number,chapterNo:number,...rest:any[])=>{
        savedChapters.set(chapterNo,id);return st.run(id,_p,_outline,volumeNo,chapterNo,...rest);
      }};
      if(sql.includes('SELECT id FROM outlines WHERE project_id=?'))return {...st,get:(_p:string,order:number)=>savedOutlines.has(order)?{id:savedOutlines.get(order)}:undefined};
      if(sql.includes('SELECT id FROM chapters WHERE project_id=? AND chapter_index=?'))return {...st,get:(_p:string,chapterNo:number)=>savedChapters.has(chapterNo)?{id:savedChapters.get(chapterNo)}:undefined};
      return st;
    };
    controller.stateItemService={create:vi.fn(()=>({id:'proposal'}))};
    controller.llmCallWithRetry.mockResolvedValueOnce({runId:'run-21',data:{
      chapters:[{title:'旧城入口',content:'新人物沈诺在西坡站等待交接。',conflict:'接头迟到',hook:'门外脚步突然停下',
        scenes:['西坡站入口'],targetWords:4000,wordCountReason:'接头需要时间与反应',chapterFunction:'conflict'}],
      newEntities:[{type:'character',name:'沈诺',evidenceQuote:'新人物沈诺在西坡站等待交接',chapterNumber:21}],
    }});
    const result=await controller.rolloutDetailedOutlines('project',{lookahead:6});
    expect(result.added).toBe(1);
    expect(controller.reviewOutlineFacts).toHaveBeenCalledTimes(1);
    expect(controller.stateItemService.create).toHaveBeenCalledWith('project',expect.objectContaining({
      sourceType:'rollout_outline',targetType:'character',targetLabel:'沈诺',
      status:'pending',authority:'soft_candidate',sourceId:expect.any(String),
      sourceChapterId:expect.any(String),
      payload:{intent:'entity_create',entityProposal:expect.objectContaining({name:'沈诺',chapterNumber:21})},
    }));
    expect(db.exec.mock.calls.map((x:any[])=>x[0])).toEqual(['BEGIN IMMEDIATE','COMMIT']);
  });

  it('rolls back a batch when staging its independently reviewed entity fails',async()=>{
    const {controller}=fixture(15);
    const db=controller.db.getDb();
    const oldPrepare=db.prepare;
    const written=new Map<number,string>();
    const writtenChapters=new Map<number,string>();
    db.prepare=(sql:string)=>{
      const st=oldPrepare(sql);
      if(sql.includes('INSERT INTO outlines'))return {...st,run:(id:string,_p:string,_level:string,_parent:string,order:number,...rest:any[])=>{
        written.set(order,id);return st.run(id,_p,_level,_parent,order,...rest);
      }};
      if(sql.includes('INSERT INTO chapters'))return {...st,run:(id:string,_p:string,_outline:string,volumeNo:number,chapterNo:number,...rest:any[])=>{
        writtenChapters.set(chapterNo,id);return st.run(id,_p,_outline,volumeNo,chapterNo,...rest);
      }};
      if(sql.includes('SELECT id FROM outlines WHERE project_id=?'))return {...st,get:(_p:string,order:number)=>written.has(order)?{id:written.get(order)}:undefined};
      if(sql.includes('SELECT id FROM chapters WHERE project_id=? AND chapter_index=?'))return {...st,get:(_p:string,chapterNo:number)=>writtenChapters.has(chapterNo)?{id:writtenChapters.get(chapterNo)}:undefined};
      return st;
    };
    controller.stateItemService={create:vi.fn(()=>{throw Error('保存候选状态中断')})};
    controller.llmCallWithRetry.mockResolvedValueOnce({runId:'run-21',data:{
      chapters:[{title:'旧城入口',content:'新人物沈诺在西坡站等待交接。',conflict:'接头迟到',hook:'门外脚步突然停下',
        scenes:['西坡站入口'],targetWords:4000,wordCountReason:'接头需要时间与反应',chapterFunction:'conflict'}],
      newEntities:[{type:'character',name:'沈诺',evidenceQuote:'新人物沈诺在西坡站等待交接',chapterNumber:21}],
    }});
    await expect(controller.rolloutDetailedOutlines('project',{lookahead:6})).rejects.toThrow('保存候选状态中断');
    expect(db.exec.mock.calls.map((x:any[])=>x[0])).toEqual(['BEGIN IMMEDIATE','ROLLBACK']);
  });

  it('does not create a second pending dossier for the same named entity in a later rolling batch',async()=>{
    const {controller}=fixture(15);
    const db=controller.db.getDb();
    const original=db.prepare;
    db.prepare=(sql:string)=>{
      const statement=original(sql);
      if(sql.includes('FROM state_items')&&sql.includes("source_type='rollout_outline'"))
        return {...statement,get:()=>({id:'earlier-pending-dossier'})};
      return statement;
    };
    controller.stateItemService={create:vi.fn()};
    controller.llmCallWithRetry.mockResolvedValueOnce({runId:'run-21',data:{
      chapters:[{title:'旧城入口',content:'新人物沈诺在西坡站等待交接。',conflict:'接头迟到',hook:'脚步突然停下',
        scenes:['西坡站入口'],targetWords:4000,wordCountReason:'现场需要两轮对话与反应',chapterFunction:'conflict'}],
      newEntities:[{type:'character',name:'沈诺',evidenceQuote:'新人物沈诺在西坡站等待交接',chapterNumber:21}],
    }});
    const result=await controller.rolloutDetailedOutlines('project',{lookahead:6});
    expect(result.added).toBe(1);
    expect(controller.reviewOutlineFacts).toHaveBeenCalledTimes(1);
    expect(controller.stateItemService.create).not.toHaveBeenCalled();
  });


  it('retains multiple live threads including reminded and legacy-pending threads across the same refill',async()=>{
    const {controller}=fixture(15);
    const db=controller.db.getDb();
    const original=db.prepare;
    let query='';
    const debts=[
      {id:'short',content:'小伏笔',status:'active',scope:'volume',recovery_window_end:24},
      {id:'book',content:'全书暗线',status:'reminder',scope:'global',recovery_window_end:60},
      {id:'medium',content:'中线',status:'pending',scope:'volume',recovery_window_end:36},
    ];
    db.prepare=(sql:string)=>{
      if(sql.includes('FROM foreshadowings')) {
        query=sql;
        return {all:()=>debts};
      }
      return original(sql);
    };
    await controller.rolloutDetailedOutlines('project');
    const prompt=controller.llmCallWithRetry.mock.calls[0][1] as string;
    expect(query).toContain("'active','reminder','pending'");
    for(const debt of debts) {
      expect(prompt).toContain(debt.id);
      expect(prompt).toContain(debt.content);
      expect(prompt).toContain(debt.scope);
    }
    expect(prompt).toContain('同一章交织多条');
    expect(controller.reviewOutlineFacts).toHaveBeenCalledTimes(4);
  });

});
