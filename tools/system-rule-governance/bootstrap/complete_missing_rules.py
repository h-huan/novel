#!/usr/bin/env python3
from pathlib import Path

DOC = Path('QUALITY_EXECUTION.md')
REG = Path('server/shared/src/system-workflow-rules.registry.ts')

doc = DOC.read_text(encoding='utf-8')
registry = REG.read_text(encoding='utf-8')

ctx_doc = '''
### 3.6 组织、地点与空间连续性 `[CTX-006 · P1]`

组织和地点只为真实剧情需要建立。组织层级不得循环；地点进入条件、距离、空间连通与移动成本必须与时间线和人物位置一致。不得为“世界丰富”生成无剧情作用的组织/地点。

### 3.7 伏笔生命周期与知识边界 `[CTX-007 · P1]`

伏笔必须具有稳定生命周期状态、埋设/推进/回收位置与未结负债；推进不得越过角色与读者知识边界。短篇少而集中，长篇可跨卷但必须持续可追踪；关键反转有前置证据。

### 3.8 时间线与因果单一当前值 `[CTX-008 · P1]`

时间、因果、位置和可计数状态按事件前提到结果演进。同一倒计时、年龄、名单/资源数量、位置或状态必须保持单一当前值和明确变化证据，结果不得早于必要前提。

'''

gen_doc = '''
### 4.7 正文篇幅与场景扩写边界 `[GEN-007 · P1]`

正文按每次调用的真实 ChapterPlan 目标和验收区间收敛。篇幅不足只允许在既定场景内补足行动、阻碍、选择与结果；不得抬高目标、写后章、重复解释或在已经完成收尾后新增事件。篇幅上限也不得通过截掉收尾或必需事件达成。

'''

if 'CTX-006 · P1' not in doc:
    marker = '\n---\n\n## 4. 生成规则\n'
    if marker not in doc:
        raise SystemExit('complete rules: section 4 marker missing')
    doc = doc.replace(marker, '\n' + ctx_doc + marker, 1)
if 'GEN-007 · P1' not in doc:
    marker = '\n---\n\n## 5. 质量 Gate\n'
    if marker not in doc:
        raise SystemExit('complete rules: section 5 marker missing')
    doc = doc.replace(marker, '\n' + gen_doc + marker, 1)

ctx_registry = '''  rule({
    id: 'CTX-006', name: '组织地点与空间连续性', category: 'context', level: 'P1', status: 'active', blocking: true,
    scenarios: ['organization_map', 'outline', 'writing', 'review'], consumers: ['prompt', 'semantic_gate', 'deterministic_gate'], dependencies: ['CTX-003'],
    summary: '组织/地点只为剧情需要建立；组织层级不得循环，地点进入条件、距离与移动成本必须与时间线和人物位置一致。',
    details: ['不为“世界丰富”生成无剧情作用的组织/地点；空间移动必须有可解释的时间成本。'],
    implementationRefs: ['server/src/chain/chain.controller.ts', 'server/src/modules/generation-metrics/dependency-context.ts'],
  }),
  rule({
    id: 'CTX-007', name: '伏笔生命周期与知识边界', category: 'context', level: 'P1', status: 'active', blocking: true,
    scenarios: ['foreshadowing', 'outline', 'writing', 'review'], consumers: ['prompt', 'semantic_gate', 'persistence'], dependencies: ['CTX-003'],
    summary: '伏笔必须具有稳定生命周期状态、埋设/推进/回收位置与未结负债；推进不得越过角色和读者知识边界。',
    details: ['短篇少而集中；长篇可跨卷但必须持续可追踪。完结/卷末能够枚举仍未回收的有效负债，关键反转有前置证据。'],
    implementationRefs: ['server/src/chain/foreshadowing-contract.ts', 'server/src/chain/chain.controller.ts'],
  }),
  rule({
    id: 'CTX-008', name: '时间线与因果单一当前值', category: 'context', level: 'P1', status: 'active', blocking: true,
    scenarios: ['timeline', 'outline', 'writing', 'review'], consumers: ['prompt', 'deterministic_gate', 'semantic_gate', 'persistence'], dependencies: ['CTX-005'],
    summary: '时间、因果、位置和可计数状态按事件前提→结果演进；倒计时、年龄、名单/资源数量等同一事实保持单一当前值与变化证据。',
    implementationRefs: ['server/src/chain/source-fact-consistency.ts', 'server/src/chain/chain.controller.ts'],
  }),

'''

gen_registry = '''  rule({
    id: 'GEN-007', name: '正文篇幅与场景扩写边界', category: 'generation', level: 'P1', status: 'active', blocking: true,
    scenarios: ['writing', 'polish'], consumers: ['prompt', 'deterministic_gate', 'repair'], dependencies: ['GEN-004', 'PLAT-002'],
    summary: '正文按每次调用的真实 ChapterPlan 目标和区间收敛；篇幅不足只在既定场景内补行动/阻碍/选择/结果，不抬高目标、不写后章、不用重复解释凑字。',
    details: [
      '首稿篇幅按统一字数口径验收；规划可在调用内部完成，但输出仍仅正文，不增加额外规划调用。历史产出比只作观测，不改写本章目标。',
      '已完成收尾后不得继续推进新事件补长度；篇幅上限也不得通过截掉收尾或必需事件达成。',
    ],
    implementationRefs: ['server/src/chain/chapter-length-expansion.ts', 'server/src/chain/chain.controller.ts'],
  }),

'''

if "id: 'CTX-006'" not in registry:
    marker = "  rule({\n    id: 'GEN-001'"
    if marker not in registry:
        raise SystemExit('complete rules: GEN-001 registry marker missing')
    registry = registry.replace(marker, ctx_registry + marker, 1)
if "id: 'GEN-007'" not in registry:
    marker = "  rule({\n    id: 'QLT-001'"
    if marker not in registry:
        raise SystemExit('complete rules: QLT-001 registry marker missing')
    registry = registry.replace(marker, gen_registry + marker, 1)

DOC.write_text(doc, encoding='utf-8')
REG.write_text(registry, encoding='utf-8')
print('completed missing governance rules: CTX-006/007/008, GEN-007')
