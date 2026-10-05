#!/usr/bin/env python3
from pathlib import Path

path = Path('server/src/acceptance/generation-diagnostics.acceptance.spec.ts')
text = path.read_text(encoding='utf-8-sig')
old = "standardSource: 'code_seed',"
new = "standardSource: 'system_workflow_rule_registry',"
count = text.count(old)
if count != 1:
    raise SystemExit(f'acceptance standardSource expectation: expected exactly one stale code_seed assertion, got {count}')
text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')
print('aligned acceptance diagnostics with System Workflow Rule Registry source')
