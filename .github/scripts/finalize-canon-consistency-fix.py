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


def replace_between(path: str, start: str, end: str, replacement: str, label: str) -> None:
    file = ROOT / path
    text = file.read_text(encoding='utf-8-sig')
    start_count = text.count(start)
    end_count = text.count(end)
    if start_count != 1 or end_count != 1:
        raise RuntimeError(f'{label}: expected unique markers, got start={start_count}, end={end_count} in {path}')
    start_at = text.index(start)
    end_at = text.index(end, start_at)
    file.write_text(text[:start_at] + replacement + text[end_at:], encoding='utf-8')
    print(f'patched {label}: {path}')


# -----------------------------------------------------------------------------
# 1) Canon policy wording: one machine term for the minimum-blast-radius rule.
# -----------------------------------------------------------------------------
canon = 'server/src/modules/canon/canon-policy.ts'
replace_once(
    canon,
    '必须优先选择修改范围最小、下游依赖最少、可局部圆回的资料；',
    '必须优先选择影响范围最小、修改单元最少、下游依赖最少、可局部圆回的资料；',
    'canon policy minimum-impact wording',
)

# -----------------------------------------------------------------------------
# 2) Generated Canon provenance: strict currentness everywhere. Long creation
#    validates the whole batch before its first write instead of weakening guard.
# -----------------------------------------------------------------------------
guard = 'server/src/modules/generation-metrics/generated-canon-guard.service.ts'
replace_once(
    guard,
    "import { readConstitution } from '../project/creative-constitution';\n",
    '',
    'guard removes constitution fallback import',
)
replace_once(
    guard,
    "    const row = db.prepare(`SELECT id,project_id,stage,scenario,status,gate_status,output_text,constitution_json\n      FROM generation_runs WHERE id=? AND project_id=? LIMIT 1`).get(runId, projectId) as {\n        id: string;\n        project_id: string;\n        stage: string | null;\n        scenario: string | null;\n        status: string | null;\n        gate_status: string | null;\n        output_text: string | null;\n        constitution_json: string | null;\n      } | undefined;",
    "    const row = db.prepare(`SELECT id,project_id,stage,scenario,status,gate_status,output_text\n      FROM generation_runs WHERE id=? AND project_id=? LIMIT 1`).get(runId, projectId) as {\n        id: string;\n        project_id: string;\n        stage: string | null;\n        scenario: string | null;\n        status: string | null;\n        gate_status: string | null;\n        output_text: string | null;\n      } | undefined;",
    'guard uses stable provenance columns only',
)
replace_between(
    guard,
    "    const project = db.prepare('SELECT * FROM projects WHERE id=? LIMIT 1').get(projectId) as any;",
    "\n    return { runId, projectId, stage, scenario, outputText };",
    "    if (!this.generationMetrics.runIsCurrent(runId, projectId)) {\n      throw new ConflictException('AI Canon 提交凭证已过期：项目创作宪法或依赖上下文已变化');\n    }\n",
    'guard removes broad creating-project stale bypass',
)

# Update guard regression to assert that creating status is not a stale bypass.
guard_spec = 'server/src/modules/generation-metrics/generated-canon-guard.service.spec.ts'
replace_once(guard_spec, "import { readConstitution } from '../project/creative-constitution';\n", '', 'guard spec removes constitution helper')
replace_once(
    guard_spec,
    "    constitution_json: JSON.stringify(readConstitution(projectRow as any)),\n",
    '',
    'guard spec removes obsolete column',
)
replace_between(
    guard_spec,
    "  it('keeps same-constitution structured runs valid while their own creation batch changes dependency context', () => {",
    "  it('still rejects a creating-batch run when the Creative Constitution changed', () => {",
    "  it('does not use project.status=creating as a stale-run bypass', () => {\n    const creatingProject = { ...projectRow, status: 'creating' };\n    const { service } = createSubject({ ...passedRun, gate_status: 'not_evaluated' }, false, creatingProject);\n    expect(() => service.assertStructuredCanCommit({\n      projectId: 'project-1',\n      runId: 'run-1',\n      expectedStages: ['world'],\n      expectedScenarios: ['world_building'],\n    })).toThrow('凭证已过期');\n  });\n\n",
    'guard spec rejects stale creating run',
)

