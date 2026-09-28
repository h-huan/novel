from pathlib import Path


def once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 occurrence, found {count}')
    return text.replace(old, new, 1)


path = Path('server/src/chain/chain.controller.ts')
text = path.read_text(encoding='utf-8')

# Collect every detailed-outline run that actually contributed canonical chapter
# plans. One long novel can require many outline calls, so a single fake
# chapterRunId is not enough provenance.
text = once(
    text,
    "    let absoluteChapter = 1;\n    let plannedChapterWords = 0;\n    const totalPlannedChapters = normalizedSkeletons.reduce((sum: number, volume: any) => sum + volume.estimatedChapters, 0);\n",
    "    let absoluteChapter = 1;\n    let plannedChapterWords = 0;\n    const outlineRunIds = new Set<string>();\n    const totalPlannedChapters = normalizedSkeletons.reduce((sum: number, volume: any) => sum + volume.estimatedChapters, 0);\n",
    'long planner outline provenance set',
)

text = once(
    text,
    "        const batchChapters = Array.isArray(batchResult.data)\n",
    "        if (batchResult?.runId) outlineRunIds.add(String(batchResult.runId));\n        const batchChapters = Array.isArray(batchResult.data)\n",
    'long planner collect outline run ids',
)

# Return the already accepted assets unchanged and add provenance only. The old
# one-shot accidentally targeted generateOutline() because it shared a similar
# return shape; this exact block exists only in generateConfiguredLongNovelPlan.
old_return = """    return {
      coreSetting: foundation.coreSetting,
      worldview,
      characters,
      volumes,
      foreshadowings,
      timeline,
      organizations: Array.isArray(worldview?.factions) ? worldview.factions : [],
      mapPoints: Array.isArray(worldview?.geography) ? worldview.geography : [],
    };
"""
new_return = """    const foundationRuns = new Map((Array.isArray((foundationResult as any)?.nodeResults) ? (foundationResult as any).nodeResults : [])
      .map((node: any) => [String(node?.nodeId || ''), String(node?.runId || '')]));
    return {
      coreSetting: foundation.coreSetting,
      worldview,
      characters,
      volumes,
      foreshadowings,
      timeline,
      organizations: Array.isArray(worldview?.factions) ? worldview.factions : [],
      mapPoints: Array.isArray(worldview?.geography) ? worldview.geography : [],
      provenance: {
        skeletonRunId: foundationRuns.get('node_1_skeleton') || undefined,
        worldRunId: foundationRuns.get('node_2_worldview') || undefined,
        characterRunId: characterResult.runId,
        outlineRunIds: [...outlineRunIds],
      },
    };
"""
text = once(text, old_return, new_return, 'long planner return contract')

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

# Volume metadata comes from the accepted skeleton. Detailed chapters come from
# one or more outline runs; every contributing run must still be current before
# any outline Canon is written.
text = once(
    text,
    "            // 存储大纲 + 卷\n            if (data.volumes?.length > 0) {\n              for (const vol of data.volumes) {\n",
    "            // 存储大纲 + 卷\n            if (data.volumes?.length > 0) {\n              this.generatedCanonGuard.assertStructuredCanCommit({\n                projectId,\n                runId: provenance.skeletonRunId,\n                expectedStages: ['outline'],\n                expectedScenarios: ['outline'],\n              });\n              const outlineRunIds = Array.isArray(provenance.outlineRunIds) ? provenance.outlineRunIds : [];\n              if (data.volumes.some((volume: any) => Array.isArray(volume?.chapters) && volume.chapters.length > 0) && outlineRunIds.length === 0) {\n                throw new HttpException('长篇详细章纲缺少 generation run 凭证，已停止写入 Canon', 409);\n              }\n              for (const runId of outlineRunIds) {\n                this.generatedCanonGuard.assertStructuredCanCommit({\n                  projectId,\n                  runId,\n                  expectedStages: ['outline'],\n                  expectedScenarios: ['outline'],\n                });\n              }\n              for (const vol of data.volumes) {\n",
    'long planner outline provenance guards',
)

path.write_text(text, encoding='utf-8')
