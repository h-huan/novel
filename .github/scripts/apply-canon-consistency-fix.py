from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]


def replace_once(path: str, old: str, new: str, label: str) -> None:
    file = ROOT / path
    text = file.read_text(encoding='utf-8-sig')
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly 1 match, got {count} in {path}')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')
    print(f'patched {label}: {path}')


def regex_once(path: str, pattern: str, replacement: str, label: str) -> None:
    file = ROOT / path
    text = file.read_text(encoding='utf-8-sig')
    new_text, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly 1 regex match, got {count} in {path}')
    file.write_text(new_text, encoding='utf-8')
    print(f'patched {label}: {path}')


# 1) All legacy call sites consume the executable Canon policy instead of a second hierarchy string.
seed = 'server/src/modules/module-standards/module-standards.seed.ts'
replace_once(
    seed,
    '/**\n * 执行标准的机器映射。',
    "import { buildCanonPolicyDirective } from '../canon/canon-policy';\n\n/**\n * 执行标准的机器映射。",
    'seed import canonical policy',
)
regex_once(
    seed,
    r"/\*\*\n \* 事实权威与编辑保护是两条轴：.*?\nexport const STORY_FACT_PRIORITY =\n  '.*?';",
    "/** 唯一 Canon 规则文本由机器策略生成；旧调用点继续用这个名字，但不能再定义第二套顺序。 */\nexport const STORY_FACT_PRIORITY = buildCanonPolicyDirective();",
    'seed single canon directive',
)

# 2) Long/short creation share one deterministic story foundation.
chain = 'server/src/chain/chain.controller.ts'
replace_once(
    chain,
    "import { STORY_FACT_PRIORITY } from '../modules/module-standards/module-standards.seed';",
    "import { STORY_FACT_PRIORITY } from '../modules/module-standards/module-standards.seed';\nimport { buildStoryFoundation } from '../modules/canon/canon-policy';",
    'chain story foundation import',
)
replace_once(
    chain,
    "    const isShort = dto.storyType !== 'long_novel';\n    const ideaStr = JSON.stringify(dto.selectedIdea);",
    "    const isShort = dto.storyType !== 'long_novel';\n    // 长短篇都从同一张 confirmedStory 做确定性投影；不让两条流程各自摘要一次题材。\n    const storyFoundation = buildStoryFoundation(dto.selectedIdea);\n    const ideaStr = JSON.stringify({ confirmedStory: dto.selectedIdea, storyFoundation });",
    'shared creation foundation',
)
replace_once(
    chain,
    "        projectCard: constitution,\n        confirmedStory: dto.selectedIdea,\n      });",
    "        projectCard: constitution,\n        confirmedStory: dto.selectedIdea,\n        storyFoundation,\n      });",
    'short brief receives foundation',
)
regex_once(
    chain,
    r"事实权威顺序：\\\n1\. 已保存正文、明确锁定状态、mustObeyRules/forbiddenWriting 是最高权威。\\\n2\. 当前章的具体到达时间、人物行动、场景与伏笔，以【详细大纲】为本章权威。\\\n3\. 自动扩展的世界档案/简介只作支持材料；若它与详细大纲对同一事实说法冲突，写入 sourceConflicts，不得要求正文同时满足两套说法，也不得把遵循详细大纲判成正文错误。\\\n\\\n必须严格按顺序执行：\\",
    "${STORY_FACT_PRIORITY}\\\n\\\n正文验收补充：世界观不可作为自动修复目标；已接受历史与未来计划冲突且未触碰世界观/确认故事核心时，保留历史并修未来计划；其它资料源冲突按修改范围最小、下游依赖最少的原则选择局部修复点。\\\n\\\n必须严格按顺序执行：\\",
    'remove conflicting body hierarchy',
)
replace_once(
    chain,
    'sourceConflicts 是资料源之间的矛盾：先修资料源，阻断正文保存，禁止正文同时满足两套矛盾说法。',
    'sourceConflicts 是资料源之间的矛盾：世界观永不改；优先修最小影响面的未来计划、派生资料或未接受草稿；没有安全局部修复点时阻断并人工裁决，禁止正文同时满足两套矛盾说法。',
    'body source conflict repair policy',
)

