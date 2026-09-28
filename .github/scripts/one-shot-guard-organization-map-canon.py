from pathlib import Path


def once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 occurrence, found {count}')
    return text.replace(old, new, 1)


path = Path('server/src/chain/chain.controller.ts')
text = path.read_text(encoding='utf-8')

old = """          let orgCount = 0, mpCount = 0;
          if (orgResult.data) {
            const orgNameToId = new Map<string, string>();
"""
new = """          let orgCount = 0, mpCount = 0;
          if (orgResult.data) {
            this.generatedCanonGuard.assertStructuredCanCommit({
              projectId,
              runId: orgResult.runId,
              expectedStages: ['outline'],
              expectedScenarios: ['organization_map'],
            });
            const orgNameToId = new Map<string, string>();
"""
text = once(text, old, new, 'organization/map provenance guard')
path.write_text(text, encoding='utf-8')
