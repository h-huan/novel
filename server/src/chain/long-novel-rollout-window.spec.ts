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
      })) },
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

  it('persists each verified batch atomically', async () => {
    const {controller} = fixture(15);
    await controller.rolloutDetailedOutlines('project');
    const sql=controller.db.getDb().exec.mock.calls.map((call:any[])=>call[0]);
    expect(sql.filter((s:string)=>s==='BEGIN IMMEDIATE')).toHaveLength(4);
    expect(sql.filter((s:string)=>s==='COMMIT')).toHaveLength(4);
    expect(sql).not.toContain('ROLLBACK');
  });

});