# 3) Inspiration card count is an actual configuration dimension, not a hidden constant.
page = 'desktop/src/renderer/pages/DiscoveryWizardPage.tsx'
replace_once(
    page,
    "  ...discoveryStandards(state),\n  storyType: state.storyType,\n});",
    "  ...discoveryStandards(state),\n  storyType: state.storyType,\n  ideaCount: state.ideaCount,\n});",
    'discovery signature includes count',
)
replace_once(
    page,
    "  && ideas.length > 0\n  && ideas.every((idea) => idea.storyType === state.storyType && idea.targetPlatform === state.targetPlatform);",
    "  && ideas.length === state.ideaCount\n  && ideas.every((idea) => idea.storyType === state.storyType && idea.targetPlatform === state.targetPlatform);",
    'response exact count contract',
)
replace_once(
    page,
    "    step, storyType, targetPlatform, selectedGenres, selectedSubmissionTags, selectedPlotTags, selectedTones, selectedWritingStyles, narrativePov,",
    "    step, storyType, ideaCount, targetPlatform, selectedGenres, selectedSubmissionTags, selectedPlotTags, selectedTones, selectedWritingStyles, narrativePov,",
    'page consumes idea count',
)
replace_once(
    page,
    "  }, [generationDone, generatedSignature, storyType, targetPlatform, targetWords,",
    "  }, [generationDone, generatedSignature, storyType, ideaCount, targetPlatform, targetWords,",
    'count invalidates old discovery',
)
replace_once(
    page,
    "        store.setGenProgress(`⏳ 已等待 ${minutes > 0 ? `${minutes} 分 ` : ''}${secs} 秒，当前模型正在生成并校验 5 个题材，请勿重复点击...`);",
    "        store.setGenProgress(`⏳ 已等待 ${minutes > 0 ? `${minutes} 分 ` : ''}${secs} 秒，当前模型正在生成并校验 ${configuredState.ideaCount} 个题材，请勿重复点击...`);",
    'progress uses configured count',
)
replace_once(
    page,
    "        count: 5,",
    "        count: configuredState.ideaCount,",
    'request configured count',
)
replace_once(
    page,
    "        const newIdeas = (res as any).ideas;\n        if (!discoveryResponseMatchesSelection(requestedSignature, useDiscoveryStore.getState(), newIdeas)) {",
    "        const newIdeas = (res as any).ideas;\n        if (newIdeas.length !== configuredState.ideaCount) {\n          store.setGenProgress(`❌ 本轮要求 ${configuredState.ideaCount} 张合格故事卡，但后端只返回 ${newIdeas.length} 张；本轮不计为成功，请重新发现。`);\n          return;\n        }\n        if (!discoveryResponseMatchesSelection(requestedSignature, useDiscoveryStore.getState(), newIdeas)) {",
    'explicit count mismatch failure',
)
replace_once(
    page,
    "        store.setGenProgress(`✨ 发现 ${newIdeas.length} 个故事题材（已排除 ${excludeTitles?.length || 0} 个旧题材）${qualityWarn}`);",
    "        store.setGenProgress(`✨ 合格故事卡 ${newIdeas.length} / ${configuredState.ideaCount}（已排除 ${excludeTitles?.length || 0} 个旧题材）${qualityWarn}`);",
    'success shows target and actual',
)
replace_once(
    page,
    "      {/* 开始按钮 */}",
    "      <div style={s.sectionTitle}>灵感故事卡数量</div>\n      <div style={{ marginBottom: '28px' }}>\n        <select\n          value={ideaCount}\n          onChange={(event) => store.setIdeaCount(Number(event.target.value))}\n          style={{ width: '100%', padding: '10px 12px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: 'var(--color-text-primary)' }}\n        >\n          {Array.from({ length: 10 }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count} 张</option>)}\n        </select>\n        <div style={{ marginTop: '6px', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>\n          本轮必须返回 {ideaCount} 张通过质量门的完整故事卡；不足不会伪装成成功。\n        </div>\n      </div>\n\n      {/* 开始按钮 */}",
    'count selector UI',
)
replace_once(
    page,
    "            AI从不同角度生成了以下 {ideas.length} 个题材，点击卡片可查看详情",
    "            本轮目标 {ideaCount} 张，已通过 {ideas.length} / {ideaCount} 张；点击卡片可查看详情",
    'result count summary',
)
replace_once(
    page,
    "            return <IdeaCard key={`idea-${idx}`} idea={idea} onClick={handleSelectIdea}",
    "            return <IdeaCard key={`idea-${idx}`} idea={idea} index={idx + 1} total={ideaCount} onClick={handleSelectIdea}",
    'card sequence props',
)

# 4) Every card visibly carries its position in the requested batch.
card = 'desktop/src/renderer/components/discovery/IdeaCard.tsx'
replace_once(
    card,
    "  existingProject?: { id: string; status: string };\n  onOpenProject?: (id: string) => void;\n}",
    "  existingProject?: { id: string; status: string };\n  onOpenProject?: (id: string) => void;\n  index?: number;\n  total?: number;\n}",
    'card count props',
)
replace_once(
    card,
    "const IdeaCard: React.FC<IdeaCardProps> = ({ idea, onClick, existingProject, onOpenProject }) => {",
    "const IdeaCard: React.FC<IdeaCardProps> = ({ idea, onClick, existingProject, onOpenProject, index, total }) => {",
    'card count destructure',
)
replace_once(
    card,
    "          <span style={s.title}>{idea.title}</span>\n          {idea.storyType &&",
    "          <span style={s.title}>{idea.title}</span>\n          {index && total ? <span style={s.qualityFlag}>{index}/{total}</span> : null}\n          {idea.storyType &&",
    'card displays sequence',
)

print('all guarded replacements applied')
