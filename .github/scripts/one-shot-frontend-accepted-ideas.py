from pathlib import Path


def once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, got {count}')
    return text.replace(old, new, 1)

# 1) Backend: every item that leaves the appeal gate carries an explicit pass marker.
path = Path('server/src/chain/idea-appeal-gate.service.ts')
text = path.read_text(encoding='utf-8')
text = once(
    text,
    "      .map((item) => ({\n        ...item.idea,\n        // 随 selectedIdea 原样进入 Creative Constitution.confirmedStory；后续世界观/章纲/正文共享同一份体验策略。\n        readerExperienceProfile: item.assessment.readerExperienceProfile,\n      }));",
    "      .map((item) => ({\n        ...item.idea,\n        // 前端只能展示通过 Gate 的候选；显式标记用于前端二次防守，禁止未来接口扩展时误把 raw/rejected 候选渲染出来。\n        ideaAppealGate: {\n          passed: true as const,\n          distinctivenessScore: item.assessment.signals.distinctivenessScore,\n        },\n        // 随 selectedIdea 原样进入 Creative Constitution.confirmedStory；后续世界观/章纲/正文共享同一份体验策略。\n        readerExperienceProfile: item.assessment.readerExperienceProfile,\n      }));",
    'backend accepted marker',
)
path.write_text(text, encoding='utf-8')

# 2) Frontend store: central display guard. Anything without an explicit pass marker is discarded before UI state.
path = Path('desktop/src/renderer/stores/discoveryStore.ts')
text = path.read_text(encoding='utf-8')
text = once(
    text,
    "interface DiscoveryIdea {\n  title: string;",
    "export interface DiscoveryIdea {\n  title: string;\n  /** 后端 IdeaAppealGate 的通过凭证；前端展示层只接受 passed=true。 */\n  ideaAppealGate?: {\n    passed: boolean;\n    distinctivenessScore?: number;\n  };",
    'discovery idea gate type',
)
text = once(
    text,
    "const INITIAL_STEP_STATUS: CreationStepStatus = {",
    "export const acceptedDiscoveryIdeas = (ideas: DiscoveryIdea[]): DiscoveryIdea[] => (\n  Array.isArray(ideas) ? ideas.filter((idea) => idea?.ideaAppealGate?.passed === true) : []\n);\n\nconst INITIAL_STEP_STATUS: CreationStepStatus = {",
    'accepted idea filter helper',
)
text = once(
    text,
    "      setIdeas: (ideas) => set({ ideas }),",
    "      // UI 的唯一题材列表只保存后端明确标记为通过 Gate 的候选；raw/rejected/旧格式候选一律不进入展示状态。\n      setIdeas: (ideas) => set({ ideas: acceptedDiscoveryIdeas(ideas) }),",
    'store accepted-only guard',
)
path.write_text(text, encoding='utf-8')

# 3) Server regression: accepted items must carry the explicit frontend pass marker.
path = Path('server/src/chain/idea-appeal-gate.service.spec.ts')
text = path.read_text(encoding='utf-8')
text = once(
    text,
    "    expect(selection.accepted[0]).not.toBe(strongShort);\n    expect(selection.accepted[0].readerExperienceProfile).toEqual(",
    "    expect(selection.accepted[0]).not.toBe(strongShort);\n    expect(selection.accepted[0].ideaAppealGate).toEqual(expect.objectContaining({\n      passed: true,\n      distinctivenessScore: expect.any(Number),\n    }));\n    expect(selection.accepted[0].readerExperienceProfile).toEqual(",
    'server marker regression',
)
path.write_text(text, encoding='utf-8')

# 4) Frontend regression: even if a future API accidentally mixes raw/rejected candidates, store/UI sees only accepted ones.
path = Path('desktop/src/renderer/stores/discoveryStore.accepted-ideas.test.ts')
path.write_text("""import { beforeEach, describe, expect, it } from 'vitest';
import { acceptedDiscoveryIdeas, useDiscoveryStore, type DiscoveryIdea } from './discoveryStore';

const accepted: DiscoveryIdea = {
  title: '通过题材',
  ideaAppealGate: { passed: true, distinctivenessScore: 8 },
};
const rejected: DiscoveryIdea = {
  title: '未通过题材',
  ideaAppealGate: { passed: false, distinctivenessScore: 3 },
};
const rawWithoutGate: DiscoveryIdea = { title: '原始候选' };

describe('灵感发现前端只展示通过后端 Gate 的题材', () => {
  beforeEach(() => useDiscoveryStore.getState().reset());

  it('过滤掉明确 rejected 和没有通过凭证的 raw 候选', () => {
    expect(acceptedDiscoveryIdeas([rejected, rawWithoutGate, accepted]).map((idea) => idea.title))
      .toEqual(['通过题材']);
  });

  it('写入 discovery store 时再次执行 accepted-only 防守', () => {
    useDiscoveryStore.getState().setIdeas([accepted, rejected, rawWithoutGate]);
    expect(useDiscoveryStore.getState().ideas.map((idea) => idea.title)).toEqual(['通过题材']);
  });
});
""", encoding='utf-8')
