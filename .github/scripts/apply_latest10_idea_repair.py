from pathlib import Path

contract_path = Path('server/src/chain/idea-discovery-contract.ts')
contract = contract_path.read_text(encoding='utf-8')
if 'applyOrderedIdeaRepairPatches' in contract:
    raise SystemExit('latest10 repair helper already exists')
helper_anchor = 'export function ideaHookRequirement(storyType: IdeaStoryType): string {'
if helper_anchor not in contract:
    raise SystemExit('idea contract insertion anchor missing')
helper = r'''const IDEA_GATE_REPAIR_TEXT_FIELDS = [
  'hook',
  'description',
  'coreConflict',
  'uniquePoint',
  'mainReversal',
] as const;

const IDEA_GATE_REPAIR_NOVELTY_FIELDS = [
  'familiarShell',
  'uncommonCombination',
  'avoidedPatterns',
  'irreplaceableWhy',
  'secondOrderConsequence',
  'readerQuestion',
] as const;

function ideaRepairRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function withoutIdeaInternalIdentity(value: unknown, internalField: string): Record<string, unknown> {
  const record = ideaRepairRecord(value) || {};
  return Object.fromEntries(Object.entries(record).filter(([key]) => key !== internalField));
}

/**
 * 最终 Gate 的一次同题材局部修复协议。
 * premise/card 的内部身份由服务器按数组位置持有，不交给模型回传，避免真实模型遗漏 opaque id
 * 就把整批题材判成失败。模型只负责修 Gate 点名的可读字段。
 */
export function ideaGateLocalRepairDirective(
  targets: readonly Array<{ premise?: unknown; card?: unknown; gateIssues?: unknown }>,
): string {
  const safeTargets = targets.map((target, index) => ({
    position: index + 1,
    premise: withoutIdeaInternalIdentity(target?.premise, 'premiseId'),
    card: withoutIdeaInternalIdentity(target?.card, 'sourcePremiseId'),
    gateIssues: Array.isArray(target?.gateIssues) ? target.gateIssues.map(String) : [],
  }));
  return `【最终 Gate·同题材有序局部修复】
下面 ${safeTargets.length} 项已经完成创建前筛选和完整题材卡结构化。服务器已经锁定每一项的题材身份，你不负责回传、生成或修改内部标识，也不得换题。
1. patches 数组必须恰好 ${safeTargets.length} 项，并严格按输入 position 的顺序逐项对应；每项只写需要修改的字段。
2. 顶层只允许 hook、description、coreConflict、uniquePoint、mainReversal；noveltyProof 内只允许 familiarShell、uncommonCombination、avoidedPatterns、irreplaceableWhy、secondOrderConsequence、readerQuestion。不要输出标题、平台、分类、篇幅、章数、标签或任何内部标识。
3. 只修 gateIssues 点名的表达证据，让原故事已有的异常/信息差、现实压力、主角行动、关系、因果升级、反转和二阶后果更清楚；禁止新增另一套案件、能力、身份、亲属关系或结局。
4. 某字段无需改就省略；禁止用空字符串删除原证据。服务器只会合并白名单内的非空文本，其余输出会被忽略。
5. 只输出一个 JSON 对象：{"patches":[{...}]}，不输出分析、Markdown 或额外文字。
【按顺序待修复内容】
${JSON.stringify(safeTargets)}`;
}

/**
 * 把模型返回的有序局部补丁合回服务器持有的原卡。
 * 只允许白名单文本字段单调覆盖；题材身份、标题、平台、分类、篇幅和用户配置始终取原卡。
 */
export function applyOrderedIdeaRepairPatches(
  cards: readonly Record<string, unknown>[],
  rawPatches: unknown,
): Array<Record<string, unknown>> {
  if (!Array.isArray(rawPatches) || rawPatches.length !== cards.length) {
    const actual = Array.isArray(rawPatches) ? rawPatches.length : 0;
    throw new Error(`最终 Gate 定向局部修复返回 ${actual} 个有序补丁，期望 ${cards.length} 个；题材身份仍由系统保留，不会用别的题材补位。`);
  }

  return cards.map((card, index) => {
    const patch = ideaRepairRecord(rawPatches[index]);
    if (!patch) {
      throw new Error(`最终 Gate 定向局部修复第 ${index + 1} 项不是对象；系统不会猜测它对应哪个题材。`);
    }
    const next: Record<string, unknown> = { ...card };
    for (const field of IDEA_GATE_REPAIR_TEXT_FIELDS) {
      const value = typeof patch[field] === 'string' ? String(patch[field]).trim() : '';
      if (value) next[field] = value;
    }

    const noveltyPatch = ideaRepairRecord(patch.noveltyProof);
    if (noveltyPatch) {
      const existingNovelty = ideaRepairRecord(card.noveltyProof) || {};
      const acceptedNovelty: Record<string, unknown> = {};
      for (const field of IDEA_GATE_REPAIR_NOVELTY_FIELDS) {
        const value = typeof noveltyPatch[field] === 'string' ? String(noveltyPatch[field]).trim() : '';
        if (value) acceptedNovelty[field] = value;
      }
      if (Object.keys(acceptedNovelty).length > 0) {
        next.noveltyProof = { ...existingNovelty, ...acceptedNovelty };
      }
    }

    // 显式恢复服务器持有的身份，哪怕模型在未知字段里试图改写也不会生效。
    next.sourcePremiseId = card.sourcePremiseId;
    return next;
  });
}

'''
contract = contract.replace(helper_anchor, helper + helper_anchor, 1)
contract_path.write_text(contract, encoding='utf-8')

