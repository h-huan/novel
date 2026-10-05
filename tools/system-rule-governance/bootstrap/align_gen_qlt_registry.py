#!/usr/bin/env python3
from pathlib import Path
import re

DOC = Path('QUALITY_EXECUTION.md')
REG = Path('server/shared/src/system-workflow-rules.registry.ts')

META = {'GEN-001': ('generation', 'P1', True, 'ALL_SCENES', ['prompt', 'deterministic_gate', 'persistence'], ['AUTH-001'], ['server/shared/src/execution-standard-dimensions.ts', 'server/src/modules/project/creative-constitution.ts']), 'GEN-002': ('generation', 'P0', True, "['idea_generate', 'world_building', 'character_design', 'outline', 'writing', 'review']", ['prompt', 'persistence', 'semantic_gate'], ['AUTH-001'], ['server/src/chain/idea-discovery-contract.ts', 'server/src/chain/chain.controller.ts']), 'GEN-003': ('generation', 'P0', False, 'ALL_SCENES', ['prompt', 'test'], ['GOV-001'], ['server/src/modules/module-standards/standard-directive.cache.ts', 'server/src/chain/real-llm.service.ts']), 'GEN-004': ('generation', 'P1', True, "['writing', 'polish', 'review']", ['prompt', 'semantic_gate', 'repair'], ['ARCH-002'], ['server/src/chain/chain.controller.ts', 'server/src/chain/chapter-length-expansion.ts']), 'GEN-005': ('generation', 'P0', True, "['review', 'summary', 'state_extraction']", ['prompt', 'deterministic_gate', 'test'], ['GEN-003'], ['server/src/chain/chain.controller.ts', 'server/src/chain/hardline-scanner.ts']), 'GEN-006': ('generation', 'P2', False, "['character_design', 'outline', 'writing', 'review']", ['prompt', 'semantic_gate'], ['AUTH-002', 'CTX-003'], ['server/src/chain/chain.controller.ts', 'server/src/modules/character']), 'GEN-007': ('generation', 'P1', True, "['writing', 'polish']", ['prompt', 'deterministic_gate', 'repair'], ['GEN-004', 'PLAT-002'], ['server/src/chain/chapter-length-expansion.ts', 'server/src/chain/chain.controller.ts']), 'QLT-001': ('quality', 'P1', True, "['idea_generate', 'outline', ...WRITING_SCENES]", ['deterministic_gate', 'semantic_gate', 'persistence'], ['GOV-005'], ['server/src/modules/writing-quality', 'server/src/chain/real-llm.service.ts']), 'QLT-002': ('quality', 'P1', True, 'WRITING_SCENES', ['deterministic_gate', 'semantic_gate'], ['QLT-001'], ['server/src/chain/hardline-scanner.ts', 'server/src/modules/writing-quality/platform-quality-rules.ts']), 'QLT-003': ('quality', 'P2', False, "['idea_generate', 'outline', ...WRITING_SCENES]", ['prompt', 'semantic_gate'], ['QLT-002'], ['server/src/chain/real-llm.service.ts', 'server/src/chain/chain.controller.ts']), 'QLT-004': ('quality', 'P1', True, 'WRITING_SCENES', ['prompt', 'deterministic_gate', 'semantic_gate', 'repair', 'test'], ['QLT-002'], ['server/src/chain/hardline-scanner.ts']), 'QLT-005': ('quality', 'P1', True, 'WRITING_SCENES', ['deterministic_gate', 'semantic_gate', 'repair'], ['QLT-004'], ['server/src/chain/hardline-scanner.ts']), 'QLT-006': ('quality', 'P2', True, "['idea_generate']", ['prompt', 'semantic_gate', 'test'], ['GEN-002', 'QLT-003'], ['server/src/chain/idea-discovery-contract.ts', 'server/src/chain/idea-appeal-gate.service.ts']), 'QLT-007': ('quality', 'P2', True, "['idea_generate']", ['prompt', 'semantic_gate', 'repair'], ['QLT-003'], ['server/src/chain/idea-appeal-gate.service.ts', 'server/src/chain/idea-discovery-contract.ts']), 'QLT-008': ('quality', 'P2', False, 'WRITING_SCENES', ['deterministic_gate', 'semantic_gate', 'repair'], ['PLAT-002'], ['server/src/modules/writing-quality/platform-quality-rules.ts']), 'QLT-009': ('quality', 'P1', True, 'ALL_SCENES', ['prompt', 'semantic_gate'], ['AUTH-001'], ['server/src/chain/chain.controller.ts']), 'QLT-010': ('quality', 'P0', True, 'WRITING_SCENES', ['semantic_gate', 'persistence', 'api', 'ui', 'test'], ['GOV-005', 'CTX-001'], ['server/src/modules/generation-metrics/generation-metrics.service.ts', 'server/src/modules/writing-quality']), 'QLT-011': ('quality', 'P1', True, "['review', 'writing', 'polish']", ['prompt', 'semantic_gate', 'persistence', 'test'], ['QLT-003', 'QLT-004'], ['server/src/chain/chain.controller.ts', 'server/src/modules/writing-quality']), 'QLT-012': ('quality', 'P1', True, "['outline', 'review', 'writing']", ['prompt', 'semantic_gate', 'deterministic_gate', 'test'], ['ARCH-002', 'QLT-002'], ['server/src/chain/chain.controller.ts', 'server/src/chain/outline-consistency.ts']), 'QLT-013': ('quality', 'P2', False, "['writing', 'review']", ['prompt', 'semantic_gate'], ['GEN-004'], ['server/src/chain/chain.controller.ts', 'server/src/modules/writing-quality/platform-quality-rules.ts']), 'QLT-014': ('quality', 'P2', False, "['writing', 'review', 'polish']", ['prompt', 'semantic_gate', 'repair'], ['AUTH-001'], ['server/src/chain/hardline-scanner.ts', 'server/src/chain/chain.controller.ts'])}

