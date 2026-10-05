#!/usr/bin/env python3
from __future__ import annotations
import re
from pathlib import Path

def fail(message: str) -> None:
    raise SystemExit(message)

def read(path: Path) -> str:
    if not path.exists(): fail(f"missing file: {path}")
    return path.read_text(encoding="utf-8-sig")

def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")

def replace_once(text: str, old: str, new: str, label: str) -> str:
    count=text.count(old)
    if count != 1: fail(f"{label}: expected exactly one match, got {count}")
    return text.replace(old,new,1)

def remove_between(text: str, start: str, end: str, label: str) -> str:
    a=text.find(start); b=text.find(end,a+len(start)) if a>=0 else -1
    if a<0 or b<0 or b<=a: fail(f"{label}: marker not found")
    return text[:a] + end + text[b+len(end):]

ROOT=Path.cwd()
def patch_hardline(root: Path) -> None:
    path = root / "server/src/chain/hardline-scanner.ts"
    text = read(path)
    text = replace_once(text,"import { HIGH_DIALOGUE_PLATFORMS, resolveNovelStrategy, targetForLength } from './platform-benchmarks';","import { resolveNovelStrategy } from './platform-benchmarks';","hardline imports")
    start = "export const LANGUAGE_HARDLINE_RULE_IDS: readonly string[] = ["; end = "];\n\n/** 判断某条扫描命中是否属于跨平台语言硬伤"
    a=text.find(start); b=text.find(end,a)
    if a<0 or b<0: fail("hardline ids block not found")
    new_ids="""export const LANGUAGE_HARDLINE_RULE_IDS: readonly string[] = [
  // 只保留可确定验证的硬伤：明确元叙述、物理排版错误、实质重复、残句链、同构重复、量词错误和叠用标点。
  // 段长/句长/标点密度/词频/比喻/生理反应等启发式只能作为语义复核证据，不能直接阻断。
  '15c', '15d', '33', '35', '35b', '42', '44',
  '53-same-structure-parallel',
  '54-measure-word-mismatch', '56-punct-stacking',
];

/** 判断某条扫描命中是否属于跨平台语言硬伤"""
    text=text[:a]+new_ids+text[b+len("];\n\n/** 判断某条扫描命中是否属于跨平台语言硬伤"):]
    text=remove_between(text,"    // 第一人称纪实/悬疑内心流（知乎盐选、规则怪谈）对话天然偏少，对话占比红线由 8% 降到 5%\n","    // 文笔层硬线的风格分化（分化的是阈值，不是查不查）：白描/朴素/现实/日常是作者在项目卡片里选定的\n","hardline duplicate platform thresholds")
    text=remove_between(text,"    // 对话占比过低：爆款网文对话占比高（用对话推进剧情/交代设定/制造冲突）。\n","    // ===== 15d 第一人称对话框里偷切作者口吻 =====\n","hardline duplicate dialogue ratio")
    text=remove_between(text,"    // ===== 40 章首无强钩子","    // ===== 42 连续重复对答：无某种语气词或动作不能证明客服式对话 =====\n","hardline 40-41 proxies")
    text=remove_between(text,"    // ===== 43 无不完美细节","    // ===== 44 重复模板化转场 =====\n","hardline rule43 quota")
    text=remove_between(text,"    // ===== 45 无具体数字","    // ===== 46 刻意感官描写（AI最爱，新增） =====\n","hardline rule45 quota")
    replacements={
      '把其中至少两个动作合并进带目的或感受的完整句，只保留真正推进剧情的关键动作':'把其中至少两个既有动作按原有因果合并成完整句，只保留真正推进剧情的关键动作；不得补造目的、感受或新事件',
      '应把推理、交代、交锋改成一来一回的人物对话（电话、他人搭话、自言自语、多人场面），连续叙述不超过2段就用对话打断':'该信号只用于语义复核；不得为比例凭空新增电话、搭话、自言自语、人物或对话',
      '冷就说冷，疼就说疼，用直白动作代替':'只能精简或直述原文已经存在的感受/事实，不得新增身体动作、感官或时间事实',
      '直接描写事实，不用拟人':'若语义复核确认模板化，只能改写为原文已经存在的事实，不得新增情节事实',
      '用具体场景和动作代替':'若语义复核确认模板化，只能基于既有场景和动作改写，不得新造动作或场景',
      '删掉多余处，用对话/环境/动作替代':'删掉或合并冗余处；不得为了替换而新增对话、环境、动作或感官事实',
      '重复渲染处删掉或换成推进剧情的动作/对话':'重复渲染处删除或合并，只保留既有转场/情绪锚点；不得新增动作或对话事实',
      '能用具体动作、数字、物件与对话说清的，一律删掉模糊词直说；同一情绪点最多保留 1 处':'在原句事实不变前提下删除多余模糊词，或改成上下文已经存在的具体事实；不得新增动作、数字、物件或对话制造“具体感”',
      '绝大多数停顿改用逗号/句号或直接写动作，只保留真正欲言又止/中断的 1-2 处':'仅调整现有标点和句法，保留真正语义中断处；不得为了替代省略号新增动作或事实',
      '删掉为修辞而修辞的比喻，优先具体动作':'删除冗余比喻或直述原文已有事实；不得为了替换比喻新增具体动作',
    }
    for old,new in replacements.items(): text=text.replace(old,new)
    write(path,text)
    spec=root/"server/src/chain/hardline-scanner.spec.ts"; st=read(spec)
    st,count=re.subn(r"describe\('isLanguageHardline 阻断集合（AI 痕迹指纹 \+ 文笔/排版全部进硬伤，无降级旁路）', \(\) => \{.*?\n\}\);\n\n(?=describe\('normalizeProseLayout)","""describe('isLanguageHardline 阻断集合（只保留可确定证据）', () => {
  it('客观可复算/可定位的重复、格式和明确语言错误继续阻断保存', () => {
    for (const id of ['15c', '15d', '33', '35', '35b', '42', '44', '53-same-structure-parallel', '54-measure-word-mismatch', '56-punct-stacking']) expect(isLanguageHardline(id), id).toBe(true);
  });
  it('词频、段长、修辞、生理反应等启发式只作语义复核信号', () => {
    for (const id of ['15b', '20a', '34', 'list-enumeration', 'formula-sentence', 'dash-density', 'simile-density', '26-short-para', '26b-staccato', '32', '36', '37', '39', '46', '47', '48', '49', '50-fragment-action-chain', '51-modal-particle-density', '52-env-imagery-repeat', '55', '57-ellipsis-density']) expect(isLanguageHardline(id), id).toBe(false);
  });
  it('已退役的表面配额规则不再进入阻断集合', () => {
    for (const id of ['40', '40b-opening-conflict', '41', '43', '45', 'dialogue-ratio', '28a', '38', 'time-density']) expect(isLanguageHardline(id), id).toBe(false);
  });
});

""",st,count=1,flags=re.S)
    if count!=1: fail('hardline old blocking-policy test block not found')
    st=st.replace("it('阻断集合不变量：32 仍在 LANGUAGE_HARDLINE_RULE_IDS（本轮只是收紧判据，不是退出硬线）', () => {\n    expect(isLanguageHardline('32')).toBe(true);\n  });","it('32 仍可检测姓名孤立，但只作语义/排版复核信号，不直接阻断', () => {\n    expect(isLanguageHardline('32')).toBe(false);\n  });",1)
    appendix=r'''\n\ndescribe('system workflow rule governance regressions', () => {\n  it('does not hard-block surface quotas or word/punctuation frequency proxies', () => {\n    const prose = Array.from({ length: 12 }, (_, i) => `第${i + 1}段平静记录已经发生的工作与关系变化，不需要问号、感叹号、数字锚点或强制不完美细节来证明自然。`).join('\\n\\n');\n    const findings = detectForbiddenTells(prose, { platform: 'zhihu', storyType: 'short_story' });\n    const hard = findings.filter((item) => isLanguageHardline(item.ruleId)).map((item) => item.ruleId);\n    for (const id of ['41','43','45','dialogue-ratio','dash-density','simile-density','55','57-ellipsis-density','26-short-para','26b-staccato']) expect(hard).not.toContain(id);\n  });\n  it('keeps actual repeated prose/dialogue evidence in the deterministic blocking family', () => {\n    for (const id of ['35','35b','42','44','53-same-structure-parallel','54-measure-word-mismatch','56-punct-stacking']) expect(isLanguageHardline(id)).toBe(true);\n  });\n  it('treats stylistic templates and density signals as semantic-review evidence, not direct blockers', () => {\n    for (const id of ['15b','20a','34','list-enumeration','formula-sentence','dash-density','simile-density','36','37','39','46','47','48','49','50-fragment-action-chain','51-modal-particle-density','52-env-imagery-repeat','55','57-ellipsis-density']) expect(isLanguageHardline(id)).toBe(false);\n  });\n});\n'''
    if "system workflow rule governance regressions" not in st: st=st.rstrip()+appendix+"\n"
    write(spec,st)

patch_hardline(ROOT)
