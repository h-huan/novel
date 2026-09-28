from pathlib import Path


def once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 occurrence, found {count}')
    return text.replace(old, new, 1)


path = Path('server/src/chain/chain.controller.ts')
text = path.read_text(encoding='utf-8')
text = once(
    text,
    """          let wp = worldProfileResult.data?.profile || worldProfileResult.data;
          let profileReview = await this.reviewChildSource(projectId, '已确认题材与世界观骨架',
""",
    """          let wp = worldProfileResult.data?.profile || worldProfileResult.data;
          let worldProfileSourceRunId = worldProfileResult.runId;
          let profileReview = await this.reviewChildSource(projectId, '已确认题材与世界观骨架',
""",
    'world profile source run initialization',
)
text = once(
    text,
    """            wp = repair.data?.profile || repair.data;
            profileReview = await this.reviewChildSource(projectId, '已确认题材与世界观骨架',
""",
    """            wp = repair.data?.profile || repair.data;
            worldProfileSourceRunId = repair.runId;
            profileReview = await this.reviewChildSource(projectId, '已确认题材与世界观骨架',
""",
    'world profile repair source run',
)
text = once(
    text,
    """          if (wp && typeof wp === 'object') {
            const input: Record<string, unknown> = {};
""",
    """          if (wp && typeof wp === 'object') {
            this.generatedCanonGuard.assertStructuredCanCommit({
              projectId,
              runId: worldProfileSourceRunId,
              expectedStages: ['world'],
              expectedScenarios: ['world_building'],
            });
            const input: Record<string, unknown> = {};
""",
    'world profile provenance guard',
)
path.write_text(text, encoding='utf-8')