def ts_array(values):
    return '[' + ', '.join(repr(v) for v in values) + ']'

def section_map(markdown):
    pattern = re.compile(r'^###\s+(.+?)\s+`?\[([A-Z]+-\d{3})\s*·\s*(P[0-3])\]`?\s*$', re.M)
    matches = list(pattern.finditer(markdown))
    result = {}
    for i,m in enumerate(matches):
        end = matches[i+1].start() if i+1 < len(matches) else len(markdown)
        body = markdown[m.end():end].strip()
        title = re.sub(r'^\d+(?:\.\d+)*\s+', '', m.group(1)).strip()
        paragraphs = [p.strip() for p in re.split(r'\n\s*\n', body) if p.strip() and not p.strip().startswith('---')]
        prose=[]
        bullets=[]
        for p in paragraphs:
            if p.startswith('```'): continue
            lines=[x.strip() for x in p.splitlines() if x.strip()]
            if all(x.startswith(('- ','* ')) for x in lines):
                bullets.extend(x[2:].strip() for x in lines)
            else:
                prose.append(' '.join(x[2:].strip() if x.startswith(('- ','* ')) else x for x in lines))
        summary = prose[0] if prose else title
        details = prose[1:] + bullets
        result[m.group(2)] = dict(title=title, level=m.group(3), summary=summary, details=details)
    return result

def quote(value):
    return repr(value)

def block(rule_id, doc):
    category, level, blocking, scenarios, consumers, dependencies, implementations = META[rule_id]
    if doc['level'] != level:
        raise SystemExit(f'{rule_id}: document level {doc["level"]} != metadata {level}')
    lines = [
        '  rule({',
        f"    id: {quote(rule_id)}, name: {quote(doc['title'])}, category: {quote(category)}, level: {quote(level)}, status: 'active', blocking: {str(blocking).lower()},",
        f"    scenarios: {scenarios}, consumers: {ts_array(consumers)}, dependencies: {ts_array(dependencies)},",
        f"    summary: {quote(doc['summary'])},",
    ]
    if doc['details']:
        lines.append('    details: [')
        lines.extend(f'      {quote(item)},' for item in doc['details'])
        lines.append('    ],')
    lines.append(f"    implementationRefs: {ts_array(implementations)},")
    lines.append('  }),')
    return '\n'.join(lines) + '\n'

markdown = DOC.read_text(encoding='utf-8')
sections = section_map(markdown)
text = REG.read_text(encoding='utf-8')

def replace_group(start_id, end_id, ids):
    global text
    start = text.index("  rule({\n    id: '" + start_id + "'")
    end = text.index("  rule({\n    id: '" + end_id + "'", start)
    replacement = ''.join(block(rule_id, sections[rule_id]) for rule_id in ids) + '\n'
    text = text[:start] + replacement + text[end:]

replace_group('GEN-001', 'QLT-001', [f'GEN-{i:03d}' for i in range(1,8)])
replace_group('QLT-001', 'RPR-001', [f'QLT-{i:03d}' for i in range(1,15)])

REG.write_text(text, encoding='utf-8')
print('aligned GEN/QLT machine semantics to QUALITY_EXECUTION.md')
