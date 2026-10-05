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

old = "expect(standardDirectiveCache.get('idea_generate')).toContain('灵感发现·执行标准');"
new = """const ideaDirective = standardDirectiveCache.get('idea_generate');
    expect(ideaDirective).toContain('【系统规则 GEN-002');
    expect(ideaDirective).toContain('【系统规则 QLT-006');"""
count = text.count(old)
if count != 1:
    raise SystemExit(f'acceptance idea directive expectation: expected exactly one stale seed-title assertion, got {count}')
text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
print('aligned acceptance diagnostics with System Workflow Rule Registry source and stable Rule IDs')
