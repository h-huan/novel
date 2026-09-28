from pathlib import Path


def once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 occurrence, found {count}')
    return text.replace(old, new, 1)


def once_after(text: str, marker: str, old: str, new: str, label: str, required_before: tuple[str, ...] = ()) -> str:
    marker_at = text.find(marker)
    if marker_at < 0:
        raise SystemExit(f'{label}: marker not found: {marker!r}')
    target_at = text.find(old, marker_at)
    if target_at < 0:
        raise SystemExit(f'{label}: target not found after marker')
    prefix = text[marker_at:target_at]
    missing = [name for name in required_before if name not in prefix]
    if missing:
        raise SystemExit(f'{label}: required symbols missing before target: {missing}')
    return text[:target_at] + new + text[target_at + len(old):]


path = Path('server/src/chain/chain.controller.ts')
text = path.read_text(encoding='utf-8')

# The planner already generates foundation world + core characters, but the old
# return contract dropped them. Restrict this replacement to the private long
# planner method: generateOutline() has an intentionally similar return shape.
old_return = "    return { success: true, volumes, meta: { analysis, volumeStructure }, outputs };\n"
new_return = """    const foundationRuns = new Map((Array.isArray((foundationResult as any)?.nodeResults) ? (foundationResult as any).nodeResults : [])
      .map((node: any) => [String(node?.nodeId || ''), String(node?.runId || '')]));
    const outlineRuns = new Map((Array.isArray((result as any)?.nodeResults) ? (result as any).nodeResults : [])
      .map((node: any) => [String(node?.nodeId || ''), String(node?.runId || '')]));
    return {
      success: true,
      coreSetting: foundation.coreSetting,
      worldSetting: foundation.worldview || {},
      characters,
      volumes,
      meta: { analysis, volumeStructure },
      outputs,
      provenance: {
        skeletonRunId: foundationRuns.get('node_1_skeleton') || undefined,
        worldRunId: foundationRuns.get('node_2_worldview') || undefined,
        characterRunId: characterResult.runId,
        volumeRunId: outlineRuns.get('node_2_volumes') || undefined,
        chapterRunId: outlineRuns.get('node_3_chapters') || undefined,
      },
    };
"""
text = once_after(
    text,
    '  private async generateConfiguredLongNovelPlan(input: {',
    old_return,
    new_return,
    'long planner return contract',
    required_before=('foundationResult', 'foundation', 'characters', 'characterResult', 'const result'),
)

# Pull the provenance map next to the only persistence consumer.
text = once(
    text,
    "            const worldSetting = data.worldSetting || data.worldview || data.world || {};\n            let outlineWriteCount = 0, volumeWriteCount = 0, charCount = 0, fsCount = 0, wsCount = 0, orgCount = 0, mpCount = 0, timelineCount = 0;\n",
    "            const worldSetting = data.worldSetting || data.worldview || data.world || {};\n            const provenance = data.provenance || {};\n            let outlineWriteCount = 0, volumeWriteCount = 0, charCount = 0, fsCount = 0, wsCount = 0, orgCount = 0, mpCount = 0, timelineCount = 0;\n",
    'long planner provenance consumer',
)

# Project settings persist both skeleton/coreSetting and worldview. Require both
# exact successful/current source runs before any world Canon write.
text = once(
    text,
    "            if (data.coreSetting || Object.keys(worldSetting).length > 0) {\n              const core = JSON.stringify({\n",
    "            if (data.coreSetting || Object.keys(worldSetting).length > 0) {\n              this.generatedCanonGuard.assertStructuredCanCommit({\n                projectId,\n                runId: provenance.skeletonRunId,\n                expectedStages: ['outline'],\n                expectedScenarios: ['outline'],\n              });\n              this.generatedCanonGuard.assertStructuredCanCommit({\n                projectId,\n                runId: provenance.worldRunId,\n                expectedStages: ['world'],\n                expectedScenarios: ['world_building'],\n              });\n              const core = JSON.stringify({\n",
    'long planner world provenance guards',
)

# The character architecture generated inside the same planner is the source of
# data.characters. Guard once before the first character row is written.
text = once(
    text,
    "            // 存储角色\n            for (const ch of (data.characters || [])) {\n",
    "            // 存储角色\n            if ((data.characters || []).length > 0) {\n              this.generatedCanonGuard.assertStructuredCanCommit({\n                projectId,\n                runId: provenance.characterRunId,\n                expectedStages: ['character'],\n                expectedScenarios: ['character_design'],\n              });\n            }\n            for (const ch of (data.characters || [])) {\n",
    'long planner character provenance guard',
)

# Volume metadata and detailed chapter outlines are produced by two distinct
# fixed nodes. Require both before persisting any outline Canon.
text = once(
    text,
    "            // 存储大纲 + 卷\n            if (data.volumes?.length > 0) {\n              for (const vol of data.volumes) {\n",
    "            // 存储大纲 + 卷\n            if (data.volumes?.length > 0) {\n              this.generatedCanonGuard.assertStructuredCanCommit({\n                projectId,\n                runId: provenance.volumeRunId,\n                expectedStages: ['outline'],\n                expectedScenarios: ['long-novel-flexible-outline'],\n              });\n              this.generatedCanonGuard.assertStructuredCanCommit({\n                projectId,\n                runId: provenance.chapterRunId,\n                expectedStages: ['outline'],\n                expectedScenarios: ['long-novel-flexible-outline'],\n              });\n              for (const vol of data.volumes) {\n",
    'long planner outline provenance guards',
)

path.write_text(text, encoding='utf-8')
