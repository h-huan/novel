#!/usr/bin/env python3
from pathlib import Path

DOC = Path('QUALITY_EXECUTION.md')
TEST = Path('server/src/chain/real-llm.standards.spec.ts')

doc = DOC.read_text(encoding='utf-8')

replacements = {
    "首稿与续写必须按当前 ChapterPlan 的必经事件、禁写事实、状态边界和出口状态逐项执行。历史产出不得改写本章目标；局部篇幅补足只能锚定原文和合同，不得借扩写改变剧情事实。":
    "首稿与续写必须按当前 ChapterPlan 的必经事件、禁写事实、状态边界和出口状态逐项执行。历史产出不得改写本章目标；局部篇幅补足只能锚定原文和合同，不得借扩写改变剧情事实。\n\n收尾只执行本章合同一次；终章按合同结局或余韵收束，以兑现已承诺内容为优先，不得为了统一模板强制制造续章悬念。",
    "正文评审必须显式给出语言验收结果。缺少语言结论，或语言不通过但没有逐字阻断证据，都表示评审未完成；不能被大纲通过、综合分或模型总 `pass` 覆盖。":
    "正文评审必须显式给出结构化字段 `prosePassed`（布尔值）作为语言验收结果。缺少 `prosePassed` / 语言结论，或语言不通过但没有逐字阻断证据，都表示评审未完成；不能被大纲通过、综合分或模型总 `pass` 覆盖。",
    "只有明确事实互斥、必需事件缺失、事件顺序错位、后章边界越界或执行标准未落实，才能作为架构 Blocking。仅有“与大纲有出入”“缺少过渡”“口径不一致”等泛化措辞不能自动升级。":
    "只有明确事实互斥、必需事件缺失、事件顺序错位、后章边界越界或执行标准未落实，才能作为架构 Blocking。仅有“与大纲有出入”“缺少过渡”“口径不一致”等泛化措辞不能自动升级。\n\n正文验收必须从当前 ChapterPlan / 详细章节合同中提取具体必需事件，按出现顺序逐项判断是否 covered 并引用正文证据；同一场景的重复描述应合并，合同明确要求的收尾也属于必需事件。",
}

for old, new in replacements.items():
    if new in doc:
        continue
    if old not in doc:
        raise SystemExit(f'normative contract anchor missing: {old[:40]}')
    doc = doc.replace(old, new, 1)

DOC.write_text(doc, encoding='utf-8')

if TEST.exists():
    test = TEST.read_text(encoding='utf-8')
    test = test.replace("expect(system).toContain('终章以收束和兑现为优先');", "expect(system).toContain('终章按合同结局或余韵收束');")
    test = test.replace("expect(system).toContain('不得为了换词强加感官或身体动作');", "expect(system).toContain('凭空增加事件、时间、地点');")
    TEST.write_text(test, encoding='utf-8')

print('enriched root normative contracts and aligned consumer assertions')
