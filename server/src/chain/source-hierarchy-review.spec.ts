import { describe, expect, it } from 'vitest';
import { buildSourceHierarchyReviewPrompt, normalizeSourceHierarchyReview } from './source-hierarchy-review';

describe('generic source hierarchy review', () => {
  it('keeps a structured conflict blocking with all quoted evidence', () => {
    const result = normalizeSourceHierarchyReview({ consistent: false, contradictions: [
      { parentField: 'hook', parentQuote: '每次交易扣一枚徽章', childField: 'rules', childQuote: '只有提现才扣徽章' },
    ] });
    expect(result?.consistent).toBe(false);
    expect(result?.contradictions[0]).toContain('每次交易扣一枚徽章');
    expect(result?.contradictions[0]).toContain('只有提现才扣徽章');
  });

  it('rejects malformed or self-contradictory review output', () => {
    expect(normalizeSourceHierarchyReview({ consistent: true, contradictions: ['相互冲突'] })).toBeNull();
    expect(normalizeSourceHierarchyReview({ consistent: false, contradictions: [] })).toBeNull();
    expect(normalizeSourceHierarchyReview({ consistent: true, contradictions: [] })).toEqual({ consistent: true, contradictions: [] });
  });

  it('builds the same contract for an unrelated contemporary story', () => {
    const prompt = buildSourceHierarchyReviewPrompt({
      parentName: '确认题材', parent: { hook: '每次交易扣一枚徽章' }, childName: '世界规则',
      child: { rules: ['只有提现才扣徽章'] }, executionStandard: '目标平台：短篇平台；视角：第一人称',
    });
    for (const text of ['每次交易扣一枚徽章', '只有提现才扣徽章', '第一人称', '逐字短引文', '时间方向']) expect(prompt).toContain(text);
    expect(prompt).not.toContain('进门/回拨');
  });
});
