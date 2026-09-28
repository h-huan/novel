from pathlib import Path


def once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 occurrence, found {count}')
    return text.replace(old, new, 1)


path = Path('server/src/chain/chain.controller.ts')
text = path.read_text(encoding='utf-8')
old = """            taskWarnings.push(...fsResult.warnings);
            if (fsResult.data) {
              const allFs: any[] = [
"""
new = """            taskWarnings.push(...fsResult.warnings);
            if (fsResult.data) {
              this.generatedCanonGuard.assertStructuredCanCommit({
                projectId,
                runId: fsResult.runId,
                expectedStages: ['outline'],
                expectedScenarios: ['foreshadowing'],
              });
              const allFs: any[] = [
"""
text = once(text, old, new, 'foreshadowing provenance guard')
path.write_text(text, encoding='utf-8')