controller_path = Path('server/src/chain/chain.controller.ts')
controller = controller_path.read_text(encoding='utf-8')
old_import = "import { ideaCardStructuringDirective, ideaHookRequirement, ideaPremiseSelectionDirective, normalizePremiseSelectionPayload } from './idea-discovery-contract';"
new_import = "import { applyOrderedIdeaRepairPatches, ideaCardStructuringDirective, ideaGateLocalRepairDirective, ideaHookRequirement, ideaPremiseSelectionDirective, normalizePremiseSelectionPayload } from './idea-discovery-contract';"
if old_import not in controller:
    raise SystemExit('idea discovery import anchor missing')
controller = controller.replace(old_import, new_import, 1)

start_marker = '        const repairResponse = await this.realLLM.generate({'
end_marker = "        accept(repairedCards, 'repair');"
start = controller.find(start_marker)
end = controller.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit('final gate repair block anchor missing')
end += len(end_marker)
new_block = r'''        const repairResponse = await this.realLLM.generate({
          prompt: `${buildPlatformStyleDirective(dto.platform, dto.storyType, dto.customPlatformNote)}\n${ideaGateLocalRepairDirective(repairTargets)}`,
          scenario: 'idea_generate',
          timeout: LLM_TUNABLES.timeoutSimple(),
          maxEmptyRetries: 1,
          responseFormat: 'json_object',
        });
        const repairPayload = this.safeExtractJson<Record<string, unknown>>(String(repairResponse.content || ''), {});
        const repairPatches = Array.isArray(repairPayload?.patches) ? repairPayload.patches : [];
        finalGateRepairGenerated = repairPatches.length;
        try {
          const repairedCards = applyOrderedIdeaRepairPatches(
            repairTargets.map((target: any) => target.card as Record<string, unknown>),
            repairPatches,
          );
          accept(repairedCards, 'repair');
        } catch (repairError) {
          finalGateRepairError = repairError instanceof Error ? repairError.message : String(repairError);
          this.logger.warn(`idea-discover: 最终 Gate 同题材局部修复协议未完成：${finalGateRepairError}`);
        }'''
controller = controller[:start] + new_block + controller[end:]

old_decl = "      let finalGateRepairAttempted = false;\n      let finalGateRepairGenerated = 0;"
new_decl = "      let finalGateRepairAttempted = false;\n      let finalGateRepairGenerated = 0;\n      let finalGateRepairError: string | null = null;"
if old_decl not in controller:
    raise SystemExit('repair audit declaration anchor missing')
