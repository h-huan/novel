from pathlib import Path


def once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 occurrence, found {count}')
    return text.replace(old, new, 1)


path = Path('server/src/chain/chain.controller.ts')
text = path.read_text(encoding='utf-8')

# llmCallWithRetry already preserves runId on current main. This migration only
# wires that existing provenance into the single Canon guard before world writes.
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
# structural validation. Require that successful/current source run first.
text = once(
    text,
    "          if (worldResult.data && typeof worldResult.data === 'object') {\n            try {\n              const wd = worldResult.data;\n",
    "          if (worldResult.data && typeof worldResult.data === 'object') {\n            try {\n              this.generatedCanonGuard.assertStructuredCanCommit({\n                projectId,\n                runId: worldResult.runId,\n                expectedStages: ['world'],\n                expectedScenarios: ['world_building'],\n              });\n              const wd = worldResult.data;\n",
    'short world canon guard',
)

path.write_text(text, encoding='utf-8')
