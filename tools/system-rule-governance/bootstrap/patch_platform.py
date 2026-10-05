#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path

def fail(message: str) -> None: raise SystemExit(message)
def read(path: Path) -> str:
    if not path.exists(): fail(f"missing file: {path}")
    return path.read_text(encoding="utf-8-sig")
def write(path: Path, text: str) -> None: path.write_text(text, encoding="utf-8")
ROOT=Path.cwd()

def patch_platform_quality(root: Path) -> None:
    path=root/"server/src/modules/writing-quality/platform-quality-rules.ts"; text=read(path)
    replacements={
      "platform_paragraph_length: '拆长短段：单段不超过平台上限，长段之间插入短句或对话，避免大段密排。'":"platform_paragraph_length: '仅调整现有句子的分段、合并和冗余表达；不得为了段落指标新增对话、动作、感官或故事事实。'",
      "platform_dialogue_ratio: '提高对话密度：把说明性叙述改成人物之间的一来一回，加入打断、沉默与动作，使对话占比进入平台区间。'":"platform_dialogue_ratio: '先核对本章场景与人物知识是否本来就支持对话；只允许把已确认且已存在的信息改为合适人物的表达。若事实条件不支持，保留为待语义/架构处理，不得为追比例凭空添加对话、打断、沉默或动作。'",
      "platform_opening_hook: '重写开篇：前几百字直接落在冲突/反常/强悬念上，删掉环境与履历铺垫。'":"platform_opening_hook: '只允许前移、压缩或重排正文/ChapterPlan中已经存在的冲突、异常或未解问题；不得新增事件、威胁、人物或规则来制造钩子。'",
      "platform_ending_hook: '重写章尾：落在未解问题、反转、新威胁或关键动作/对话上，不要平淡收尾。'":"platform_ending_hook: '只收紧本章已经存在的未解问题、状态变化或既定收尾；若ChapterPlan没有继续阅读理由，报告架构问题，不得凭空增加反转、新威胁、动作或对话。'",
      "platform_payoff_gap: '在长间隔中补有效推进或情绪兑现（反转、进展、对手反应、关键抉择），缩短无推进段落。'":"platform_payoff_gap: '优先压缩无推进重复，或把本章已经发生的进展/选择/关系变化表达得更清楚；不得新增反转、对手反应、关键选择或事件来凑密度。'",
    }
    for old,new in replacements.items():
        if old not in text: fail(f"platform-quality suggestion marker missing: {old[:48]}")
        text=text.replace(old,new,1)
    text=text.replace("'按目标平台指标调整本章写法，只改叙述方式与节奏，不改剧情事实。'","'仅在现有事实与ChapterPlan范围内调整表达；不能证明安全局部修复时保留原稿并报告问题，不新增剧情事实。'",1)
    text=text.replace("if (opening?.status === 'bad') issues.push(issue('platform.opening_hook_position', opening.advice, quoteAt(0, target.openingHookChars), 'high'));","if (opening?.status === 'bad') issues.push(issue('platform.opening_hook_position', `${opening.advice}；这是表面信号风险，必须由语义评审确认真实阅读承诺是否缺失`, quoteAt(0, target.openingHookChars), 'medium'));",1)
    write(path,text)

def patch_platform_benchmarks(root: Path) -> None:
    path=root/"server/src/chain/platform-benchmarks.ts"; text=read(path)
    pairs=[
      ("? '对话偏少，关键信息/冲突尽量放进人物对话，减少大段独白与环境描写'","? '对话占比低于平台经验区间；先做语义复核，只有现有场景和人物知识本来支持时才能重组为对话，不得凭空添加对白'"),
      ("advice: pOk ? '' : '段落偏厚，拆成更短意群、一句动作/一句对话独立，适配手机划屏',","advice: pOk ? '' : '段落偏厚；只调整现有句子的分段与冗余，不新增动作、对白或事实来满足排版指标',"),
      ("advice: m.openingHasHook ? '' : `前 ${t.openingHookChars} 字未见冲突信号，把危机/反常/悬念提到第一屏`,","advice: m.openingHasHook ? '' : `前 ${t.openingHookChars} 字未命中表面钩子信号；这里只标记风险，需语义审查确认，修订只能前移或压缩已有事件`,"),
      ("advice: m.endingHasHook ? '' : '结尾偏平，用未解问题、反转或危机临门一脚留住读者',","advice: m.endingHasHook ? '' : '章尾未命中表面留钩信号；先核对ChapterPlan与既有状态变化，不得新造反转、危机或问题',"),
    ]
    for old,new in pairs:
        if old not in text: fail(f"platform-benchmarks marker missing: {old[:60]}")
        text=text.replace(old,new,1)
    write(path,text)

patch_platform_quality(ROOT)
patch_platform_benchmarks(ROOT)