controller = controller.replace(old_decl, new_decl, 1)

old_audit = "        schemaVersion: 5,\n        mode: 'premise_preselection_then_final_gate_bounded_repair',"
new_audit = "        schemaVersion: 6,\n        mode: 'premise_preselection_then_final_gate_bounded_repair',\n        repairProtocol: 'ordered_local_patch_server_owned_identity',"
if old_audit not in controller:
    raise SystemExit('appeal gate schema anchor missing')
controller = controller.replace(old_audit, new_audit, 1)
old_repair_audit = "        repairAttempted: finalGateRepairAttempted,\n        repairGenerated: finalGateRepairGenerated,"
new_repair_audit = "        repairAttempted: finalGateRepairAttempted,\n        repairGenerated: finalGateRepairGenerated,\n        repairError: finalGateRepairError,"
if old_repair_audit not in controller:
    raise SystemExit('repair audit fields anchor missing')
controller = controller.replace(old_repair_audit, new_repair_audit, 1)
old_note = "        note: '先完成轻量题材池筛选，再结构化完整卡；最终 Gate 未通过时只允许对原 premise 做一次定向局部修复。修复后仍不足请求数量则整次失败，绝不返回部分成功。',"
new_note = "        note: '先完成轻量题材池筛选，再结构化完整卡；最终 Gate 未通过时只允许对原 premise 做一次有序局部字段修复，题材身份由服务器持有。修复后仍不足请求数量则整次失败，绝不返回部分成功。',"
if old_note not in controller:
    raise SystemExit('appeal gate note anchor missing')
controller = controller.replace(old_note, new_note, 1)
old_error = "          error: `请求 ${requestedCount} 个可选题材，但最终 Gate 与一次定向局部修复后只有 ${selectedAccepted.length} 个通过；系统不会把部分结果伪装成完整成功。请重新发现。`,"
new_error = "          error: finalGateRepairError\n            ? `请求 ${requestedCount} 个可选题材，但最终 Gate 的同题材局部修复协议未完成：${finalGateRepairError} 系统不会把部分结果伪装成完整成功。`\n            : `请求 ${requestedCount} 个可选题材，但最终 Gate 与一次定向局部修复后只有 ${selectedAccepted.length} 个通过；系统不会把部分结果伪装成完整成功。请重新发现。`,"
if old_error not in controller:
    raise SystemExit('final failure error anchor missing')
controller = controller.replace(old_error, new_error, 1)
if '最终 Gate 定向修复必须逐一返回原未通过题材' in controller:
    raise SystemExit('old opaque-id repair error still present')
if '每张必须原样保留 sourcePremiseId' in controller:
    raise SystemExit('old model-owned identity prompt still present')
controller_path.write_text(controller, encoding='utf-8')

spec_path = Path('server/src/chain/idea-discovery-contract.spec.ts')
spec = spec_path.read_text(encoding='utf-8')
old_import_part = "  SHORT_IDEA_HOOK_MIN_SIGNALS,\n  ideaCardStructuringDirective,"
new_import_part = "  SHORT_IDEA_HOOK_MIN_SIGNALS,\n  applyOrderedIdeaRepairPatches,\n  ideaCardStructuringDirective,\n  ideaGateLocalRepairDirective,"
if old_import_part not in spec:
    raise SystemExit('contract spec import anchor missing')
spec = spec.replace(old_import_part, new_import_part, 1)
insert_before = "\n  it('treats hook generation as expression of a preselected story rather than another search stage', () => {"
if insert_before not in spec:
    raise SystemExit('contract spec insertion anchor missing')
