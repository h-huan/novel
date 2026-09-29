from pathlib import Path

path = Path('server/src/acceptance/generation-diagnostics.acceptance.spec.ts')
text = path.read_text(encoding='utf-8')
old = """    noveltyProof: {
      familiarShell: '限时职业悬疑',
      uncommonCombination: `${premises[index - 1].setting}与${premises[index - 1].hero}的专属验证手段`,
      avoidedPatterns: `避开其余题材的场景、职业和证据机制${index}`,
    },"""
new = """    noveltyProof: {
      familiarShell: '限时职业悬疑',
      uncommonCombination: `${premises[index - 1].setting}与${premises[index - 1].hero}的专属验证手段`,
      avoidedPatterns: `避开其余题材的场景、职业和证据机制${index}`,
      irreplaceableWhy: `去掉${premises[index - 1].setting}或${premises[index - 1].hero}的职业验证方式，关键证据链和最终选择都无法成立`,
      secondOrderConsequence: '证据公开后不只解决眼前异常，还会重新分配责任与利益，并迫使主角与同事或家属的关系发生不可逆变化',
      readerQuestion: `主角能否在截止日前证明${premises[index - 1].setting}里的异常，同时承担公开证据带来的关系代价`,
    },"""
count = text.count(old)
if count != 1:
    raise SystemExit(f'expected one legacy noveltyProof fixture, found {count}')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
