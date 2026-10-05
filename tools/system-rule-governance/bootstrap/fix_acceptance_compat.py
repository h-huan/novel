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

old = """    expect(snapshot.modules).toContainEqual({
      key: 'inspiration', version: SEED_BASELINE_VERSION, baseline: SEED_BASELINE_VERSION,
    });
    expect(snapshot.modules).toContainEqual({
      key: 'quality_loop', version: SEED_BASELINE_VERSION, baseline: SEED_BASELINE_VERSION,
    });
"""
new = """    expect(snapshot.rulesetVersion).toBe(SEED_BASELINE_VERSION);
    expect(snapshot.modules).toContainEqual({
      key: 'GEN-002', version: SEED_BASELINE_VERSION, baseline: SEED_BASELINE_VERSION,
    });
    expect(snapshot.modules).toContainEqual({
      key: 'QLT-006', version: SEED_BASELINE_VERSION, baseline: SEED_BASELINE_VERSION,
    });
    expect(snapshot.modules).not.toContainEqual(expect.objectContaining({ key: 'inspiration' }));
    expect(snapshot.modules).not.toContainEqual(expect.objectContaining({ key: 'quality_loop' }));
"""
count = text.count(old)
if count != 1:
    raise SystemExit(f'acceptance snapshot modules expectation: expected exactly one legacy module-key block, got {count}')
text = text.replace(old, new, 1)

old = "uses read-only code standards and records their exact code version on generation runs"
new = "uses read-only Registry rules and records their exact ruleset version on generation runs"
count = text.count(old)
if count != 1:
    raise SystemExit(f'acceptance test title: expected exactly one stale code-standards title, got {count}')
text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
print('aligned acceptance diagnostics with System Workflow Rule Registry source, projection and Rule-ID snapshot')
