from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, got {count}')
    return text.replace(old, new, 1)


controller = Path('server/src/chain/chain.controller.ts')
text = controller.read_text(encoding='utf-8-sig')
text = replace_once(
    text,
    "import { assessSemanticRepairProgress, decideLengthContinuation, decideProgressiveRepair } from './adaptive-repair';\n",
    "import { assessSemanticRepairProgress, decideLengthContinuation, decideProgressiveRepair } from './adaptive-repair';\nimport { ideaHookRequirement, ideaRecoveryDirective } from './idea-discovery-contract';\n",
    'controller import',
)
text = replace_once(
    text,
    "      const exampleChapters = dto.storyType === 'short_story' ? 4 : 90;\n      const outputSchema = `",
    "      const exampleChapters = dto.storyType === 'short_story' ? 4 : 90;\n      const hookRequirement = ideaHookRequirement(dto.storyType);\n      const outputSchema = `",
    'hook requirement binding',
)
text = replace_once(
    text,
    '\"hook\":\"35-80字，异常+困境+代价/时限\"',
    '\"hook\":\"${hookRequirement}\"',
    'hook schema contract',
)
old_recovery = (
    "        const recoveryText = recoveryReasons.length\n"
    "          ? `\\\n"
    "上一批未通过项：${recoveryReasons.slice(0, 10).join('；')}。只补足缺少的${count}项，不复写已通过项。`\n"
    "          : '';"
)
text = replace_once(
    text,
    old_recovery,
    "        const recoveryText = ideaRecoveryDirective(dto.storyType, recoveryReasons, count);",
    'recovery directive',
)
old_empty = (
    "      if (!accepted.length) {\n"
    "        throw new Error(`灵感结果未通过质量 Gate，未创建题材：${Array.from(new Set(rejectedReasons)).slice(0, 6).join('；') || '证据不足'}`);\n"
    "      }"
)
new_empty = (
    "      if (!accepted.length) {\n"
    "        const rejectionSummary = Array.from(new Set(rejectedReasons)).slice(0, 10).join('；') || '证据不足';\n"
    "        this.logger.warn(`idea-discover: 两轮候选均未通过展示 Gate，内部淘汰原因：${rejectionSummary}`);\n"
    "        throw new Error('本轮候选均未达到展示标准，系统已按失败原因自动补生一次；未通过内容不会展示，请重新发现。');\n"
    "      }"
)
text = replace_once(text, old_empty, new_empty, 'empty accepted response')
controller.write_text(text, encoding='utf-8')


gate = Path('server/src/chain/idea-appeal-gate.service.ts')
text = gate.read_text(encoding='utf-8')
text = replace_once(
    text,
    "import { Injectable } from '@nestjs/common';\n",
    "import { Injectable } from '@nestjs/common';\nimport { SHORT_IDEA_HOOK_MIN_SIGNALS } from './idea-discovery-contract';\n",
    'gate import',
)
old_opening = (
    "    const promiseText = `${uniquePoint}；${coreConflict}；${mainReversal}`;\n"
    "    const promiseTokens = promiseText\n"
    "      .split(/[，。！？；：、\\s]/)\n"
    "      .map((item) => item.trim())\n"
    "      .filter((item) => item.length >= 2)\n"
    "      .slice(0, 12);\n"
    "    const openingText = `${hook}；${description.slice(0, Math.min(description.length, 260))}`;\n"
    "    const openingDeliversPromise = promiseTokens.length > 0\n"
    "      && promiseTokens.some((token) => openingText.includes(token.slice(0, Math.min(token.length, 4))));"
)
new_opening = (
    "    const promiseText = `${uniquePoint}；${coreConflict}；${mainReversal}`;\n"
    "    const promiseTokens = promiseText\n"
    "      .split(/[，。！？；：、\\s]/)\n"
    "      .map((item) => item.trim())\n"
    "      .filter((item) => item.length >= 2)\n"
    "      .slice(0, 12);\n"
    "    const openingText = `${hook}；${description.slice(0, Math.min(description.length, 260))}`;\n"
    "    const openingNormalized = openingText.replace(/[\\s\\p{P}\\p{S}]/gu, '');\n"
    "    const genericPromiseAnchors = new Set(['主角必须', '主角发现', '必须在三', '最后必须', '最终必须', '发现真相', '揭开真相', '为了保住', '一个普通']);\n"
    "    const promiseAnchors = promiseTokens.flatMap((token) => {\n"
    "      const clean = token.replace(/[\\s\\p{P}\\p{S}]/gu, '');\n"
    "      if (clean.length < 4) return clean.length >= 2 ? [clean] : [];\n"
    "      const anchors: string[] = [];\n"
    "      for (let index = 0; index <= clean.length - 4; index += 1) anchors.push(clean.slice(index, index + 4));\n"
    "      return anchors;\n"
    "    }).filter((anchor) => !genericPromiseAnchors.has(anchor));\n"
    "    const openingDeliversPromise = promiseAnchors.length > 0\n"
    "      && promiseAnchors.some((anchor) => openingNormalized.includes(anchor));"
)
text = replace_once(text, old_opening, new_opening, 'opening promise evidence')
old_signal = "    if (storyType === 'short_story' && hookSignalCount < 3) issues.push('短篇首屏钩子信息过弱：异常/压力/行动/关系至少应形成三个有效信号');"
new_signal = "    if (storyType === 'short_story' && hookSignalCount < SHORT_IDEA_HOOK_MIN_SIGNALS) issues.push(`短篇首屏钩子信息过弱：异常/压力/行动/关系至少应形成 ${SHORT_IDEA_HOOK_MIN_SIGNALS} 个有效信号`);"
text = replace_once(text, old_signal, new_signal, 'shared hook signal threshold')
gate.write_text(text, encoding='utf-8')


spec = Path('server/src/chain/idea-appeal-gate.service.spec.ts')
text = spec.read_text(encoding='utf-8')
marker = "  it('enriches only accepted ideas with the profile that will travel with selectedIdea', () => {"
test = """  it('recognizes a concrete promise anchor inside the selling point instead of only its first four characters', () => {
    const assessment = gate.assess({
      ...strongShort,
      uniquePoint: '真正不可替换的机制来自每次回家触发的母亲遗忘，以及遗嘱和债务之间的连锁关系。',
      coreConflict: '两难来自房屋合同和债务证据：主角既要在三天内查清责任，也要保护母亲不被逼走。',
      mainReversal: '责任被公司转嫁给父亲，迫使主角改变目标并公开证据，即使会损害父亲一直维护的体面。',
    }, 'short_story');

    expect(assessment.signals.openingDeliversPromise).toBe(true);
    expect(assessment.passed).toBe(true);
  });

"""
text = replace_once(text, marker, test + marker, 'promise overlap regression test')
spec.write_text(text, encoding='utf-8')
