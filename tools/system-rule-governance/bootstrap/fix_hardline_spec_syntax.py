#!/usr/bin/env python3
from pathlib import Path

PATH = Path('server/src/chain/hardline-scanner.spec.ts')
text = PATH.read_text(encoding='utf-8-sig')
marker = "describe('system workflow rule governance regressions'"
pos = text.find(marker)
if pos < 0:
    raise SystemExit('hardline governance regression marker missing')

# patch_hardline.py historically appended this block through a raw Python string,
# so structural newlines became literal "\\n" tokens in TypeScript. Rebuild only
# that generated tail as valid TS; keep JS string newline escapes intentionally.
prefix = text[:pos]
block = """describe('system workflow rule governance regressions', () => {
  it('does not hard-block surface quotas or word/punctuation frequency proxies', () => {
    const prose = Array.from({ length: 12 }, (_, i) => `第${i + 1}段平静记录已经发生的工作与关系变化，不需要问号、感叹号、数字锚点或强制不完美细节来证明自然。`).join('\\n\\n');
    const findings = detectForbiddenTells(prose, { platform: 'zhihu', storyType: 'short_story' });
    const hard = findings.filter((item) => isLanguageHardline(item.ruleId)).map((item) => item.ruleId);
    for (const id of ['41','43','45','dialogue-ratio','dash-density','simile-density','55','57-ellipsis-density','26-short-para','26b-staccato']) expect(hard).not.toContain(id);
  });
  it('keeps actual repeated prose/dialogue evidence in the deterministic blocking family', () => {
    for (const id of ['35','35b','42','44','53-same-structure-parallel','54-measure-word-mismatch','56-punct-stacking']) expect(isLanguageHardline(id)).toBe(true);
  });
  it('treats stylistic templates and density signals as semantic-review evidence, not direct blockers', () => {
    for (const id of ['15b','20a','34','list-enumeration','formula-sentence','dash-density','simile-density','36','37','39','46','47','48','49','50-fragment-action-chain','51-modal-particle-density','52-env-imagery-repeat','55','57-ellipsis-density']) expect(isLanguageHardline(id)).toBe(false);
  });
});
"""

# Remove the literal escaped separator left immediately before the marker.
while prefix.endswith('\\n'):
    prefix = prefix[:-2]
prefix = prefix.rstrip() + '\n\n'
PATH.write_text(prefix + block, encoding='utf-8')
print('normalized generated hardline regression test syntax')
