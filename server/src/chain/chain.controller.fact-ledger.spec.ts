import { standardDirectiveCache } from '../modules/module-standards/standard-directive.cache';
import { describe, expect, it, vi } from 'vitest';
import { ChainController } from './chain.controller';
import { normalizeOutlineFactReview } from './outline-fact-ledger';

const controllerFixture = () => {
  const controller = Object.create(ChainController.prototype) as any;
  controller.logger = { error: vi.fn(), warn: vi.fn() };
  controller.generationMetrics = { beginRun: vi.fn(() => ({ id: 'failed-gate-run' })), finishRun: vi.fn() };
  controller.llmCallWithRetry = vi.fn();
  return controller;
};
const previousLedger = () => normalizeOutlineFactReview({ consistent: true, contradictions: [], ledger: [
  { current: '人物关系起始值：她与前夫已离婚' },
  { current: '人物知识边界（第1章结束时）：她未知过户复印件' },
] })!.ledger;
const conflict = {
  location1: '世界观.rules[0]', quote1: '时间倒退一小时',
  location2: '章纲.scenes[0]', quote2: '时间快一小时', conflict: '同一触发方向相反',
};

describe('outline fact review pipeline', () => {
  it('passes the complete persisted world, including constraints and social rules, to framework audits', async () => {
    const controller=controllerFixture(),world={era:'现代',rules:'许可仅对持有人生效',constraints:'许可不保证设备持续打开',social_rules:'他人必须各自取得许可',rule_system_json:'{"revoke":"过期失效"}'},outlines=[{order:1,content:'持有人刷卡进入'}];
    const prepare=vi.fn((sql:string)=>sql.includes('world_settings')?{get:()=>world}:{all:()=>outlines});
    controller.db={getDb:()=>({prepare})};controller.assertOutlineCandidateFacts=vi.fn().mockResolvedValue(undefined);
    await controller.assertOutlineFactLedger('p','故事目标','执行标准');
    expect(controller.assertOutlineCandidateFacts).toHaveBeenCalledWith('p','故事目标','执行标准',world,outlines);
    expect(prepare.mock.calls.some(([sql])=>sql.includes('SELECT * FROM world_settings'))).toBe(true);
  });
  it('keeps wrong-chapter quotations in review correction and never calls candidate repair', async () => {
    const controller = controllerFixture();
    const candidates = [{ order: 2, content: '本章没有请求' }, { order: 3, content: '当日请求被拒', scenes: JSON.stringify({ stateAfter: '上门请求被拒' }) }];
    const data = { consistent: false, contradictions: [{ location1: '第3章.stateAfter', quote1: '上门请求被拒',
      location2: '第4章.content', quote2: '当日请求被拒', conflict: '误报为跨章冲突' }], ledger: [] };
    controller.llmCallWithRetry.mockImplementation(async (_label: string, _prompt: string, options: any) => {
      expect(options.validate(data)).toBe(false);
      expect(options.describeValidation(data).join('；')).toContain('不在声明的第3章');
      return { data, warnings: [] };
    });
    const repair = vi.fn();
    await expect(controller.assertOutlineCandidateFacts('p', '{}', '', {}, candidates, repair)).rejects.toThrow('审查输出不合规');
    expect(repair).not.toHaveBeenCalled();
    expect(JSON.parse(controller.generationMetrics.finishRun.mock.calls[0][3]).kind).toBe('review_contract_invalid');
  });
  it('collects conflicts across all batches before one repair round, without inheriting rejected updates', async () => {
    const controller = controllerFixture();
    const candidates = Array.from({ length: 5 }, (_, order) => ({ order, content: '未确认状态' }));
    const bad = { consistent: false, contradictions: ['真实冲突'], ledger: [{ id: 'fact_1', current: '被否决状态' }] };
    controller.reviewOutlineFacts = vi.fn().mockResolvedValueOnce(bad).mockResolvedValueOnce(bad)
      .mockResolvedValueOnce({ consistent: true, contradictions: [], ledger: [] })
      .mockResolvedValueOnce({ consistent: true, contradictions: [], ledger: [] });
    const repair = vi.fn(async (batch: any[]) => {
      if (repair.mock.calls.length === 1) expect(controller.reviewOutlineFacts).toHaveBeenCalledTimes(2);
      for (const item of batch) item.content = '已修复状态';
    });
    await controller.assertOutlineCandidateFacts('p', '{}', '', {}, candidates, repair);
    expect(repair.mock.calls.map((c: any[]) => c[0].map((v: any) => v.order))).toEqual([[0, 1, 2, 3], [4]]);
    expect(controller.reviewOutlineFacts.mock.calls[1][4]).toEqual([]);
    expect(controller.reviewOutlineFacts.mock.calls[2][4]).toEqual([]);
    expect(controller.reviewOutlineFacts).toHaveBeenCalledTimes(4);
  });
  it('restarts the complete audit from the baseline after one late candidate repair', async () => {
    const controller = controllerFixture();
    const candidates = Array.from({ length: 5 }, (_, order) => ({ order, content: order === 4 ? '错误状态' : '初始状态' }));
    const review = { consistent: false, contradictions: ['真实矛盾'], ledger: [] };
    controller.reviewOutlineFacts = vi.fn()
      .mockResolvedValueOnce({ consistent: true, contradictions: [], ledger: [{ id: 'fact_1', current: '旧台账' }] })
      .mockResolvedValueOnce(review)
      .mockResolvedValueOnce({ consistent: true, contradictions: [], ledger: [] })
      .mockResolvedValueOnce({ consistent: true, contradictions: [], ledger: [] });
    const repair = vi.fn(async (batch: any[]) => { batch[0].content = '修复状态'; });
    await controller.assertOutlineCandidateFacts('p', '{}', '', {}, candidates, repair);
    expect(repair).toHaveBeenCalledTimes(1);
    expect(controller.reviewOutlineFacts).toHaveBeenCalledTimes(4);
    const calls = controller.reviewOutlineFacts.mock.calls;
    expect(calls.map((c: any[]) => c[5].map((v: any) => v.order))).toEqual([[0, 1, 2, 3], [4], [0, 1, 2, 3], [4]]);
    expect(calls[2][4]).toEqual([]);
    expect(calls[3][5][0].content).toBe('修复状态');
  });

  it('still blocks a remaining conflict after the single repair attempt', async () => {
    const controller = controllerFixture();
    controller.reviewOutlineFacts = vi.fn().mockResolvedValue({ consistent: false, contradictions: ['真实矛盾'], ledger: [] });
    const repair = vi.fn(async () => {});
    await expect(controller.assertOutlineCandidateFacts('p', '{}', '', {}, [{ order: 0, content: '候选' }], repair))
      .rejects.toThrow('已举证的事实矛盾');
    expect(repair).toHaveBeenCalledTimes(1);
    expect(controller.reviewOutlineFacts).toHaveBeenCalledTimes(2);
  });

  it('audits all merged candidate fields without opening a database write path', async () => {
    const controller = controllerFixture();
    const first = '第一次使用已产生损失';
    const last = '只累计后面三次';
    controller.llmCallWithRetry.mockImplementation(async (_label: string, prompt: string, options: any) => {
      expect(prompt).toContain(first);
      expect(prompt).toContain(last);
      standardDirectiveCache.rebuild();
      expect(prompt + standardDirectiveCache.get(options.scenario)).toContain('累计状态必须从第一次实际触发');
      const data = { consistent: false, contradictions: [{ location1: '第一章.content', quote1: first,
        location2: '第四章.scenes', quote2: last, conflict: '首次使用代价未计入总量' }], ledger: [] };
      expect(options.validate(data)).toBe(true);
      return { data, warnings: [] };
    });
    // No db exists on this fixture: candidate reconciliation cannot insert outlines.
    await expect(controller.assertOutlineCandidateFacts('p', '{}', '', {}, [
      { order: 0, content: first }, { order: 1, content: '第二次使用' },
      { order: 2, content: '第三次使用' }, { order: 3, scenes: last },
    ])).rejects.toThrow('已举证的事实矛盾');
    expect(JSON.parse(controller.generationMetrics.finishRun.mock.calls[0][3]).kind).toBe('fact_conflict');
  });

  it('keeps invented conflict quotations in review correction, not in the content repair path', async () => {
    const controller = controllerFixture();
    const data = { consistent: false, contradictions: [conflict], ledger: [] };
    controller.llmCallWithRetry.mockImplementation(async (_label: string, _prompt: string, options: any) => {
      expect(options.validate(data)).toBe(false);
      expect(options.describeValidation(data).join('；')).toContain('不能逐字定位');
      expect(options.retryInstruction).toContain('不得改写输入章纲');
      return { data, warnings: [] };
    });
    await expect(controller.reviewOutlineFacts('p', '候选审查', '{}', {}, [], [{ content: '正常事件' }], ''))
      .rejects.toThrow('审查输出不合规');
    expect(JSON.parse(controller.generationMetrics.finishRun.mock.calls[0][3]).kind).toBe('review_contract_invalid');
  });
  it.each([
    ['都市', '住所七号楼906室', '住所八号楼307室'],
    ['科幻', '封存两支血清', '封存五支血清'],
    ['古代', '主角居住西宫', '主角一直居住东宫'],
  ])('keeps original evidence across batches when the ledger is empty: %s', async (_genre, before, after) => {
    const controller = controllerFixture();
    const outlines = Array.from({ length: 5 }, (_, order) => ({ order, content: order === 0 ? before : order === 4 ? after : '经过' }));
    controller.db = { getDb: () => ({ prepare: (sql: string) => sql.includes('world_settings')
      ? { get: () => ({ rules: '故事世界规则' }) } : { all: () => outlines } }) };
    controller.llmCallWithRetry.mockResolvedValueOnce({ data: { consistent: true, contradictions: [], ledger: [] }, warnings: [] })
      .mockImplementationOnce(async (_label: string, prompt: string) => {
        const rawSources = prompt.split('【已确认前章原始资料】')[1].split('【前批事实台账】')[0].trim();
        const sources = JSON.parse(rawSources);
        expect(sources).toHaveLength(4);
        expect(sources[0]).toEqual({ chapterNumber: 1, content: before });
        expect(prompt).toContain(after);
        return { data: { consistent: false, contradictions: [{ location1: '前章原始资料[0].content', quote1: before,
          location2: '本批完整章纲[0].content', quote2: after, conflict: '同一事实互斥且无变更事件' }], ledger: [] }, warnings: [] };
      });
    await expect(controller.assertOutlineFactLedger('any-project', '{}', '公共执行标准')).rejects.toThrow('已举证的事实矛盾');
    const evidence = JSON.parse(controller.generationMetrics.finishRun.mock.calls[0][3]);
    expect(evidence.kind).toBe('fact_conflict');
    expect(evidence.evidence.sourceChapters).toEqual(outlines.slice(0, 4));
  });
  it('reviews chapter progression with stable identities without calling outline repair', async () => {
    const controller = controllerFixture();
    const previous = previousLedger();
    controller.llmCallWithRetry.mockImplementation(async (_label: string, prompt: string, options: any) => {
      expect(options.scenario).toBe('review');
      expect(prompt).toContain(previous[1].id);
      expect(prompt).toContain('未知过户复印件');
      const data = { consistent: true, contradictions: [], ledger: [
        { id: previous[1].id, current: '人物知识边界（第2章结束时）：她看见发票，仍未知过户复印件' },
      ] };
      expect(options.validate(data)).toBe(true);
      return { data, warnings: [] };
    });
    const review = await controller.reviewOutlineFacts('project', '第2章', '{}', {}, previous,
      [{ order: 1, content: '她看见发票' }], '标准', 2);
    expect(review.consistent).toBe(true);
    expect(review.ledger[0]).toEqual(previous[0]);
    expect(review.ledger[1].baseline).toBe(previous[1].baseline);
    expect(review.ledger[1].history).toEqual([previous[1].current]);
    expect(controller.llmCallWithRetry).toHaveBeenCalledTimes(1);
    expect(controller.generationMetrics.finishRun).not.toHaveBeenCalled();
  });

  it.each([
    { consistent: true, contradictions: [], ledger: [{ id: 'invented', current: '任意状态' }] },
    { consistent: false, contradictions: [], ledger: [] },
    { consistent: false, contradictions: ['未回收伏笔'], ledger: [] },
    { consistent: true, contradictions: [], ledger: ['旧式标题：未变化'] },
  ])('blocks malformed reviews and records the contract failure without editing outlines', async data => {
    const controller = controllerFixture();
    controller.llmCallWithRetry.mockResolvedValue({ data, warnings: [] });
    await expect(controller.reviewOutlineFacts('project', '第2章', '{}', {}, previousLedger(), [], '标准', 2))
      .rejects.toThrow('审查输出不合规');
    expect(controller.llmCallWithRetry).toHaveBeenCalledTimes(1);
    expect(controller.generationMetrics.beginRun).toHaveBeenCalledWith('project', 'review', expect.any(String), undefined, 'outline_fact_ledger', 2, false);
    const record = controller.generationMetrics.finishRun.mock.calls[0];
    expect(record[1]).toBe('failed');
    expect(JSON.parse(record[3]).kind).toBe('review_contract_invalid');
  });

  it('records incomplete reviews separately from content contradictions', async () => {
    const controller = controllerFixture();
    controller.llmCallWithRetry.mockRejectedValue(new Error('Connection error'));
    await expect(controller.reviewOutlineFacts('project', '第2章', '{}', {}, previousLedger(), [], '标准', 2))
      .rejects.toThrow('未完成');
    expect(JSON.parse(controller.generationMetrics.finishRun.mock.calls[0][3]).kind).toBe('review_unavailable');
  });

  it('inherits history across activation batches with no changes', async () => {
    const controller = controllerFixture();
    const outlines = Array.from({ length: 5 }, (_, order) => ({ order, title: '章' + (order + 1), content: '事件' }));
    controller.db = { getDb: () => ({ prepare: (sql: string) => sql.includes('world_settings')
      ? { get: () => ({ rules: '已保存规则' }) } : { all: () => outlines } }) };
    controller.llmCallWithRetry
      .mockResolvedValueOnce({ data: { consistent: true, contradictions: [], ledger: [{ current: '门后时间：倒退一小时' }] }, warnings: [] })
      .mockImplementationOnce(async (_label: string, prompt: string, options: any) => {
        expect(prompt).toContain('fact_1');
        expect(prompt).toContain('倒退一小时');
        expect(prompt).toContain('"chapterNumber":5');
        const data = { consistent: true, contradictions: [], ledger: [] };
        expect(options.validate(data)).toBe(true);
        return { data, warnings: [] };
      });
    await expect(controller.assertOutlineFactLedger('project', '{}', '标准')).resolves.toBeUndefined();
    expect(controller.llmCallWithRetry).toHaveBeenCalledTimes(2);
    expect(controller.generationMetrics.finishRun).not.toHaveBeenCalled();
  });

  it('blocks actual activation contradictions and persists both quoted evidence and failure category', async () => {
    const controller = controllerFixture();
    controller.db = { getDb: () => ({ prepare: (sql: string) => sql.includes('world_settings')
      ? { get: () => ({ rules: '时间倒退一小时' }) } : { all: () => [{ order: 0, content: '时间快一小时' }] } }) };
    controller.llmCallWithRetry.mockResolvedValue({ data: { consistent: false, contradictions: [conflict], ledger: [] }, warnings: [] });
    await expect(controller.assertOutlineFactLedger('project', '{}', '标准')).rejects.toThrow('已举证的事实矛盾');
    const record = JSON.parse(controller.generationMetrics.finishRun.mock.calls[0][3]);
    expect(record.kind).toBe('fact_conflict');
    expect(record.evidence.review.contradictions[0]).toContain('时间快一小时');
  });
});