# -----------------------------------------------------------------------------
# 3) Long creation batch: all provenance proofs are validated before ANY same-
#    batch Canon write. Later writes cannot self-invalidate the remaining proofs.
# -----------------------------------------------------------------------------
chain = 'server/src/chain/chain.controller.ts'
replace_once(
    chain,
    "            const worldSetting = data.worldSetting || data.worldview || data.world || {};\n            const provenance = data.provenance || {};\n            let outlineWriteCount = 0, volumeWriteCount = 0, charCount = 0, fsCount = 0, wsCount = 0, orgCount = 0, mpCount = 0, timelineCount = 0;",
    "            const worldSetting = data.worldSetting || data.worldview || data.world || {};\n            const provenance = data.provenance || {};\n            const creationBatchOutlineRunIds = Array.isArray(provenance.outlineRunIds) ? provenance.outlineRunIds : [];\n            const creationBatchHasChapters = (data.volumes || []).some((volume: any) => Array.isArray(volume?.chapters) && volume.chapters.length > 0);\n            // 同一长篇创建批次必须在第一条 Canon 写入之前一次性验明全部来源。\n            // 之后 world/character/outline 的正常落库会改变依赖上下文，因此绝不能边写边拿新上下文\n            // 重新判同批旧 run 过期；真正的外部上下文漂移会在本次 preflight 前被 runIsCurrent 拦截。\n            this.generatedCanonGuard.assertStructuredCanCommit({\n              projectId, runId: provenance.skeletonRunId, expectedStages: ['outline'], expectedScenarios: ['outline'],\n            });\n            if (data.coreSetting || Object.keys(worldSetting).length > 0) {\n              this.generatedCanonGuard.assertStructuredCanCommit({\n                projectId, runId: provenance.worldRunId, expectedStages: ['world'], expectedScenarios: ['world_building'],\n              });\n            }\n            if ((data.characters || []).length > 0) {\n              this.generatedCanonGuard.assertStructuredCanCommit({\n                projectId, runId: provenance.characterRunId, expectedStages: ['character'], expectedScenarios: ['character_design'],\n              });\n            }\n            if (creationBatchHasChapters && creationBatchOutlineRunIds.length === 0) {\n              throw new HttpException('长篇详细章纲缺少 generation run 凭证，已停止写入 Canon', 409);\n            }\n            for (const runId of creationBatchOutlineRunIds) {\n              this.generatedCanonGuard.assertStructuredCanCommit({\n                projectId, runId, expectedStages: ['outline'], expectedScenarios: ['outline'],\n              });\n            }\n            let outlineWriteCount = 0, volumeWriteCount = 0, charCount = 0, fsCount = 0, wsCount = 0, orgCount = 0, mpCount = 0, timelineCount = 0;",
    'long creation batch provenance preflight',
)
replace_once(
    chain,
    "            if (data.coreSetting || Object.keys(worldSetting).length > 0) {\n              this.generatedCanonGuard.assertStructuredCanCommit({\n                projectId,\n                runId: provenance.skeletonRunId,\n                expectedStages: ['outline'],\n                expectedScenarios: ['outline'],\n              });\n              this.generatedCanonGuard.assertStructuredCanCommit({\n                projectId,\n                runId: provenance.worldRunId,\n                expectedStages: ['world'],\n                expectedScenarios: ['world_building'],\n              });\n              const core = JSON.stringify({",
    "            if (data.coreSetting || Object.keys(worldSetting).length > 0) {\n              const core = JSON.stringify({",
    'remove interleaved world provenance checks',
)
replace_once(
    chain,
    "            // 存储角色\n            if ((data.characters || []).length > 0) {\n              this.generatedCanonGuard.assertStructuredCanCommit({\n                projectId,\n                runId: provenance.characterRunId,\n                expectedStages: ['character'],\n                expectedScenarios: ['character_design'],\n              });\n            }\n            for (const ch of (data.characters || [])) {",
    "            // 存储角色（generation run 已在本批第一条 Canon 写入前统一验明）\n            for (const ch of (data.characters || [])) {",
    'remove interleaved character provenance check',
)
replace_once(
    chain,
    "            if (data.volumes?.length > 0) {\n              this.generatedCanonGuard.assertStructuredCanCommit({\n                projectId,\n                runId: provenance.skeletonRunId,\n                expectedStages: ['outline'],\n                expectedScenarios: ['outline'],\n              });\n              const outlineRunIds = Array.isArray(provenance.outlineRunIds) ? provenance.outlineRunIds : [];\n              if (data.volumes.some((volume: any) => Array.isArray(volume?.chapters) && volume.chapters.length > 0) && outlineRunIds.length === 0) {\n                throw new HttpException('长篇详细章纲缺少 generation run 凭证，已停止写入 Canon', 409);\n              }\n              for (const runId of outlineRunIds) {\n                this.generatedCanonGuard.assertStructuredCanCommit({\n                  projectId,\n                  runId,\n                  expectedStages: ['outline'],\n                  expectedScenarios: ['outline'],\n                });\n              }\n              for (const vol of data.volumes) {",
    "            if (data.volumes?.length > 0) {\n              // skeleton / outline run 已在本批第一条 Canon 写入前统一验明。\n              for (const vol of data.volumes) {",
    'remove interleaved outline provenance checks',
)

