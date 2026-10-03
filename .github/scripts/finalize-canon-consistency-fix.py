from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def replace_once(path: str, old: str, new: str, label: str) -> None:
    file = ROOT / path
    text = file.read_text(encoding='utf-8-sig')
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly 1 match, got {count} in {path}')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')
    print(f'patched {label}: {path}')


chain = 'server/src/chain/chain.controller.ts'
replace_once(
    chain,
    "import { applyCrossStagePatch } from './cross-stage-patch';",
    "import { CROSS_STAGE_PATCH_TABLE_MAP, applyCrossStagePatch, isImmutableWorldPatchTarget } from './cross-stage-patch';",
    'cross-stage canonical target import',
)
replace_once(
    chain,
    "        const PATCH_TABLE_MAP: Record<string, string> = {\n          world: 'world_settings',\n          worldProfile: 'world_system_profiles',\n          character: 'characters',\n          organization: 'organizations',\n          mapPoint: 'map_points',\n          chapter: 'outlines',\n          foreshadowing: 'foreshadowings',\n        };",
    "        // 可修实体唯一来源在 cross-stage-patch；world/worldProfile 刻意不在表中，世界观永不作为修复目标。\n        const PATCH_TABLE_MAP = CROSS_STAGE_PATCH_TABLE_MAP;",
    'remove world from cross-stage patch map',
)
replace_once(
    chain,
    "          `根据审查发现，对本次尚未激活的AI生成资料做最小修订。不得新增人物、组织、地点、章节或伏笔，不得改写故事方向；只能修正互斥的专名、时间、数量、年龄、伤病历史和因果事实。先逐项核对数量基线、历史已发生事件、每次触发后的增减和时间规则；已确认题材是上层事实，下层与它互斥时必须改下层；已确认题材自身互斥时不得凭空声称两种说法都成立。每个patch只替换字段内一段逐字存在的短原文，match必须在当前资料对应字段中逐字出现且只出现一次；replacement是替换该短原文的新片段，不是完整字段，不得带省略号。多处需改就给多个patch，尤其章纲与伏笔计数要同步。\\",
    "          `${STORY_FACT_PRIORITY}\\\n根据审查发现，对本次尚未激活的AI生成资料做最小修订。世界观/world/worldProfile 只作为不可变参照，绝对不得作为 patch 目标；优先选择修改范围最小、下游依赖最少、尚未执行的资料把冲突圆回。不得新增人物、组织、地点、章节或伏笔，不得改写故事方向；只能修正互斥的专名、时间、数量、年龄、伤病历史和因果事实。先逐项核对数量基线、历史已发生事件、每次触发后的增减和时间规则；已确认题材是上层事实，下层与它互斥时必须改最小影响面的下层；已确认题材自身互斥时不得凭空声称两种说法都成立。每个patch只替换字段内一段逐字存在的短原文，match必须在当前资料对应字段中逐字出现且只出现一次；replacement是替换该短原文的新片段，不是完整字段，不得带省略号。多处需改就给多个patch，尤其章纲与伏笔计数要同步。\\",
    'cross-stage prompt uses single canon policy',
)
replace_once(
    chain,
    '只输出JSON:{"patches":[{"entityType":"world|worldProfile|character|organization|mapPoint|chapter|foreshadowing","entityId":"当前资料中的id","field":"允许字段","match":"该字段中逐字存在且只出现一次的短原文","replacement":"替换后的短片段","reason":"对应矛盾"}]}',
    '只输出JSON:{"patches":[{"entityType":"character|organization|mapPoint|chapter|foreshadowing","entityId":"当前资料中的id","field":"允许字段","match":"该字段中逐字存在且只出现一次的短原文","replacement":"替换后的短片段","reason":"对应矛盾"}]}',
    'cross-stage prompt removes world targets',
)
replace_once(
    chain,
    "            const skipReason = !target\n              ? `未知实体类型 ${entityType}`",
    "            const immutableWorldTarget = isImmutableWorldPatchTarget(entityType);\n            const skipReason = immutableWorldTarget\n              ? `世界观 Canon 已冻结，跨阶段修复禁止修改 ${entityType}；应改最小影响面的其它资料`\n              : !target\n                ? `未知实体类型 ${entityType}`",
    'cross-stage hard reject world patch',
)

