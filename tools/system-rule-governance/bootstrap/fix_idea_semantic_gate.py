#!/usr/bin/env python3
from pathlib import Path

PATH = Path('server/src/chain/idea-appeal-gate.service.ts')
text = PATH.read_text(encoding='utf-8-sig')

replacements = {
"""    if (!reversalConsequential && boundPremiseEvidence && evidenceText('reversalEffect').length < 8) issues.push('结构化题材证据缺少会改变目标、关系、胜负条件或代价的反转效果');
    else if (!reversalConsequential) warnings.push('词面未识别到反转后果；不能只凭关键词缺失判失败');""":
"""    if (boundPremiseEvidence && evidenceText('reversalEffect').length < 8) issues.push('结构化题材证据缺少会改变目标、关系、胜负条件或代价的反转效果');
    else if (!reversalConsequential) warnings.push('词面未识别到反转后果；不能只凭关键词缺失判失败');""",
"""    if (storyType === 'short_story' && !payoffPromise && boundPremiseEvidence && evidenceText('payoff').length < 8) issues.push('结构化题材证据缺少短篇中后段/终局兑现承诺');
    else if (storyType === 'short_story' && !payoffPromise) warnings.push('词面未识别到兑现承诺；交由结构化 payoff/语义审查确认');""":
"""    if (storyType === 'short_story' && boundPremiseEvidence && evidenceText('payoff').length < 8) issues.push('结构化题材证据缺少短篇中后段/终局兑现承诺');
    else if (storyType === 'short_story' && !payoffPromise) warnings.push('词面未识别到兑现承诺；交由结构化 payoff/语义审查确认');""",
}

for old, new in replacements.items():
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'idea semantic gate anchor expected once, got {count}: {old[:80]}')
    text = text.replace(old, new, 1)

PATH.write_text(text, encoding='utf-8')
print('fixed idea semantic Gate: bound structured evidence now outranks lexical proxies')