# -----------------------------------------------------------------------------
# 4) Cross-stage repair: immutable world is removed from the machine target map
#    and every repair prompt uses the single Canon policy.
# -----------------------------------------------------------------------------
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
    "          `${STORY_FACT_PRIORITY}\\\n根据审查发现，对本次尚未激活的AI生成资料做最小修订。世界观/world/worldProfile 只作为不可变参照，绝对不得作为 patch 目标；优先选择影响范围最小、修改单元最少、下游依赖最少、尚未执行的资料把冲突圆回。不得新增人物、组织、地点、章节或伏笔，不得改写故事方向；只能修正互斥的专名、时间、数量、年龄、伤病历史和因果事实。先逐项核对数量基线、历史已发生事件、每次触发后的增减和时间规则；已确认题材是上层事实，下层与它互斥时必须改最小影响面的下层；已确认题材自身互斥时不得凭空声称两种说法都成立。每个patch只替换字段内一段逐字存在的短原文，match必须在当前资料对应字段中逐字出现且只出现一次；replacement是替换该短原文的新片段，不是完整字段，不得带省略号。多处需改就给多个patch，尤其章纲与伏笔计数要同步。\\",
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

# -----------------------------------------------------------------------------
# 5) World freeze: after the accepted world is written, enrichment may only read
#    it. Do not let a late LLM "depth" pass change the novel under outlines.
# -----------------------------------------------------------------------------
replace_once(
    chain,
    '    // 上下文可重算：世界观深度补全完成后，重新计算以包含补全后的世界观档案，供后续组织/地点/大纲/伏笔使用',
    '    // 世界观在进入角色/章纲前已经定稿；后续深度资料只能读取它，禁止再生成或修改世界事实。',
    'enrichment treats world as frozen input',
)
replace_once(
    chain,
    "    this.emitProjectProgress(projectId, { type: 'progress', step: 'enrich', percent: 88, message: '补全角色/世界观/组织/地点/大纲/伏笔的深度资料...', status: 'running' });",
    "    this.emitProjectProgress(projectId, { type: 'progress', step: 'enrich', percent: 88, message: '读取冻结世界观，补全组织/地点/大纲/伏笔的派生资料...', status: 'running' });",
    'enrichment progress no longer promises world mutation',
)
replace_once(
    chain,
    '    // ====== 五个深度子步骤按层级顺序执行（各步骤已补全则跳过，避免重复执行步骤）======\n    // 顺序：世界观 → 组织 → 地点 → 大纲 → 伏笔；世界观深度先生成并回写上下文，后续步骤基于它生成。',
    '    // ====== 四个派生深度子步骤按层级顺序执行（各步骤已补全则跳过）======\n    // 世界观已经冻结，只作为输入；顺序：组织 → 地点 → 大纲 → 伏笔。',
    'enrichment step list removes world mutation',
)
replace_between(
    chain,
    '    // 世界观 depth\n    enrichTasks.push(async () => {',
    '    // 组织/势力 depth',
    "    // 世界观 depth 不再在此补全：一旦世界观主记录通过上层事实审查并写入，\n    // 它就是不可变故事地基。缺少非核心展示字段宁可保持为空，也不能在角色/章纲之后再让 LLM 新增世界事实。\n\n",
    'remove late world profile generation',
)
replace_once(
    chain,
    "    if (enrichTasks.length > 0) {\n      await enrichTasks[0]();\n      ctxSummary = buildCtxSummary();\n      for (const enrichTask of enrichTasks.slice(1)) await enrichTask();\n    }",
    "    for (const enrichTask of enrichTasks) await enrichTask();",
    'sequential enrichment reads frozen world',
)
replace_between(
    chain,
    "    const worldProfile = db.prepare(`SELECT p.era,p.rules,p.ending,p.hierarchy_rules FROM world_system_profiles p",
    '    return warnings;',
    "    // 世界观完整性的硬门禁由首次世界生成/上层事实审查与 assertProjectSourceCompleteness 承担。\n    // 禁止在这里为了填满展示型 profile 字段而再次改写世界观。\n\n",
    'remove post-outline world profile completeness mutation pressure',
)