new_tests = r'''
  it('keeps final-gate premise identity on the server instead of asking the model to echo opaque ids', () => {
    const directive = ideaGateLocalRepairDirective([
      {
        premise: { premiseId: 'P11', workingTitle: '旧味甜汤', storyCore: '主角从一碗甜汤查出旧案' },
        card: { sourcePremiseId: 'P11', title: '旧味甜汤', hook: '原钩子' },
        gateIssues: ['核心钩子信息过弱'],
      },
      {
        premise: { premiseId: 'P14', workingTitle: '假契', storyCore: '主角公开念出假契' },
        card: { sourcePremiseId: 'P14', title: '假契', hook: '原钩子二' },
        gateIssues: ['推进链证据不足'],
      },
    ]);

    expect(directive).toContain('patches 数组必须恰好 2 项');
    expect(directive).toContain('严格按输入 position 的顺序逐项对应');
    expect(directive).not.toContain('P11');
    expect(directive).not.toContain('P14');
    expect(directive).not.toContain('sourcePremiseId');
    expect(directive).not.toContain('premiseId');
  });

  it('merges ordered local patches without allowing the model to replace identity or project settings', () => {
    const cards = [{
      sourcePremiseId: 'P11',
      title: '旧标题',
      targetPlatform: 'fanqie',
      storyCategory: '悬疑',
      estimatedWords: 20000,
      hook: '旧钩子',
      description: '旧概要',
      noveltyProof: {
        familiarShell: '旧外壳',
        readerQuestion: '旧追问',
        secondOrderConsequence: '旧二阶后果',
      },
    }];
    const repaired = applyOrderedIdeaRepairPatches(cards, [{
      sourcePremiseId: 'PX',
      title: '模型试图换标题',
      targetPlatform: 'other',
      estimatedWords: 1,
      hook: '把原故事已有的压力与主动行动写清楚',
      noveltyProof: {
        readerQuestion: '新的具体追问是什么？',
        unknownField: '不得进入',
      },
      unknownTopLevel: '不得进入',
    }]);

    expect(repaired).toHaveLength(1);
    expect(repaired[0].sourcePremiseId).toBe('P11');
    expect(repaired[0].title).toBe('旧标题');
    expect(repaired[0].targetPlatform).toBe('fanqie');
    expect(repaired[0].estimatedWords).toBe(20000);
    expect(repaired[0].hook).toBe('把原故事已有的压力与主动行动写清楚');
    expect((repaired[0].noveltyProof as any).familiarShell).toBe('旧外壳');
    expect((repaired[0].noveltyProof as any).readerQuestion).toBe('新的具体追问是什么？');
    expect((repaired[0].noveltyProof as any).unknownField).toBeUndefined();
    expect(repaired[0].unknownTopLevel).toBeUndefined();
  });

  it('requires one ordered patch per failed card but never requires a premise id in the patch itself', () => {
    const cards = [
      { sourcePremiseId: 'P11', hook: '旧钩子一' },
      { sourcePremiseId: 'P14', hook: '旧钩子二' },
    ];
    expect(() => applyOrderedIdeaRepairPatches(cards, [{ hook: '只返回一项' }]))
      .toThrow('期望 2 个');
    expect(applyOrderedIdeaRepairPatches(cards, [
      { hook: '修复后的钩子一' },
      { hook: '修复后的钩子二' },
    ]).map(item => item.sourcePremiseId)).toEqual(['P11', 'P14']);
  });
'''
spec = spec.replace(insert_before, '\n' + new_tests + insert_before, 1)
spec_path.write_text(spec, encoding='utf-8')

arch_path = Path('server/src/chain/chain-route-architecture.spec.ts')
arch = arch_path.read_text(encoding='utf-8')
anchor = "    expect(source).toContain('finalGateRepairAttempted');\n"
if anchor not in arch:
    raise SystemExit('architecture spec final gate anchor missing')
extra = "    expect(source).toContain(\"repairProtocol: 'ordered_local_patch_server_owned_identity'\");\n    expect(source).toContain('applyOrderedIdeaRepairPatches');\n    expect(source).toContain('ideaGateLocalRepairDirective');\n    expect(source).not.toContain('最终 Gate 定向修复必须逐一返回原未通过题材');\n    expect(source).not.toContain('每张必须原样保留 sourcePremiseId');\n"
arch = arch.replace(anchor, anchor + extra, 1)
arch_path.write_text(arch, encoding='utf-8')
