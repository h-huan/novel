import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as config from '../config/generation-budgets';
import { isReviewOutputCapacityError, splitReviewMaterial } from './review-grouping';
import { ChainController } from './chain.controller';
import { SELECTED_PREMISE_FIELDS, normalizePremiseSelectionPayload } from './idea-discovery-contract';
import { premiseSourceComparisonCatalog, materializePremiseSourceReview } from './premise-selection-review';
import { premisePayoffCatalog } from './premise-payoff-review';
import { premiseCausalCatalog } from './premise-causal-plan';

beforeEach(() => vi.spyOn(config, 'readGenerationBudgets').mockReturnValue({ ...config.GENERATION_BUDGET_DEFAULTS, reviewGroupingMode: 0 }));
afterEach(() => vi.restoreAllMocks());
const capacity = new Error('结构化生成因输出长度被截断（当前额度 131072，本次未取得完整JSON）');
const cards = () => Array.from({ length: 5 }, (_, index) => ({ title: '完整卡' + index,
  description: index === 0 ? '甲'.repeat(12000) : '完整事件与后果', sourcePremiseId: 'P' + index }));

function presentationFixture(error?: Error, budget = { remaining: 6 }) {
  const c = Object.create(ChainController.prototype) as any;
  c.logger = { warn: vi.fn() };
  const original = c.reviewIdeaPresentation, leaves: any[] = [];
  c.reviewIdeaPresentation = vi.fn(async (items: any[], refs: any[], note: string, allowance: any, aggregateAttempt = false, preferBoundedBatches = false) => {
    if (!aggregateAttempt) return original.call(c, items, refs, note, allowance, aggregateAttempt, preferBoundedBatches);
    allowance.remaining--; leaves.push({ items, refs });
    if (error && items.length === 5) throw error;
    return items.map((item, index) => ({ position: index + 1, title: item.title, platformFit: false,
      issues: ['分类核心冲突不匹配，保持拒绝结论'], readerGoals: { click: { evidenceRef: 'C' + (index + 1) + '.hook' } } }));
  });
  return { c, leaves, budget };
}