# Tighten WorldSettingService: first persisted world is the freeze point, not project active.
world_service = 'server/src/modules/world-setting/world-setting.service.ts'
replace_between(
    world_service,
    '  /**\n   * 世界观只允许在项目创建阶段首次建立/补齐。项目一旦离开 creating，世界观即冻结。',
    '\n\n  create(projectId: string, dto: CreateWorldSettingDto): WorldSettingResponse {',
    "  /**\n   * 世界观只允许在项目创建阶段建立一次。第一条世界观记录写入后即视为定稿并冻结；\n   * project.status=creating 不是持续修改许可，避免后续角色/章纲生成期间再次改地基。\n   */\n  private assertWorldMutable(projectId: string, operation: string, initialCreate = false): void {\n    const project = this.databaseService.getDb().prepare('SELECT id,status FROM projects WHERE id=? LIMIT 1').get(projectId) as any;\n    if (!project) throw new NotFoundException('Project not found');\n    const freeze = () => {\n      throw new ConflictException(`世界观已冻结，不能执行“${operation}”。世界观是小说地基；请在章纲、未来计划、状态、伏笔或未接受正文中选择最小代价修复点，禁止通过修改世界观来消除冲突。`);\n    };\n    if (String(project.status || '') !== 'creating') freeze();\n    if (!initialCreate) freeze();\n    const existing = this.repo.findByProjectId(projectId) || [];\n    if (existing.length > 0) freeze();\n  }",
    'world service freezes after first persisted world',
)
replace_once(
    world_service,
    "    this.assertWorldMutable(projectId, '创建/替换世界观');",
    "    this.assertWorldMutable(projectId, '创建世界观', true);",
    'world create only allows first record',
)

world_spec = 'server/src/modules/world-setting/world-setting.service.spec.ts'
replace_between(
    world_spec,
    "  describe('constraint management', () => {",
    "  it('rejects every world mutation entry once the project is active', () => {",
    "  it('freezes the world immediately after its first persisted record even while project is creating', () => {\n    (repo.findById as any).mockReturnValue(mockRow);\n    (repo.findByProjectId as any).mockReturnValue([mockRow]);\n\n    const blocked = (call: () => unknown) => expect(call).toThrow('世界观已冻结');\n    blocked(() => service.create('project-1', { name: '第二个世界' } as any));\n    blocked(() => service.update('ws-1', { name: '改名' } as any));\n    blocked(() => service.remove('ws-1'));\n    blocked(() => service.addConstraint('ws-1', { category: 'power', rule: '改约束' } as any));\n    blocked(() => service.removeConstraint('ws-1', 'c-1'));\n\n    expect(repo.update).not.toHaveBeenCalled();\n    expect(repo.delete).not.toHaveBeenCalled();\n    expect(repo.addConstraint).not.toHaveBeenCalled();\n    expect(repo.removeConstraint).not.toHaveBeenCalled();\n  });\n\n",
    'world service spec immediate freeze',
)

# Active explicit source rebuild must never delete an already frozen world.
recovery = 'server/src/chain/generation-recovery.service.ts'
replace_once(
    recovery,
    "    if (!['active', 'generation_failed'].includes(String(project.status))) {\n      throw new ConflictException('项目仍在创建或运行，不能同时按原题材重建。');\n    }",
    "    if (!['active', 'generation_failed'].includes(String(project.status))) {\n      throw new ConflictException('项目仍在创建或运行，不能同时按原题材重建。');\n    }\n    const frozenWorld = db.prepare('SELECT id FROM world_settings WHERE project_id=? LIMIT 1').get(projectId);\n    if (frozenWorld) {\n      throw new ConflictException('世界观已冻结，禁止按原题材重建世界观。请保留世界观，只在章纲、角色、状态、伏笔、时间线或未接受正文中做最小影响修复。');\n    }",
    'explicit recovery cannot rebuild frozen world',
)

