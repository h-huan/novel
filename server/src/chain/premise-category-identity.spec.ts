import { describe, expect, it } from 'vitest';
import { bindPremiseCategory, premiseCategoryChoices, premiseCategoryIdentityDirective } from './premise-category-identity';
import { SELECTED_PREMISE_FIELDS, normalizePremiseSelectionPayload } from './idea-discovery-contract';
import { normalizePremiseReselection } from './premise-selection-review';

const choices = ['宫斗宅斗', '悬疑惊悚'];
const premise = (premiseId: string) => ({ premiseId,
  ...Object.fromEntries(SELECTED_PREMISE_FIELDS.filter(key => key !== 'differentiation').map(key => [key, '既有选择推动明确的冲突升级与实际代价' + premiseId])) });
const payload = () => ({ pool: ['A', 'B'].map((premiseId, i) => ({ premiseId, workingTitle: '原创题材' + premiseId,
  storyCore: '人物面对原有压力主动选择并付出真实代价' + premiseId, storyCategoryId: 'K' + (i + 1) })),
  selectedPremises: ['A', 'B'].map((id, i) => ({ ...premise(id), storyCategoryId: 'K' + (i + 1) })) });

describe('server-owned premise category identity', () => {
  it('binds the same original-pool IDs to exact names without rewriting any story facts', () => {
    const raw = payload(), before = JSON.stringify(raw);
    const result = normalizePremiseSelectionPayload(raw, 2, 2, choices);
    expect(result.selected.map(item => item.storyCategory)).toEqual(choices);
    expect(result.pool.map(item => item.storyCategory)).toEqual(choices);
    result.selected.forEach((item, i) => { expect(item.storyCore).toBe(raw.pool[i].storyCore); expect(item.coreConflict).toBe(raw.selectedPremises[i].coreConflict); });
    expect(JSON.stringify(raw)).toBe(before);
  });
  it('rejects unknown IDs, conflicting labels and changed original-pool identity', () => {
    for (const patch of [{ storyCategoryId: 'K999' }, { storyCategoryId: 'K1', storyCategory: '古言宅斗' }, { storyCategoryId: 'K2' }]) {
      const raw = payload(); Object.assign(raw.selectedPremises[0], patch);
      expect(() => normalizePremiseSelectionPayload(raw, 2, 2, choices)).toThrow();
    }
  });
  it('does not guess a near-synonym when old free-form responses have no category ID', () => {
    const raw: any = payload(); delete raw.pool[0].storyCategoryId; delete raw.selectedPremises[0].storyCategoryId;
    raw.pool[0].storyCategory = '古言宅斗'; raw.selectedPremises[0].storyCategory = '古言宅斗';
    expect(() => normalizePremiseSelectionPayload(raw, 2, 2, choices)).toThrow('不在本次平台分类候选');
    expect(raw.pool[0].storyCategory).toBe('古言宅斗');
  });
  it('keeps exact-label compatibility and binds a sole author-selected category without inventing a choice', () => {
    expect(bindPremiseCategory({ storyCategory: '宫斗宅斗' }, choices)).toMatchObject({ storyCategoryId: 'K1', storyCategory: '宫斗宅斗' });
    expect(bindPremiseCategory({}, ['作者自定义分类'])).toMatchObject({ storyCategoryId: 'K1', storyCategory: '作者自定义分类' });
    expect(bindPremiseCategory({}, choices)).toEqual({});
  });
  it('unused bad candidates do not corrupt selected valid identities', () => {
    const raw = payload(); raw.pool.push({ ...raw.pool[0], premiseId: 'unused', storyCategoryId: 'K999' });
    expect(normalizePremiseSelectionPayload(raw, 2, 3, choices).selected).toHaveLength(2);
  });
  it('reselection keeps category identity owned by the original pool', () => {
    const original = normalizePremiseSelectionPayload(payload(), 2, 2, choices);
    const changed = normalizePremiseReselection({ selectedPremises: original.selected }, original,
      { passed: false, issues: [{ kind: 'source_drift', premiseId: 'A', referencePremiseId: 'A', quote: '既有来源', referenceQuote: '原池来源', reason: '恢复原有事实' }] }, 2, 2, choices);
    expect(changed.selected.map(item => item.storyCategoryId)).toEqual(['K1', 'K2']);
    expect(changed.selected.map(item => item.storyCategory)).toEqual(choices);
  });
  it('uses the current request options, including custom categories, with no new fixed category table', () => {
    const options = ['定制甲', '定制乙', '定制甲'];
    expect(premiseCategoryChoices(options)).toEqual([{ id: 'K1', label: '定制甲' }, { id: 'K2', label: '定制乙' }]);
    expect(premiseCategoryIdentityDirective(options)).toContain('编号正确不代表内容合格');
  });
});
