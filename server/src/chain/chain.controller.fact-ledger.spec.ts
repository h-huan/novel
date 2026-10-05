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
