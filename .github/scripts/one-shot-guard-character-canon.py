from pathlib import Path


def once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 occurrence, found {count}')
    return text.replace(old, new, 1)


path = Path('server/src/chain/chain.controller.ts')
text = path.read_text(encoding='utf-8')

old = '''          const generatedCharacters = normalizeGeneratedCharacters(charResult.data);\n\n          let charCount = 0;\n          if (generatedCharacters.length > 0) {\n            for (const ch of generatedCharacters) {\n'''
new = '''          const generatedCharacters = normalizeGeneratedCharacters(charResult.data);\n\n          let charCount = 0;\n          if (generatedCharacters.length > 0) {\n            this.generatedCanonGuard.assertStructuredCanCommit({\n              projectId,\n              runId: charResult.runId,\n              expectedStages: ['character'],\n              expectedScenarios: ['character_design'],\n            });\n            for (const ch of generatedCharacters) {\n'''
text = once(text, old, new, 'independent character canon guard')
path.write_text(text, encoding='utf-8')