it('uses the existing focused fact scope and source anchors while keeping an evidenced conflict',async()=>{
 const controller=controllerFixture();
 const prior=[{order:0,content:'第一次触发已经消耗一枚令牌。'}],chapters=[{order:1,content:'再次触发后只消耗过一枚令牌。'}];
 controller.llmCallWithRetry.mockImplementation(async (_label:string,prompt:string,options:any)=>{
  expect(options.stepKey).toBe('creation_outline_fact_dependencies');
  const directory=JSON.parse(prompt.split('【原始资料编号目录（原文只出现于上述输入，按路径选取，不手抄）】')[1].split('\n只输出合法JSON')[0]);
  const one=directory.find((r:any)=>r.path==='前章·第1章.content'),two=directory.find((r:any)=>r.path==='本批·第2章.content');
  const data={consistent:false,contradictions:[{anchor1:one.id,anchor2:two.id,conflict:'累计扣除次数与每次触发需要消耗一枚的规则不符',calculation:'1+1=2'}],ledger:[]};
  expect(options.validate(data)).toBe(true);
  return {data,warnings:[]};
 });
 const review=await controller.reviewOutlineFacts('p','第二章','既定故事',{rules:'每次触发消耗一枚令牌。'},[],chapters,'标准',2,prior);
 expect(review.consistent).toBe(false);expect(JSON.parse(review.contradictions[0]).quote2).toBe(chapters[0].content);
 expect(controller.llmCallWithRetry).toHaveBeenCalledTimes(1);
});
