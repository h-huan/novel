from pathlib import Path

path = Path('.github/scripts/one-shot-idea-distinctiveness.py')
text = path.read_text(encoding='utf-8')
old = "      coreConflict: '主角必须在三天内查清工资记录，同时保住工作并帮助同事家属。',"
new = "      coreConflict: '主角必须在三天内查清工资记录，并在“签保密协议保住工作”与“公开证据帮助同事家属”之间做出不可逆选择。',"
count = text.count(old)
if count != 1:
    raise SystemExit(f'expected exactly one fixture conflict, found {count}')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
