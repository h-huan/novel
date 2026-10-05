#!/usr/bin/env python3
from pathlib import Path

PATH = Path('server/src/chain/hardline-scanner.spec.ts')
text = PATH.read_text(encoding='utf-8-sig')
old = """  it('纯计数类命中（规则 43 全章无不完美细节）不编造锚点', () => {
    const text = '他把手机放回口袋，屏幕亮着，时间还在走。';
    const finding = detectForbiddenTells(text, anchorProfile).find(f => f.ruleId === '43');
    expect(finding).toBeTruthy();
    expect(finding!.paragraphs).toBeUndefined();
    expect(finding!.paragraphIndices).toBeUndefined();
  });
"""
new = """  it('已退役的固定内容配额规则 43 不再制造全章 finding 或伪造锚点', () => {
    const text = '他把手机放回口袋，屏幕亮着，时间还在走。';
    const finding = detectForbiddenTells(text, anchorProfile).find(f => f.ruleId === '43');
    expect(finding).toBeUndefined();
  });
"""
count = text.count(old)
if count != 1:
    raise SystemExit(f'stale rule-43 test anchor expected once, got {count}')
PATH.write_text(text.replace(old, new, 1), encoding='utf-8')
print('retired stale rule-43 quota test expectation')
