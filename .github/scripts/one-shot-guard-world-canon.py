from pathlib import Path


def once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 occurrence, found {count}')
    return text.replace(old, new, 1)


path = Path('server/src/chain/chain.controller.ts')
text = path.read_text(encoding='utf-8')

# Reuse the single Canon provenance boundary already used by chapter commits.
anchor = "} from '../modules/generation-metrics/generation-metrics.service';\n"
text = once(
    text,
    anchor,
    anchor + "import { GeneratedCanonGuardService } from '../modules/generation-metrics/generated-canon-guard.service';\n",
    'generated canon guard import',
)
text = once(
    text,
    "    private readonly generationMetrics: GenerationMetricsService,\n    private readonly originalityGuard: OriginalityGuardService,\n",
    "    private readonly generationMetrics: GenerationMetricsService,\n    private readonly generatedCanonGuard: GeneratedCanonGuardService,\n    private readonly originalityGuard: OriginalityGuardService,\n",
    'generated canon guard constructor injection',
)

# llmCallWithRetry must not discard generation provenance.
start = text.find('  private async llmCallWithRetry<T>(')
end = text.find('  private generateId(): string {', start)
if start < 0 or end < 0:
    raise SystemExit(f'llmCallWithRetry boundaries missing: start={start}, end={end}')
block = text[start:end]
block = once(
    block,
    ">): Promise<{ data: T | null; rawContent: string; warnings: string[]; usage?: { promptTokens: number; completionTokens: number; totalTokens: number } }> {",
    ">): Promise<{ data: T | null; rawContent: string; warnings: string[]; usage?: { promptTokens: number; completionTokens: number; totalTokens: number }; runId?: string }> {",
    'llmCallWithRetry return type',
)
block = once(
    block,
    "    let rawContent = '';\n",
    "    let rawContent = '';\n    let lastRunId: string | undefined;\n",
    'llmCallWithRetry run id state',
)
block = once(
    block,
    "        rawContent = resp.content;\n",
    "        rawContent = resp.content;\n        lastRunId = resp.runId;\n",
    'llmCallWithRetry response run id',
)
return_count = block.count('rawContent, warnings, usage }')
if return_count < 4:
    raise SystemExit(f'llmCallWithRetry expected >=4 successful return sites, found {return_count}')
block = block.replace('rawContent, warnings, usage }', 'rawContent, warnings, usage, runId: lastRunId }')
text = text[:start] + block + text[end:]

# World source hierarchy may replace the first model candidate. Canon provenance
# must follow the candidate that actually survived the existing source review.
text = once(
    text,
    '          let worldCandidate = worldResult.data;\n',
    '          let worldCandidate = worldResult.data;\n          let worldCandidateRunId = worldResult.runId;\n',
    'world candidate provenance',
)
text = once(
    text,
    '            worldCandidate = repair.data;\n            sourceReview = await this.reviewChildSource',
    '            worldCandidate = repair.data;\n            worldCandidateRunId = repair.runId;\n            sourceReview = await this.reviewChildSource',
    'world repair provenance',
)
text = once(
    text,
    "          if (worldCandidate && typeof worldCandidate === 'object') {\n            const wd = worldCandidate;\n",
    "          if (worldCandidate && typeof worldCandidate === 'object') {\n            this.generatedCanonGuard.assertStructuredCanCommit({\n              projectId,\n              runId: worldCandidateRunId,\n              expectedStages: ['world'],\n              expectedScenarios: ['world_building'],\n            });\n            const wd = worldCandidate;\n",
    'reviewed world candidate canon guard',
)

# The short-story world path writes the parsed output directly after its existing
# structural validation. Require that exact successful/current source run first.
text = once(
    text,
    "          if (worldResult.data && typeof worldResult.data === 'object') {\n            try {\n              const wd = worldResult.data;\n",
    "          if (worldResult.data && typeof worldResult.data === 'object') {\n            try {\n              this.generatedCanonGuard.assertStructuredCanCommit({\n                projectId,\n                runId: worldResult.runId,\n                expectedStages: ['world'],\n                expectedScenarios: ['world_building'],\n              });\n              const wd = worldResult.data;\n",
    'short world canon guard',
)

path.write_text(text, encoding='utf-8')
