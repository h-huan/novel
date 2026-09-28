from pathlib import Path


def once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 occurrence, found {count}')
    return text.replace(old, new, 1)


path = Path('server/src/chain/chain.controller.ts')
text = path.read_text(encoding='utf-8')
old = """            const chapList = Array.isArray(chapResult.data?.chapters) ? chapResult.data.chapters : [];
            const byId = new Map(chapters.map(c => [c.id, c]));
"""
new = """            const chapList = Array.isArray(chapResult.data?.chapters) ? chapResult.data.chapters : [];
            if (chapList.length > 0) {
              this.generatedCanonGuard.assertStructuredCanCommit({
                projectId,
                runId: chapResult.runId,
                expectedStages: ['outline'],
                expectedScenarios: ['outline'],
              });
            }
            const byId = new Map(chapters.map(c => [c.id, c]));
"""
text = once(text, old, new, 'outline profile provenance guard')
path.write_text(text, encoding='utf-8')