describe('aggregate review before capacity partitioning', () => {
  it('partitions four real cards before a large combined presentation review, with each peer still available as a reference', async () => {
    const { c, leaves, budget } = presentationFixture(undefined, { remaining: 4 });
    const items=cards().slice(0,4);
    const before=JSON.stringify(items);
    const result=await c.reviewIdeaPresentation(items, [], '', budget, false, true);
    expect(leaves.map(row=>row.items.length)).toEqual([2,2]);
    expect(result.map((row:any)=>row.position)).toEqual([1,2,3,4]);
    expect(result.every((row:any)=>row.platformFit===false)).toBe(true);
    for(const row of leaves)expect([...row.items,...row.refs].map((x:any)=>x.title).sort())
      .toEqual(items.map(item=>item.title).sort());
    expect(budget.remaining).toBe(2);
    expect(JSON.stringify(items)).toBe(before);
  });
  it('audits five cards together despite old two-card setting, preserving genuine rejections', async () => {
    const { c, leaves, budget } = presentationFixture();
    const result = await c.reviewIdeaPresentation(cards(), [], '', budget);
    expect(leaves.map(row => row.items.length)).toEqual([5]); expect(budget.remaining).toBe(5);
    expect(result).toHaveLength(5); expect(result.every((row: any) => row.platformFit === false)).toBe(true);
  });
  it('partitions only after output capacity failure, by actual size, with complete global comparison', async () => {
    const { c, leaves, budget } = presentationFixture(capacity), items = cards(), before = JSON.stringify(items);
    const result = await c.reviewIdeaPresentation(items, [], '', budget);
    expect(leaves.map(row => row.items.length)).toEqual([5, 1, 4]);
    expect(budget.remaining).toBe(3);
    expect(result.map((row: any) => row.position)).toEqual([1, 2, 3, 4, 5]);
    expect(result[4].readerGoals.click.evidenceRef).toBe('C5.hook');
    for (const row of leaves.slice(1)) expect([...row.items, ...row.refs].map(x => x.title).sort()).toEqual(items.map(x => x.title).sort());
    expect(JSON.stringify(items)).toBe(before);
  });
  it.each([new Error('审查协议错误：缺少证据编号'), new Error('LLM 主调用超时'), new Error('maximum context length exceeded')])
    ('does not disguise protocol, timeout or missing input capacity as output splitting: %s', async error => {
      const { c, leaves, budget } = presentationFixture(error);
      await expect(c.reviewIdeaPresentation(cards(), [], '', budget)).rejects.toThrow(error.message);
      expect(leaves).toHaveLength(1);
    });
  it('cannot reset the call allowance after aggregate failure', async () => {
    const { c, leaves, budget } = presentationFixture(capacity, { remaining: 1 });
    await expect(c.reviewIdeaPresentation(cards(), [], '', budget)).rejects.toThrow('预算不足');
    expect(budget.remaining).toBe(0); expect(leaves).toHaveLength(1);
  });
  it('keeps the aggregate review when partitions cannot preserve a protocol-correction credit', async () => {
    vi.mocked(config.readGenerationBudgets).mockReturnValue({
      ...config.GENERATION_BUDGET_DEFAULTS,reviewGroupingMode:0,sourceBatchSize:3,
    });
    const sel = normalizePremiseSelectionPayload({
      pool:['A','B','C','D','E'].map(premiseId=>({premiseId,workingTitle:'题材'+premiseId,storyCore:'原始有效条件'+premiseId})),
      selectedPremises:['A','B','C','D','E'].map(premiseId=>({premiseId,
        ...Object.fromEntries(SELECTED_PREMISE_FIELDS.filter(f=>f!=='differentiation').map(f=>[f,'本题的可信行动与结果'+premiseId]))})),
    },5,5);
    const c=Object.create(ChainController.prototype) as any;
    c.logger={warn:vi.fn()};
    const seen:number[]=[];
    const original=c.reviewPremiseSelection;
    c.reviewPremiseSelection=vi.fn(async (input:any,standard:string,mode:string,budget:any,leaf=false,...rest:any[])=>{
      if(!leaf)return original.call(c,input,standard,mode,budget,leaf,...rest);
      seen.push(input.selected.length);budget.remaining--;
      return materializePremiseSourceReview({sourceChecks:premiseSourceComparisonCatalog(input).map(row=>({
        ref:row.ref,status:'preserved',reason:'每个事件与原故事来源相互兼容'))},input);
    });
    const result=await c.reviewPremiseSelection(sel,'有效标准','source_drift',{remaining:2});
    expect(result.sourceChecks).toHaveLength(50);
    expect(seen).toEqual([5]);
  });
  it('passes all fifty source checks through one production JSON helper call', async () => {
    vi.mocked(config.readGenerationBudgets).mockReturnValue({
      ...config.GENERATION_BUDGET_DEFAULTS,reviewGroupingMode:0,sourceBatchSize:5,
    });
    const selection = normalizePremiseSelectionPayload({
      pool: ['A', 'B', 'C', 'D', 'E'].map(premiseId => ({ premiseId, workingTitle: '原题材' + premiseId, storyCore: '主角选择和代价推动具体关系与后果改变' + premiseId })),
      selectedPremises: ['A', 'B', 'C', 'D', 'E'].map(premiseId => ({ premiseId,
        ...Object.fromEntries(SELECTED_PREMISE_FIELDS.filter(key => key !== 'differentiation').map(key => [key, '主角选择和代价推动具体关系与后果改变' + premiseId])) })),
    }, 5, 5);
    const c = Object.create(ChainController.prototype) as any, before = JSON.stringify(selection), budget = { remaining: 6 };
    c.logger = { warn: vi.fn(), error: vi.fn() };
    c.realLLM = { generate: vi.fn(async (request: any) => {
      request.physicalCallBudget.remaining--;
      const scopedRows = JSON.parse(String(request.prompt).split('【待锁定已选胚子】')[1].split('\n')[0]);
      const scopedSelection = { ...selection, selected: scopedRows,
        pool: selection.pool.filter(item => scopedRows.some((row: any) => row.premiseId === item.premiseId)) };
      const payoffChecks = premisePayoffCatalog(scopedSelection).map((row, index) => ({
        ref: row.ref, status: 'supported', actionEvidenceRef: 'S' + (index + 1) + '.activeChoice',
        conditionEvidenceRef: 'S' + (index + 1) + '.escalation',
        reason: '逐项核对兑现结果所需的实际行动与必要条件',
        links: premiseCausalCatalog(scopedSelection.selected[index], 'S' + (index + 1) + '.').map(link => ({
          ref: link.ref, status: 'supported', reason: '当前因果环节的行动、条件与结果相互成立',
        })),
      }));
      return { content: JSON.stringify({
        sourceChecks: premiseSourceComparisonCatalog(scopedSelection).map(row => ({ ref: row.ref, status: 'preserved', reason: '展开保持原池的行动方向与既定后果' })), 
        payoffChecks,
      }) };
    }) };
    const result = await c.reviewPremiseSelection(selection, '完整既有执行标准', 'source_drift', budget);
    expect(result.sourceChecks).toHaveLength(50); expect(c.realLLM.generate).toHaveBeenCalledTimes(1);
    expect(budget.remaining).toBe(5); expect(JSON.stringify(selection)).toBe(before);
  });
  it('automatically audits five unchanged premises in parallel 3+2 without losing evidence or a real rejection', async()=>{
    const pool=['A','B','C','D','E'].map(premiseId=>({premiseId,workingTitle:'题材'+premiseId,
      storyCore:'原创故事的前置行动、权属和结局'+premiseId}));
    const selection=normalizePremiseSelectionPayload({pool,
      selectedPremises:pool.map(seed=>({premiseId:seed.premiseId,...Object.fromEntries(
        SELECTED_PREMISE_FIELDS.filter(field=>field!=='differentiation').map(field=>[field,'由原有行动导致后果'+seed.premiseId]))}))},5,5);
    const c=Object.create(ChainController.prototype) as any, original=c.reviewPremiseSelection, seen:number[]=[];
    c.logger={warn:vi.fn()};
    c.reviewPremiseSelection=vi.fn(async (input:any,standard:string,mode:string,budget:any,leaf=false,...rest:any[])=>{
      if(!leaf)return original.call(c,input,standard,mode,budget,leaf,...rest);
      seen.push(input.selected.length);budget.remaining--;
      return materializePremiseSourceReview({sourceChecks:premiseSourceComparisonCatalog(input).map(row=>({
        ref:row.ref,status:row.premiseId==='D'&&row.field==='payoff'?'drift':'preserved',
        reason:'逐项核对既定事件必要条件、执行者和兑现结果'}))},input);
    });
    const budget={remaining:6},result=await c.reviewPremiseSelection(selection,'有效标准','source_drift',budget);
    expect(seen).toEqual([3,2]);expect(result.sourceChecks).toHaveLength(50);
    expect(result.issues.map((row:any)=>row.premiseId)).toEqual(['D']);expect(result.passed).toBe(false);
    expect(budget.remaining).toBe(4);
  });
  it('source capacity fallback preserves all refs and a real drift', async () => {
    vi.mocked(config.readGenerationBudgets).mockReturnValue({
      ...config.GENERATION_BUDGET_DEFAULTS,reviewGroupingMode:0,sourceBatchSize:5,
    });
    const selected = ['A', 'B', 'C', 'D', 'E'].map(premiseId => ({ premiseId,
      ...Object.fromEntries(SELECTED_PREMISE_FIELDS.filter(key => key !== 'differentiation').map(key => [key, premiseId === 'A' ? '甲'.repeat(1000) : '真实行动推动具体关系和后果改变'])) }));
    const selection = { selected, pool: selected.map(item => ({ ...item, storyCore: item.openingEvent })) } as any;
    const c = Object.create(ChainController.prototype) as any, original = c.reviewPremiseSelection, sizes: number[] = [], budget = { remaining: 6 };
    c.logger = { warn: vi.fn() };
    c.reviewPremiseSelection = vi.fn(async (part: any, standard: string, mode: string, allowance: any, leaf = false, genres: string[] = []) => {
      if (!leaf) return original.call(c, part, standard, mode, allowance, leaf, genres);
      allowance.remaining--; sizes.push(part.selected.length);
      if (part.selected.length === 5) throw capacity;
      return materializePremiseSourceReview({ sourceChecks: premiseSourceComparisonCatalog(part).map(row => ({
        ref: row.ref, status: row.premiseId === 'D' && row.field === 'payoff' ? 'drift' : 'preserved', reason: '原池和展开的具体行动及最终代价相互核对' })) }, part);
    });
    const result = await c.reviewPremiseSelection(selection, '既有标准', 'source_drift', budget);
    expect(sizes).toEqual([5, 1, 4]); expect(result.sourceChecks).toHaveLength(50);
    expect(result.sourceChecks.find((row: any) => row.ref === 'S4.payoff').status).toBe('drift');
    expect(result.passed).toBe(false); expect(budget.remaining).toBe(3);
  });
  it('material splitting is lossless, content-driven and terminates at a single item', () => {
    const items = cards(), groups = splitReviewMaterial(items, item => item);
    expect(groups.map(group => group.length)).toEqual([1, 4]); expect(groups.flat()).toEqual(items);
    expect(() => splitReviewMaterial([items[0]], item => item)).toThrow('单项');
    expect(isReviewOutputCapacityError(capacity)).toBe(true);
    expect(isReviewOutputCapacityError(new Error('标题截断不好看'))).toBe(false);
  });
});