# -----------------------------------------------------------------------------
# 6) Standards/docs/UI stale copy.
# -----------------------------------------------------------------------------
seed = 'server/src/modules/module-standards/module-standards.seed.ts'
replace_once(seed, 'export const SEED_BASELINE_VERSION = 65;', 'export const SEED_BASELINE_VERSION = 66;', 'bump standard baseline')
replace_once(
    seed,
    "      '普通冲突优先修改最低权威、未锁定且影响范围最小的依赖项；禁止为了省事反向修改上层 Canon',",
    "      '世界观一旦建立永不作为自动或人工修复目标；其它冲突按影响范围、修改单元、下游依赖数量与时间态计算总成本，优先修改最小代价且未锁定的局部依赖，禁止雪崩式重写',",
    'quality loop minimum blast radius',
)
replace_once(
    seed,
    "      '项目创建完成后，世界观只能由作者明确手动修改；自动生成、修复、冲突处理不得静默改世界观',\n      '世界观任何手动修改保存后必须重新校验受影响的章纲、角色/时间线与正文一致性',",
    "      '项目创建阶段首次世界观通过上层事实审查并写入后立即冻结；同一项目内自动生成、修复、冲突处理和人工编辑都不得再修改世界观',\n      '后续资料与冻结世界观冲突时，必须在章纲、未来计划、状态、伏笔、时间线或未接受正文中选择总影响成本最低的局部修复点；若无安全修复点则人工裁决而不是改世界观',",
    'worldbuilding standard freezes canon',
)

quality = 'QUALITY_EXECUTION.md'
replace_once(
    quality,
    "作者确认的正文、题材、角色、世界观、章纲、状态、伏笔等正式事实不能被模型静默覆盖。\n\n人工修改影响正式事实时，必须经过差异提取、影响分析、候选状态、确认/驳回、正式写回和后续一致性复检。RAG 是可重建索引，不是事实源。",
    "作者确认的正文、题材、角色、章纲、状态、伏笔等正式事实不能被模型静默覆盖。**世界观是特殊硬不变量：项目创建阶段首次世界观通过上层事实审查并写入后立即冻结，同一项目内自动流程和人工编辑都不得再修改世界观。**\n\n除世界观外，人工修改影响正式事实时，必须经过差异提取、影响分析、候选状态、确认/驳回、正式写回和后续一致性复检。发生资料冲突时不机械整层重写，而要比较影响范围、修改单元、下游依赖数量、是否已发生/已锁定，选择能够圆回冲突的最小总代价修复点；没有安全局部修复点就阻断并人工裁决。RAG 与摘要是可重建派生资料，不是事实源。",
    'quality standard immutable world principle',
)
replace_once(
    quality,
    "上下文优先级：\n\n1. Creative Constitution 与锁定事实；\n2. 当前 ChapterPlan；\n3. 上一章出口状态与最近正文关键片段；\n4. 当前涉及角色状态、知识边界和关系；\n5. 当前涉及伏笔、时间线、因果链；\n6. 当前涉及世界规则、地点、组织；\n7. 当前卷/阶段规划；\n8. 其它按需检索信息。",
    "上下文不是简单的“谁排前就整层覆盖谁”，而分为不可变锚点、已发生事实、当前执行计划和派生证据：\n\n1. Creative Constitution / confirmedStory 与首次写入后冻结的世界观硬规则共同构成不可自动改写的故事锚点；\n2. 已接受正文产生的已发生事实与锁定状态必须保留连续性；若它们与不可变锚点真正互斥，阻断并人工裁决；\n3. 当前 ChapterPlan 是本章执行合同；\n4. 当前涉及的角色状态、知识边界、关系、伏笔、时间线与因果链；\n5. 最近正文关键片段与上一章出口状态；\n6. 当前卷/阶段规划与尚未执行的未来章纲；\n7. 地点、组织等按当前章节需要加载的 Canon 资料；\n8. RAG、摘要和其它按需检索信息只作派生证据，不能反向覆盖 Canon。",
    'quality standard unified context policy',
)
replace_once(
    quality,
    "任何可计算的时间、数量、次数、倒计时、人物位置、物品状态必须在正文调用前先验证；资料源彼此冲突时先修资料源，禁止让正文自行二选一。",
    "任何可计算的时间、数量、次数、倒计时、人物位置、物品状态必须在正文调用前先验证；资料源彼此冲突时世界观保持不动，其它候选按影响范围最小、修改单元最少、下游依赖最少、未来计划优先于已发生历史的原则选择最小代价修复点，禁止让正文自行二选一或用整层重写制造雪崩。",
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
