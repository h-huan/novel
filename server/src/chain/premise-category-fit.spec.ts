import { describe, it, expect, vi } from 'vitest';
import { premiseCategoryCatalog, premiseCategoryFitIssues, materializePremiseCategoryFit, premiseCategoryReviewDirective } from './premise-category-fit';
import { ChainController } from './chain.controller';
import { SELECTED_PREMISE_FIELDS, normalizePremiseSelectionPayload } from './idea-discovery-contract';
import { premiseSourceComparisonCatalog } from './premise-selection-review';

const selection = () => normalizePremiseSelectionPayload({
  pool: ['A', 'B'].map(premiseId => ({ premiseId, workingTitle: '原题材' + premiseId, storyCore: '主角在恋爱选择中付出真实代价并改变关系' + premiseId })),
  selectedPremises: ['A', 'B'].map(premiseId => ({ premiseId,
    ...Object.fromEntries(SELECTED_PREMISE_FIELDS.filter(key => key !== 'differentiation').map(key => [key, '主角在恋爱选择中付出真实代价并改变关系' + premiseId])) })),
}, 2, 2);
const withCategories = () => { const s = selection(); s.selected.forEach(p => { p.storyCategory = '青春虐恋'; }); return s; };
const checks = { categoryChecks: [1, 2].map(n => ({ ref: `S${n}.category`, status: 'fulfilled', evidenceRef: `S${n}.coreConflict`, reason: '具体恋爱选择与情感代价构成核心冲突' })) };

describe('same-request premise source catalogue transport', () => {
  it('keeps an exact standalone catalogue and suppresses only the duplicate when genre shares it', () => {
    const s = withCategories();
    const full = premiseCategoryReviewDirective(s);
    const shared = premiseCategoryReviewDirective(s, false);
    const catalogue = JSON.stringify(s.selected.flatMap((p,index)=>SELECTED_PREMISE_FIELDS
      .filter(field=>typeof p[field]==='string' && String(p[field]).length >= 8)
      .map(field=>({id:'S'+(index+1)+'.'+field,field,premiseId:p.premiseId}))));
    expect(full).toContain(catalogue);
    expect(shared).not.toContain(catalogue);
    expect(shared).toContain('【流派证据目录：只含已选展开】');
    expect(full).toContain('categoryChecks每个ref恰好一项');
    expect(shared).toContain('categoryChecks每个ref恰好一项');
  });
  it('passes category and manual-genre rules with one shared evidence catalogue, without skipping either review', async () => {
    const c=Object.create(ChainController.prototype) as any, s=withCategories();
    const sourceChecks=premiseSourceComparisonCatalog(s).map(row=>({ref:row.ref,status:'preserved',reason:'逐项核实当前事实未改变原池约束'}));
    const payoffChecks=s.selected.map((_,i)=>({ref:'S'+(i+1)+'.payoff',status:'supported',actionEvidenceRef:'S'+(i+1)+'.activeChoice',reason:'既定行动支撑已写结果且没有缺失条件'}));
    const genreChecks=s.selected.map((_,i)=>({ref:'S'+(i+1)+'.genre1',status:'fulfilled',evidenceRef:'S'+(i+1)+'.activeChoice',reason:'角色行动体现隐藏实力的反制过程'}));
    c.llmCallWithRetry=vi.fn(async(_label:string,prompt:string,options:any)=>{
      expect((prompt.match(/【流派证据目录：只含已选展开】/gu)||[])).toHaveLength(2); // one directive reference, one real catalogue
      expect(prompt).not.toContain('【已选展开证据目录】');
      expect(prompt).toContain('必返genreChecks');
      expect(prompt).toContain('前置分类审核');
      const value={sourceChecks,payoffChecks,genreChecks,...checks};
      expect(options.validate(value)).toEqual(true);
      options.physicalCallBudget.remaining--;return {data:value};
    });
    const result=await c.reviewPremiseSelection(s,'完整标准','source_drift',{remaining:1},true,['扮猪吃虎']);
    expect(result.passed).toBe(true);
    expect(result.genreChecks).toHaveLength(2);
    expect(result.categoryChecks).toHaveLength(2);
  });
});

