import { describe, it, expect, vi } from 'vitest';
import { premiseCategoryCatalog, premiseCategoryFitIssues, materializePremiseCategoryFit } from './premise-category-fit';
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