seed = 'server/src/modules/module-standards/module-standards.seed.ts'
replace_once(seed, 'export const SEED_BASELINE_VERSION = 65;', 'export const SEED_BASELINE_VERSION = 66;', 'bump standard baseline')
replace_once(
    seed,
    "      '普通冲突优先修改最低权威、未锁定且影响范围最小的依赖项；禁止为了省事反向修改上层 Canon',",
    "      '世界观一旦建立永不作为自动或人工修复目标；其它冲突按修改范围、下游依赖数量、时间态计算总影响成本，优先修改最小代价且未锁定的局部依赖，禁止雪崩式重写',",
    'quality loop minimum blast radius',
)
replace_once(
    seed,
    "      '项目创建完成后，世界观只能由作者明确手动修改；自动生成、修复、冲突处理不得静默改世界观',\n      '世界观任何手动修改保存后必须重新校验受影响的章纲、角色/时间线与正文一致性',",
    "      '项目创建阶段完成首次世界观定稿后立即冻结；同一项目内自动生成、修复、冲突处理和人工编辑都不得再修改世界观',\n      '后续资料与冻结世界观冲突时，必须在章纲、未来计划、状态、伏笔、时间线或未接受正文中选择总影响成本最低的局部修复点；若无安全修复点则人工裁决而不是改世界观',",
    'worldbuilding standard freezes canon',
)

quality = 'QUALITY_EXECUTION.md'
replace_once(
    quality,
    "作者确认的正文、题材、角色、世界观、章纲、状态、伏笔等正式事实不能被模型静默覆盖。\n\n人工修改影响正式事实时，必须经过差异提取、影响分析、候选状态、确认/驳回、正式写回和后续一致性复检。RAG 是可重建索引，不是事实源。",
    "作者确认的正文、题材、角色、章纲、状态、伏笔等正式事实不能被模型静默覆盖。**世界观是特殊硬不变量：项目创建阶段完成首次定稿后立即冻结，同一项目内自动流程和人工编辑都不得再修改世界观。**\n\n除世界观外，人工修改影响正式事实时，必须经过差异提取、影响分析、候选状态、确认/驳回、正式写回和后续一致性复检。发生资料冲突时不机械整层重写，而要比较修改范围、下游依赖数量、是否已发生/已锁定，选择能够圆回冲突的最小总代价修复点；没有安全局部修复点就阻断并人工裁决。RAG 与摘要是可重建派生资料，不是事实源。",
    'quality standard immutable world principle',
)
replace_once(
    quality,
    "上下文优先级：\n\n1. Creative Constitution 与锁定事实；\n2. 当前 ChapterPlan；\n3. 上一章出口状态与最近正文关键片段；\n4. 当前涉及角色状态、知识边界和关系；\n5. 当前涉及伏笔、时间线、因果链；\n6. 当前涉及世界规则、地点、组织；\n7. 当前卷/阶段规划；\n8. 其它按需检索信息。",
    "上下文不是简单的“谁排前就整层覆盖谁”，而分为不可变锚点、已发生事实、当前执行计划和派生证据：\n\n1. Creative Constitution / confirmedStory 与项目创建阶段冻结的世界观硬规则共同构成不可自动改写的故事锚点；\n2. 已接受正文产生的已发生事实与锁定状态必须保留连续性；若它们与不可变锚点真正互斥，阻断并人工裁决；\n3. 当前 ChapterPlan 是本章执行合同；\n4. 当前涉及的角色状态、知识边界、关系、伏笔、时间线与因果链；\n5. 最近正文关键片段与上一章出口状态；\n6. 当前卷/阶段规划与尚未执行的未来章纲；\n7. 地点、组织等按当前章节需要加载的 Canon 资料；\n8. RAG、摘要和其它按需检索信息只作派生证据，不能反向覆盖 Canon。",
    'quality standard unified context policy',
)
replace_once(
    quality,
    "任何可计算的时间、数量、次数、倒计时、人物位置、物品状态必须在正文调用前先验证；资料源彼此冲突时先修资料源，禁止让正文自行二选一。",
    "任何可计算的时间、数量、次数、倒计时、人物位置、物品状态必须在正文调用前先验证；资料源彼此冲突时世界观保持不动，其它候选按修改范围最小、下游依赖最少、未来计划优先于已发生历史的原则选择最小代价修复点，禁止让正文自行二选一或用整层重写制造雪崩。",
    'quality standard conflict repair rule',
)

page = 'desktop/src/renderer/pages/DiscoveryWizardPage.tsx'
replace_once(
    page,
    ' * 2. AI生成5个不重复的故事题材供选择',
    ' * 2. AI按配置数量生成不重复的故事题材供选择',
    'remove stale fixed-five comment',
)

print('final guarded replacements applied')