describe('category checked before complete cards', () => {
  it('requires coverage, valid own-premise evidence and concrete reasons', () => {
    const s = withCategories(); expect(premiseCategoryCatalog(s)).toHaveLength(2);
    expect(premiseCategoryFitIssues({}, s).length).toBeGreaterThan(0);
    expect(premiseCategoryFitIssues(checks, s)).toEqual([]);
    for (const ref of ['S2.coreConflict', 'S1.storyCategory', 'S1.storyCore']) {
      const bad = structuredClone(checks); bad.categoryChecks[0].evidenceRef = ref;
      expect(premiseCategoryFitIssues(bad, s).length).toBeGreaterThan(0);
    }
    const duplicate = structuredClone(checks); duplicate.categoryChecks[1] = duplicate.categoryChecks[0];
    expect(premiseCategoryFitIssues(duplicate, s)).toContain('分类核查编号未知或重复');
  });
  it('routes a genuine mismatch to source repair; unknown never becomes passed', () => {
    const s = withCategories(), missing = structuredClone(checks);
    missing.categoryChecks[0].status = 'missing'; missing.categoryChecks[0].reason = '救援和举报构成主线，恋爱只是背景';
    expect(materializePremiseCategoryFit(missing, s)).toEqual([expect.objectContaining({ kind: 'selection_fit', premiseId: 'A', field: 'storyCategory' })]);
    missing.categoryChecks[0].status = 'unknown';
    expect(() => materializePremiseCategoryFit(missing, s)).toThrow('尚未确认');
  });
  it('integrates into the same source call and rejects omitted category evidence', async () => {
    const c = Object.create(ChainController.prototype) as any, s = withCategories();
    const payoffChecks=s.selected.map((_,index)=>({ref:'S'+(index+1)+'.payoff',status:'supported',actionEvidenceRef:'S'+(index+1)+'.activeChoice',reason:'逐项核对既定行动与必要条件后确认结果成立'}));
    const sourceChecks = premiseSourceComparisonCatalog(s).map(row => ({ ref: row.ref, status: 'preserved', reason: '当前展开与原池明确的行动及后果兼容' }));
    c.llmCallWithRetry = vi.fn(async (_label: string, prompt: string, options: any) => {
      expect(prompt).toContain('前置分类审核');
      expect(options.validate({ sourceChecks })).toBe(false);
      expect(options.validate({ sourceChecks, payoffChecks, ...checks })).toBe(true);
      options.physicalCallBudget.remaining--; return { data: { sourceChecks, payoffChecks, ...checks } };
    });
    const budget = { remaining: 1 }, result = await c.reviewPremiseSelection(s, '既有分类标准', 'source_drift', budget, true);
    expect(result.passed).toBe(true); expect(result.categoryChecks).toHaveLength(2);
    expect(c.llmCallWithRetry).toHaveBeenCalledOnce(); expect(budget.remaining).toBe(0);
  });
});

it('continues unresolved preselection slots after a protocol failure while the shared budget remains', async () => {
  const c = Object.create(ChainController.prototype) as any, s = selection();
  c.logger = { warn: vi.fn(), log: vi.fn() };
  let sourceCalls = 0;
  c.reviewPremiseSelection = vi.fn(async (_input: any, _standard: string, mode: string) => {
    if (mode === 'source_drift' && sourceCalls++ === 0) return { passed: false, issues: [{ kind: 'selection_fit', premiseId: 'A', referencePremiseId: 'A', quote: String(s.selected[0].coreConflict), referenceQuote: String(s.pool[0].storyCore), reason: '当前行动未落实原有关键成立条件' }] };
    return { passed: true, issues: [] };
  });
  let attempts = 0;
  c.llmCallWithRetry = vi.fn(async (_label: string, prompt: string, options: any) => {
    expect(prompt).toContain('"causalPlan":[');
    options.physicalCallBudget.remaining--;
    if (++attempts === 1) return { data: null, validationIssues: ['causalPlan协议未完成'] };
    return { data: { replacements: [{ replacesPremiseId: 'A', premise: { ...s.selected[0], activeChoice: String(s.selected[0].activeChoice) + '并按已明确条件实际完成交付' }, comparisons: [{ referencePremiseId: 'B', actionDifference: '双方主动选择和具体执行行动明显不同', escalationDifference: '双方选择引发的实际升级因果明显不同', reversalDifference: '双方反转改变的目标和胜负条件不同', consequenceDifference: '双方行动引发的后续结果与代价不同' }] }] } };
  });
  const budget = { reviews: { remaining: 10 }, reselection: { remaining: 3 } };
  const result = await c.reconcilePremiseSelection(s, 2, 2, [], '本次执行标准', [], budget);
  expect(c.llmCallWithRetry).toHaveBeenCalledTimes(2);
  expect(budget.reselection.remaining).toBe(1);
  expect(result.selected.map((item: any) => item.premiseId)).toEqual(['A', 'B']);
});
