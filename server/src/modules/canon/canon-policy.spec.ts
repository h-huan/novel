import { describe, expect, it } from 'vitest';
import { buildCanonPolicyDirective, chooseMinimumImpactRepair } from './canon-policy';

describe('canon policy', () => {
  it('never chooses world canon as an automatic repair target', () => {
    const decision = chooseMinimumImpactRepair([
      { sourceType: 'world_rule', sourceId: 'w1', dependentCount: 0, changeUnits: 1 },
      { sourceType: 'chapter_plan', sourceId: 'o1', temporalState: 'future_plan', dependentCount: 2, changeUnits: 1 },
    ]);
    expect(decision.requiresHumanDecision).toBe(false);
    expect(decision.target?.sourceType).toBe('chapter_plan');
    expect(decision.scored.find(item => item.candidate.sourceType === 'world_rule')?.eligible).toBe(false);
  });

  it('prefers a small future-plan patch over rewriting accepted history or a book skeleton', () => {
    const decision = chooseMinimumImpactRepair([
      { sourceType: 'accepted_prose', sourceId: 'c10', temporalState: 'confirmed_history', dependentCount: 10, changeUnits: 3 },
      { sourceType: 'book_skeleton', sourceId: 'b1', temporalState: 'future_plan', dependentCount: 80, changeUnits: 2 },
      { sourceType: 'chapter_plan', sourceId: 'c15-plan', temporalState: 'future_plan', dependentCount: 3, changeUnits: 1 },
    ]);
    expect(decision.target?.sourceId).toBe('c15-plan');
  });

  it('prefers regenerating derived material over touching canon', () => {
    const decision = chooseMinimumImpactRepair([
      { sourceType: 'summary', sourceId: 'sum-1', temporalState: 'derived', dependentCount: 0 },
      { sourceType: 'timeline', sourceId: 't1', temporalState: 'future_plan', dependentCount: 4 },
    ]);
    expect(decision.target?.sourceType).toBe('summary');
  });

  it('requires human decision when every conflicting source is immutable or locked', () => {
    const decision = chooseMinimumImpactRepair([
      { sourceType: 'world_setting', sourceId: 'w1' },
      { sourceType: 'accepted_prose', sourceId: 'c1', locked: true, temporalState: 'confirmed_history' },
    ]);
    expect(decision.target).toBeNull();
    expect(decision.requiresHumanDecision).toBe(true);
  });

  it('exports one prompt directive that explicitly freezes world canon and minimizes blast radius', () => {
    const directive = buildCanonPolicyDirective();
    expect(directive).toContain('不得修改世界观');
    expect(directive).toContain('修改范围最小');
    expect(directive).toContain('RAG');
  });
});
