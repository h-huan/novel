#!/usr/bin/env python3
from pathlib import Path

path = Path('server/e2e/flows/generation-diagnostics.spec.ts')
text = path.read_text(encoding='utf-8-sig')
old = "expect(after.generationRuns.recent[0].standards.modules.some((s: any) => s.key === 'quality_loop' && s.baseline === SEED_BASELINE_VERSION)).toBe(true);"
new = """expect(after.generationRuns.recent[0].standards.rulesetVersion).toBe(SEED_BASELINE_VERSION);
  expect(after.generationRuns.recent[0].standards.modules.some((s: any) => s.key === 'QLT-006' && s.baseline === SEED_BASELINE_VERSION)).toBe(true);
  expect(after.generationRuns.recent[0].standards.modules.some((s: any) => s.key === 'quality_loop')).toBe(false);"""
count = text.count(old)
if count != 1:
    raise SystemExit(f'API E2E legacy quality_loop assertion: expected exactly one match, got {count}')
text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')
print('aligned API E2E generation diagnostics with Registry rulesetVersion and QLT-006')
