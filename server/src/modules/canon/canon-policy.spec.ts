import { describe, expect, it } from 'vitest';
import { buildCanonPolicyDirective, buildStoryFoundation, confirmedStoryFacts, chooseMinimumImpactRepair } from './canon-policy';

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

  it('projects one deterministic foundation for both long and short creation without inventing facts', () => {
    const story = {
      title: '旧站回声',
      storyType: 'short_story',
      targetPlatform: 'zhihu',
      description: '记者调查已经撤销的地铁站。',
      protagonist: '记者林川',
      coreConflict: '追查真相与保住证人安全冲突',
      activeChoice: '继续调查',
      mainReversal: '站点从档案中被抹除',
      payoff: '找到证人并留下可核验记录',
      setting: '现代城市',
      characters: ['林川', '陈姨'],
      estimatedWords: 12000,
    };
    const first = buildStoryFoundation(story);
    const second = buildStoryFoundation(structuredClone(story));
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      source: 'confirmed_story',
      title: '旧站回声',
      premise: '记者调查已经撤销的地铁站。',
      protagonist: '记者林川',
      coreConflict: '追查真相与保住证人安全冲突',
      endingDirection: '找到证人并留下可核验记录',
      targetWords: 12000,
    });
    expect(Object.values(first)).not.toContain('系统自动补全');
  });

  it('exports one prompt directive that explicitly freezes world canon and minimizes blast radius', () => {
    const directive = buildCanonPolicyDirective();
    expect(directive).toContain('不得修改世界观');
    expect(directive).toContain('影响范围最小');
    expect(directive).toContain('修改单元最少');
    expect(directive).toContain('下游依赖最少');
    expect(directive).toContain('RAG');
  });
});

describe('discovery facts boundary', () => {
  it.each(['short_story', 'long_novel'])('keeps only the selected %s story in generation context', storyType => {
    const selected = {
      title: '选中的故事', storyType, hook: '守住唯一证人', characters: ['林川'],
      customFact: { constraint: '证人不可死亡' },
      readerExperienceProfile: { pace: '紧凑' },
    };
    const audited = { ...selected,
      ideaAppealGate: { passed: true },
      ideaDiscoveryAudit: {
        preselectedPremises: [{ workingTitle: '另一部小说', payoff: '证人死亡' }],
        candidateAssessments: [{ candidate: { description: '外星人摧毁城市' } }],
      },
    };
    const snapshot = JSON.stringify(audited);
    expect(confirmedStoryFacts(audited)).toEqual(selected);
    expect(buildStoryFoundation(audited)).toEqual(buildStoryFoundation(selected));
    expect(JSON.stringify(confirmedStoryFacts(audited))).not.toContain('另一部小说');
    expect(JSON.stringify(audited)).toBe(snapshot);
    const facts = confirmedStoryFacts(audited);
    (facts.characters as string[]).push('新角色');
    expect(audited.characters).toEqual(['林川']);
  });
});
