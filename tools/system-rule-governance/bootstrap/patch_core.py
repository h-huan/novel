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
def patch_real_llm(root: Path) -> None:
    path = root / "server/src/chain/real-llm.service.ts"
    text = read(path)
    text, count = re.subn(
        r"\nconst EXECUTION_PREFLIGHT_DIRECTIVE = `【执行前置规则】[^`]+`;\n",
        "\n",
        text,
        count=1,
    )
    if count != 1:
        fail("real-llm: inline execution preflight not found")
    old = """    // 统一注入\"当前生效功能模块标准 + 原创横切标准\"（由 ModuleStandardsService 归纳维护，与具体模型版本解耦）；
    // 标准自身归纳等元任务以 injectStandard=false 关闭，避免递归污染。
    const standardDirective = request.injectStandard === false
      ? ''
      : standardDirectiveCache.get(request.scenario || 'daily', request.metrics?.stepKey);
    const effectiveSystemPrompt = [EXECUTION_PREFLIGHT_DIRECTIVE, request.systemPrompt, standardDirective]
      .filter(s => typeof s === 'string' && s.trim()).join('\\n\\n');"""
    new = """    // 公共小说规则只从 System Workflow Rule Registry 的运行时投影注入。
    // injectStandard=false 用于元任务：必须真正关闭公共规则，不能留下调用器内联的第二套前置规则。
    const standardDirective = request.injectStandard === false
      ? ''
      : standardDirectiveCache.get(request.scenario || 'daily', request.metrics?.stepKey);
    const effectiveSystemPrompt = [request.systemPrompt, standardDirective]
      .filter(s => typeof s === 'string' && s.trim()).join('\\n\\n');"""
    text = replace_once(text, old, new, "real-llm registry injection")
    write(path, text)


def patch_generation_metrics(root: Path) -> None:
    path = root / "server/src/modules/generation-metrics/generation-metrics.service.ts"
    text = read(path)
    old_return = "return { id, constitution, stage, context, projectId, previousChapters, characterNames, lessons };"
    new_return = """return {
      id, constitution, stage, context, projectId, previousChapters, characterNames, lessons,
      rulesetVersion: standards.rulesetVersion,
      rulesetDigest: standards.registryDigest,
      ruleIds: standards.ruleIds,
    };"""
    text = replace_once(text, old_return, new_return, "generation run ruleset return")

    helper_marker = "@Injectable()\nexport class GenerationMetricsService implements OnModuleInit {"
    helper = """export function generationRulesetSnapshotIsCurrent(
  rawSnapshot: unknown,
  currentRulesetVersion: number,
  currentRegistryDigest: string,
): boolean {
  if (typeof rawSnapshot !== 'string' || !rawSnapshot.trim()) return false;
  try {
    const snapshot = JSON.parse(rawSnapshot) as { rulesetVersion?: number; registryDigest?: string };
    return snapshot.rulesetVersion === currentRulesetVersion
      && snapshot.registryDigest === currentRegistryDigest;
  } catch {
    return false;
  }
}

@Injectable()
export class GenerationMetricsService implements OnModuleInit {"""
    text = replace_once(text, helper_marker, helper, "generation ruleset helper")

    old = """  runIsCurrent(runId: string, projectId: string): boolean {\n    const db = this.databaseService.getDb();\n    const run = db.prepare('SELECT constitution_json,context_snapshot,stage,chapter_index FROM generation_runs WHERE id=? AND project_id=?').get(runId, projectId) as any;\n    const row = db.prepare('SELECT * FROM projects WHERE id=?').get(projectId) as any;\n    return !!run && !!row && run.constitution_json === JSON.stringify(readConstitution(row))\n      && run.context_snapshot === this.qualityContext(projectId, run.stage, run.chapter_index);\n  }"""
    new = """  runIsCurrent(runId: string, projectId: string): boolean {
    const db = this.databaseService.getDb();
    const run = db.prepare('SELECT constitution_json,context_snapshot,standards_snapshot,stage,chapter_index FROM generation_runs WHERE id=? AND project_id=?').get(runId, projectId) as any;
    const row = db.prepare('SELECT * FROM projects WHERE id=?').get(projectId) as any;
    return !!run && !!row
      && run.constitution_json === JSON.stringify(readConstitution(row))
      && run.context_snapshot === this.qualityContext(projectId, run.stage, run.chapter_index)
      && generationRulesetSnapshotIsCurrent(
        run.standards_snapshot,
        standardDirectiveCache.getRulesetVersion(),
        standardDirectiveCache.getRulesetDigest(),
      );
  }"""
    text = replace_once(text, old, new, "generation run ruleset expiry")
    write(path, text)


