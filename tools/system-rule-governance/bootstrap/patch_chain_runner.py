#!/usr/bin/env python3
from pathlib import Path
import subprocess
import sys

path = Path('tools/system-rule-governance/bootstrap/patch_chain.py')
source = path.read_text(encoding='utf-8')
old_pair = '''      ('8. 人物状态 (characterStates) — 至少1个核心人物本章状态变化，格式:{"character","stateBefore","stateAfter","trigger"}。','8. 人物状态 (characterStates) — 只有本章确实改变人物状态时列出，格式:{"character","stateBefore","stateAfter","trigger"}；没有真实变化写[]，不得为满足字段制造变化。'),\n'''
if old_pair not in source:
    raise SystemExit('patch_chain_runner: expected characterStates exact-pair source not found')
source = source.replace(old_pair, '', 1)
needle = '    for old,new in pairs:\n'
injection = '''    character_state_prefix = '8. 人物状态 (characterStates) — 至少1个核心人物本章状态变化'\n    character_state_count = text.count(character_state_prefix)\n    if character_state_count < 1: fail('chain controller characterStates quota prefix missing')\n    text = text.replace(\n        character_state_prefix,\n        '8. 人物状态 (characterStates) — 只有本章确实改变人物状态时列出；没有真实变化写[]，不得为满足字段制造变化',\n    )\n'''
if needle not in source:
    raise SystemExit('patch_chain_runner: pairs loop marker not found')
source = source.replace(needle, injection + needle, 1)
path.write_text(source, encoding='utf-8')
subprocess.run([sys.executable, str(path)], check=True)