def patch_idea(root: Path) -> None:
    contract = root / "server/src/chain/idea-discovery-contract.ts"
    text = read(contract)
    text, count = re.subn(
        r"/\*\*\n \* 灵感发现的 hook 生成契约必须与 IdeaAppealGateService 使用同一口径。\n \* 这里是生成侧唯一文案来源，避免 Prompt 要求和 Gate 判据再次漂移。\n \*/\nexport const SHORT_IDEA_HOOK_MIN_SIGNALS = 3;\n\n",
        "",
        text,
        count=1,
    )
    if count != 1:
        fail("idea-discovery: fixed hook signal constant not found")
    old = "return `35-80字；${storyFirst}；hook 应自然形成异常/信息差、明确代价或时限、主角具体行动/选择、关系锚点中的至少 ${SHORT_IDEA_HOOK_MIN_SIGNALS} 类有效信号，其中必须包含主角具体行动或明确选择；其余两类按故事本身决定，不要求固定组合，也不能把关键行动/选择只藏在 description 里`;"
    new = "return `35-80字；${storyFirst}；必须让读者看见主角正在做什么或明确选择什么，并自然给出至少一个来自本故事自身的继续阅读理由，例如现实代价、关系冲突、资源争夺、信息差、迫近后果或未解问题。不得按关键词数量或固定信号个数凑 Gate，也不能把关键行动/选择只藏在 description 里`;"
    text = replace_once(text, old, new, "idea hook requirement")
    write(contract, text)

    gate = root / "server/src/chain/idea-appeal-gate.service.ts"
    text = read(gate)
    text = replace_once(
        text,
        "import { SHORT_IDEA_HOOK_MIN_SIGNALS, selectedPremiseEvidenceForIdeaCard } from './idea-discovery-contract';",
        "import { selectedPremiseEvidenceForIdeaCard } from './idea-discovery-contract';",
        "idea gate import",
    )
    text = text.replace("    const hookSignalCount = [hookHasAnomaly, hookHasPressure, hookHasAgency, hookHasRelationship].filter(Boolean).length;\n", "", 1)
    blocker = "      if (hookSignalCount < SHORT_IDEA_HOOK_MIN_SIGNALS) issues.push(`短篇首屏钩子信息过弱：异常/压力/行动/关系至少应形成 ${SHORT_IDEA_HOOK_MIN_SIGNALS} 个有效信号`);\n"
    if blocker not in text:
        fail("idea gate fixed signal blocker not found")
    text = text.replace(blocker, "", 1)
    text = text.replace(
        "    if (!titleAnchored) issues.push('标题没有稳定锚定本故事的具体人物/规则/关系/异常，或仍是可替换套名');",
        "    if (!title || GENERIC_TITLE.test(title)) issues.push('标题为空或仍是可替换到任意故事的套名');\n    else if (!titleAnchored) warnings.push('标题与题材卡的具体锚点关联偏弱；交由标题语义审查确认，不凭字面重合直接淘汰');",1)
    text = text.replace("    if (descriptionProgressions < (storyType === 'short_story' ? 2 : 3)) issues.push('故事推进只有一个点子，缺少可持续升级链');","    if (descriptionProgressions < (storyType === 'short_story' ? 2 : 3)) warnings.push('词面推进标志偏少；仅作为风险信号，需结合结构化 escalation/反转/兑现证据判断真实升级链');",1)
    text = text.replace("    if (!openingDeliversPromise) issues.push('开篇钩子与核心卖点/冲突脱节，阅读承诺不能尽早兑现');","    if (!openingDeliversPromise && !selectedOpeningEvidence) warnings.push('开篇与核心卖点的词面重合偏弱；交由结构化题材证据/语义审查确认，不按 n-gram 重合硬阻断');",1)
    text = text.replace("    if (!reversalConsequential) issues.push('核心反转只是在补充信息，没有改变目标、关系、胜负条件或代价');","    if (!reversalConsequential && boundPremiseEvidence && evidenceText('reversalEffect').length < 8) issues.push('结构化题材证据缺少会改变目标、关系、胜负条件或代价的反转效果');\n    else if (!reversalConsequential) warnings.push('词面未识别到反转后果；不能只凭关键词缺失判失败');",1)
    text = text.replace("    if (storyType === 'short_story' && !payoffPromise) issues.push('短篇只有吊胃口，没有明确的中后段/终局兑现承诺');","    if (storyType === 'short_story' && !payoffPromise && boundPremiseEvidence && evidenceText('payoff').length < 8) issues.push('结构化题材证据缺少短篇中后段/终局兑现承诺');\n    else if (storyType === 'short_story' && !payoffPromise) warnings.push('词面未识别到兑现承诺；交由结构化 payoff/语义审查确认');",1)
    text = text.replace("    if (!lifeAnchor) issues.push('缺少可代入的人生利益或关系锚点：题材机制尚未落到家庭、工作、钱、尊严、健康、归属、责任或生存等具体代价');","    if (!lifeAnchor) warnings.push('词面未识别到生活利益锚点；不能因词表未命中直接淘汰现实、幻想或特殊题材');",1)
    text = text.replace("    if (!aspiration) issues.push('主角缺少清晰的生活期盼/欲望：读者不知道他真正想得到、守住、夺回或改变什么');","    if (!aspiration && boundPremiseEvidence && evidenceText('activeChoice').length < 8) issues.push('结构化题材证据没有主角明确行动/选择，无法形成可执行目标');\n    else if (!aspiration) warnings.push('词面未识别到欲望表达；不能只凭“想要/希望”等词缺失判失败');",1)
    text = text.replace("    if (!sustainedSuspense) issues.push('缺少可贯穿阶段的核心追问，故事没有稳定的“还想知道什么”');","    if (!sustainedSuspense && boundPremiseEvidence && evidenceText('readerQuestion').length < 8) issues.push('结构化题材证据缺少可贯穿阶段的核心追问');\n    else if (!sustainedSuspense) warnings.push('词面未识别到悬念表达；不能只凭疑问词/悬念词缺失判失败');",1)
    text = text.replace("    if (simpleMoralMechanismRisk) issues.push('题材仍是“某种行为→直接受到超常惩罚/报应”的单层寓言机制，缺少会改写利益、关系或选择的第二层后果');","    if (simpleMoralMechanismRisk && boundPremiseEvidence && evidenceText('secondOrderConsequence').length < 8) issues.push('结构化题材证据仍缺少第二层后果，当前机制容易退化为单层因果寓言');\n    else if (simpleMoralMechanismRisk) warnings.push('词面呈现单层因果寓言风险；需结合 secondOrderConsequence 语义证据确认');",1)
    old_distinct = """    const minDistinctiveness = storyType === 'short_story' ? 6 : 5;\n    if (distinctivenessScore < minDistinctiveness) issues.push(`题材差异度不足（${distinctivenessScore}/10）：具体生活载体、反预期、两难选择和二阶后果至少要形成稳定组合，而不是字段齐全即可通过`);"""
    new_distinct = """    const minDistinctiveness = storyType === 'short_story' ? 6 : 5;
    if (boundPremiseEvidence) {
      const structuredDistinctive = [
        evidenceText('irreplaceableCarrier'), evidenceText('differentiation'), evidenceText('secondOrderConsequence'),
      ].filter((value) => value.length >= 8).length;
      if (structuredDistinctive === 0) issues.push('结构化题材证据缺少不可替代载体、差异化或二阶后果，题材身份仍不足');
    }
    if (distinctivenessScore < minDistinctiveness) warnings.push(`词面差异度代理分偏低（${distinctivenessScore}/10）；仅用于排序/复核，不作为固定 N-of-M Hard Gate`);"""
    text = replace_once(text, old_distinct, new_distinct, "idea distinctiveness proxy")
    write(gate, text)

    spec = root / "server/src/chain/idea-discovery-contract.spec.ts"
    text = read(spec)
    text = text.replace("  SHORT_IDEA_HOOK_MIN_SIGNALS,\n", "", 1)
    hook_test_start = "  it('treats hook generation as expression of a preselected story rather than another search stage', () => {"
    long_test_start = "  it('keeps long-story hooks actionable without forcing short-story signal density', () => {"
    a = text.find(hook_test_start); b = text.find(long_test_start, a)
    if a < 0 or b < 0: fail("idea discovery hook contract tests not found")
    replacement = """  it('treats hook generation as expression of a preselected story rather than another search stage', () => {
    const contract = ideaHookRequirement('short_story');
    expect(contract).toContain('题材已经通过完整题材卡创建前的轻量候选池筛选');
    expect(contract).toContain('这里只把该题材最有吸引力的起始事件准确压缩成 hook');
    expect(contract).toContain('不再重新选题、换题');
    expect(contract).toContain('主角正在做什么或明确选择什么');
    expect(contract).toContain('继续阅读理由');
    expect(contract).toContain('现实代价');
    expect(contract).toContain('关系冲突');
    expect(contract).toContain('信息差');
    expect(contract).toContain('未解问题');
    expect(contract).toContain('不得按关键词数量或固定信号个数凑 Gate');
    expect(contract).not.toContain('内部广泛寻找');
    expect(contract).not.toContain('补足缺少');
  });

"""
    text = text[:a] + replacement + text[b:]
    text = text.replace("    expect(contract).not.toContain(`至少 ${SHORT_IDEA_HOOK_MIN_SIGNALS} 类有效信号`);\n","    expect(contract).not.toContain('固定信号个数');\n",1)
    write(spec, text)

    gate_spec = root / "server/src/chain/idea-appeal-gate.service.spec.ts"
    gst = read(gate_spec)
    gst = gst.replace("import { IdeaAppealGateService } from './idea-appeal-gate.service';","import { IdeaAppealGateService } from './idea-appeal-gate.service';\nimport { bindStructuredIdeaCardToPremise } from './idea-discovery-contract';",1)
    gst = gst.replace("    expect(assessment.issues.length).toBeGreaterThan(3);","    expect(assessment.issues.length).toBeGreaterThanOrEqual(2);",1)
    gst = gst.replace("    expect(assessment.readerExperienceProfile.evidence.aspiration).toBe(false);","    expect(assessment.readerExperienceProfile.evidence.aspiration).toBe(false);\n    expect(assessment.warnings.some((item) => item.includes('生活利益锚点'))).toBe(true);",1)
    gst = gst.replace("    expect(assessment.passed).toBe(false);\n    expect(assessment.readerExperienceProfile.evidence.stackingRisk).toBe(true);\n    expect(assessment.warnings.some((item) => item.includes('盲目叠加'))).toBe(true);\n    expect(assessment.issues.some((item) => item.includes('人生利益'))).toBe(true);","    expect(assessment.readerExperienceProfile.evidence.stackingRisk).toBe(true);\n    expect(assessment.warnings.some((item) => item.includes('盲目叠加'))).toBe(true);\n    expect(assessment.warnings.some((item) => item.includes('生活利益锚点'))).toBe(true);",1)
    gst = gst.replace("    expect(assessment.passed).toBe(false);\n    expect(assessment.signals.simpleMoralMechanismRisk).toBe(true);\n    expect(assessment.signals.distinctivenessScore).toBeLessThan(6);\n    expect(assessment.issues.some((item) => item.includes('单层寓言机制'))).toBe(true);","    expect(assessment.signals.simpleMoralMechanismRisk).toBe(true);\n    expect(assessment.signals.distinctivenessScore).toBeLessThan(6);\n    expect(assessment.warnings.some((item) => item.includes('单层因果寓言风险'))).toBe(true);\n    expect(assessment.issues.some((item) => item.includes('单层寓言机制'))).toBe(false);",1)
    anchor = "  it('accepts a distinctive story whose ending promise is expressed through the forced choice and its second-order consequence', () => {"
    if anchor not in gst: fail("idea appeal gate spec insertion anchor missing")
    semantic_test = """  it('blocks missing semantic evidence on a server-bound premise instead of counting surface keywords', () => {
    const premise = {
      premiseId: 'P-semantic', protagonistSituation: '主角必须处理会直接影响自己生活的现实处境',
      openingEvent: '一个具体事件迫使主角当天作出决定', coreConflict: '两个不能同时满足的现实目标发生冲突',
      activeChoice: '主角明确选择先处理其中一个目标并承担代价', escalation: '这个选择使冲突升级并影响另一段关系',
      reversalEffect: '', payoff: '', irreplaceableCarrier: '', secondOrderConsequence: '',
      readerQuestion: '主角的选择最终会改变谁的利益和关系？', differentiation: '',
    };
    const card = bindStructuredIdeaCardToPremise(premise, [{
      title: '当天必须作出的选择',
      hook: '这是一段足够长的自然钩子，主角已经作出明确选择，但文本不靠固定异常、压力、关系关键词凑数量。',
      description: '故事沿这个选择继续推进并产生新的关系后果。', protagonist: '有具体生活目标的主角',
      coreConflict: '两个现实目标不能同时满足。', uniquePoint: '冲突载体仍需要结构化证据证明不可替代。', mainReversal: '后来出现新信息。',
    }]);
    const assessment = gate.assess(card, 'short_story');
    expect(assessment.passed).toBe(false);
    expect(assessment.issues.some((item) => item.includes('反转效果'))).toBe(true);
    expect(assessment.issues.some((item) => item.includes('终局兑现承诺'))).toBe(true);
    expect(assessment.issues.some((item) => item.includes('题材身份仍不足'))).toBe(true);
    expect(assessment.issues.some((item) => item.includes('至少应形成'))).toBe(false);
  });

"""
    if "P-semantic" not in gst: gst = gst.replace(anchor, semantic_test + anchor, 1)
    write(gate_spec, gst)

patch_real_llm(ROOT)
patch_generation_metrics(ROOT)
patch_idea(ROOT)
