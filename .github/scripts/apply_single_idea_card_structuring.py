from pathlib import Path

contract_path = Path('server/src/chain/idea-discovery-contract.ts')
contract = contract_path.read_text(encoding='utf-8')
start = contract.find('export function ideaCardStructuringDirective(')
end = contract.find('\nconst IDEA_GATE_REPAIR_TEXT_FIELDS', start)
if start < 0 or end < 0:
    raise SystemExit('idea card structuring directive anchors missing')
new_contract_block = r'''export function ideaCardStructuringDirective(
  selectedPremise: Record<string, unknown>,
): string {
  const safePremise = Object.fromEntries(
    Object.entries(selectedPremise || {}).filter(([key]) => key !== 'premiseId'),
  );
  return `【完整题材卡结构化】
这个题材胚子已经在“完整题材卡创建前筛选”阶段被选中。现在只负责把这一项结构化成恰好 1 张完整题材卡，不再重新选题。
- 服务器已经锁定题材身份；不要输出 premiseId、sourcePremiseId 或任何内部标识，系统会在返回后绑定原题材身份。
- 禁止替换、合并、拆分、另造题材，禁止因为某字段难写就把故事换成更容易过 Gate 的套路。
- hook、description、coreConflict、mainReversal、uniquePoint、noveltyProof 必须展开同一个已选胚子的因果链；只能补足表达和可执行细节，不能改变胚子的核心人物处境、主动选择、升级机制、反转效果与兑现方向。
- 最终 Gate 只做独立验收；若这一张结构化后仍不成立，系统应暴露这一题材的管线失败，而不是自动补生或改写其它题材。
【已选题材胚子（内部标识已由服务器移除）】
${JSON.stringify(safePremise)}`;
}

/**
 * 每个已选 premise 独立结构化一张完整题材卡。
 * 模型只负责卡片内容；opaque premise 身份始终由服务器绑定，避免批量大 JSON 少卡或错 ID。
 */
export function bindStructuredIdeaCardToPremise(
  selectedPremise: Record<string, unknown>,
  rawIdeas: unknown,
): Record<string, unknown> {
  const premiseId = String(selectedPremise?.premiseId || '').trim();
  const label = String(selectedPremise?.workingTitle || premiseId || '未知题材').trim();
  if (!premiseId) throw new Error('完整题材卡结构化缺少服务器持有的 premiseId。');
  const ideas = Array.isArray(rawIdeas) ? rawIdeas : [];
  if (ideas.length !== 1) {
    throw new Error(`题材“${label}”的完整题材卡结构化返回 ${ideas.length} 张，期望恰好 1 张；系统不会换题、补题或重复改写其它题材。`);
  }
  const rawCard = ideas[0];
  if (!rawCard || typeof rawCard !== 'object' || Array.isArray(rawCard)) {
    throw new Error(`题材“${label}”的完整题材卡不是合法对象；系统不会猜测或换题。`);
  }
  const safeCard = Object.fromEntries(
    Object.entries(rawCard as Record<string, unknown>)
      .filter(([key]) => key !== 'sourcePremiseId' && key !== 'premiseId'),
  );
  return { ...safeCard, sourcePremiseId: premiseId };
}
'''
contract = contract[:start] + new_contract_block + contract[end:]
contract_path.write_text(contract, encoding='utf-8')

controller_path = Path('server/src/chain/chain.controller.ts')
controller = controller_path.read_text(encoding='utf-8')
old_import = "import { applyOrderedIdeaRepairPatches, ideaCardStructuringDirective, ideaGateLocalRepairDirective, ideaHookRequirement, ideaPremiseSelectionDirective, normalizePremiseSelectionPayload } from './idea-discovery-contract';"
new_import = "import { applyOrderedIdeaRepairPatches, bindStructuredIdeaCardToPremise, ideaCardStructuringDirective, ideaGateLocalRepairDirective, ideaHookRequirement, ideaPremiseSelectionDirective, normalizePremiseSelectionPayload } from './idea-discovery-contract';"
if old_import not in controller:
    raise SystemExit('idea discovery import anchor missing')
controller = controller.replace(old_import, new_import, 1)

old_schema_prefix = '`{\\"ideas\\":[{\\"sourcePremiseId\\":\\"P1\\",\\"title\\"'
new_schema_prefix = '`{\\"ideas\\":[{\\"title\\"'
if old_schema_prefix not in controller:
    raise SystemExit('output schema sourcePremiseId anchor missing')
controller = controller.replace(old_schema_prefix, new_schema_prefix, 1)

old_auto = "，同批题材尽量采用不同组合`"
new_auto = "，为当前已选题材选择最契合的组合，不得为了追求差异改写题材`"
if old_auto not in controller:
    raise SystemExit('auto-selection batch wording anchor missing')
controller = controller.replace(old_auto, new_auto, 1)

old_signature = '''      const buildPrompt = (\n        count: number,\n        excludes: Array<{ title: string; hook?: string; description?: string }>,\n        selectedPremises: any[] = [],\n      ) => {'''.replace('\\n', '\n')
new_signature = '''      const buildPrompt = (
        excludes: Array<{ title: string; hook?: string; description?: string }>,
        selectedPremise: Record<string, unknown>,
      ) => {'''
if old_signature not in controller:
    raise SystemExit('buildPrompt signature anchor missing')
controller = controller.replace(old_signature, new_signature, 1)

old_structure = '        const structureText = ideaCardStructuringDirective(selectedPremises);'
new_structure = '        const structureText = ideaCardStructuringDirective(selectedPremise);'
if old_structure not in controller:
    raise SystemExit('structuring directive call anchor missing')
controller = controller.replace(old_structure, new_structure, 1)

old_generate_sentence = "请一次生成 ${count} 个互不重复、可直接创建作品的${dto.storyType === 'short_story' ? '短篇' : '长篇'}题材。只输出一个合法 JSON 对象，不输出分析过程、Markdown 或额外文字。"
new_generate_sentence = "请把下方【完整题材卡结构化】中的唯一一个已选${dto.storyType === 'short_story' ? '短篇' : '长篇'}题材胚子结构化为恰好 1 张完整题材卡。只输出一个合法 JSON 对象，不输出分析过程、Markdown 或额外文字。"
if old_generate_sentence not in controller:
    raise SystemExit('batch generation prompt anchor missing')
controller = controller.replace(old_generate_sentence, new_generate_sentence, 1)

old_batch_rule = '题材、钩子、事件链必须体现这些选择。同批题材在职业/生存环境、关系结构、压力来源、核心机制、时间结构、真相载体和结局代价中至少四个维度不同，不能只是替换姓名和地点。'
new_batch_rule = '题材、钩子、事件链必须体现这些选择。与其它已选题材的差异已经在创建前筛选阶段确定，本阶段只忠实结构化当前胚子，不得为了制造差异换题。'
if old_batch_rule not in controller:
    raise SystemExit('batch difference rule anchor missing')
controller = controller.replace(old_batch_rule, new_batch_rule, 1)

old_json_count = 'JSON 结构（ideas 必须恰好 ${count} 项）：${outputSchemaWithAuto}`;'
new_json_count = 'JSON 结构（ideas 必须恰好 1 项）：${outputSchemaWithAuto}`;'
if old_json_count not in controller:
    raise SystemExit('batch JSON count anchor missing')
controller = controller.replace(old_json_count, new_json_count, 1)

gen_start = controller.find('      const generateBatch = async (')
gen_end_marker = '\n\n      const assessIdeaQuality = (candidate: any): string[] => {'
gen_end = controller.find(gen_end_marker, gen_start)
if gen_start < 0 or gen_end < 0:
    raise SystemExit('generateBatch block anchors missing')
new_generator = r'''      const generateStructuredCard = async (
        selectedPremise: Record<string, unknown>,
        position: number,
      ): Promise<Record<string, unknown>> => {
        const response = await this.realLLM.generate({
          prompt: buildPrompt(initialExcludes, selectedPremise),
          scenario: 'idea_generate',
          timeout: LLM_TUNABLES.timeoutSimple(),
          // 这里只允许底层对“空响应”做一次技术重取；不会换 premise，也不会重新选题。
          maxEmptyRetries: 1,
          responseFormat: 'json_object',
        });
        const rawIdeas = extractIdeaList(response.content || '') || [];
        try {
          return bindStructuredIdeaCardToPremise(selectedPremise, rawIdeas);
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          throw new Error(`第 ${position + 1}/${requestedCount} 个已选题材结构化失败：${detail}`);
        }
      };'''
controller = controller[:gen_start] + new_generator + controller[gen_end:]

main_start = controller.find('      const premiseDiscovery = await discoverPremisePoolBeforeCards();')
main_end_marker = "      accept(structuredCards, 'initial');"
main_end = controller.find(main_end_marker, main_start)
if main_start < 0 or main_end < 0:
    raise SystemExit('main structuring block anchors missing')
main_end += len(main_end_marker)
new_main = r'''      const premiseDiscovery = await discoverPremisePoolBeforeCards();
      const selectedPremises = premiseDiscovery.selected;
      const selectedPremiseIdSet = new Set(selectedPremises.map((item: any) => String(item?.premiseId || '').trim()));
      const structuredCards: Array<Record<string, unknown>> = [];
      // 已选题材逐一结构化：用户要 5 个题材时是 5 个 premise 各创建 1 张卡，
      // 不是把 5 张完整卡塞进一个大 JSON，也不是对同一张卡反复改写 5 次。
      for (let index = 0; index < selectedPremises.length; index += 1) {
        const selectedPremise = selectedPremises[index] as Record<string, unknown>;
        structuredCards.push(await generateStructuredCard(selectedPremise, index));
      }
      const structuredPremiseIds = structuredCards.map((item: any) => String(item?.sourcePremiseId || '').trim());
      const structuredUniqueIds = new Set(structuredPremiseIds);
      const missingPremiseIds = [...selectedPremiseIdSet].filter(id => !structuredUniqueIds.has(id));
      const unknownPremiseIds = [...structuredUniqueIds].filter(id => !selectedPremiseIdSet.has(id));
      if (structuredCards.length !== requestedCount || structuredUniqueIds.size !== requestedCount || missingPremiseIds.length || unknownPremiseIds.length) {
        throw new Error(`完整题材卡没有逐一保持创建前筛选结果；生成=${structuredCards.length}/${requestedCount}，缺失=${missingPremiseIds.join('、') || '无'}，越界=${unknownPremiseIds.join('、') || '无'}。系统不会自动换题或补生。`);
      }
      accept(structuredCards, 'initial');'''
controller = controller[:main_start] + new_main + controller[main_end:]

old_schema_version = '        schemaVersion: 6,\n        mode: \'premise_preselection_then_final_gate_bounded_repair\','
new_schema_version = "        schemaVersion: 7,\n        mode: 'premise_preselection_then_final_gate_bounded_repair',\n        structuringProtocol: 'one_selected_premise_per_call_server_owned_identity',"
if old_schema_version not in controller:
    raise SystemExit('appeal gate schema version anchor missing')
controller = controller.replace(old_schema_version, new_schema_version, 1)

old_note = "        note: '先完成轻量题材池筛选，再结构化完整卡；最终 Gate 未通过时只允许对原 premise 做一次有序局部字段修复，题材身份由服务器持有。修复后仍不足请求数量则整次失败，绝不返回部分成功。',"
new_note = "        note: '先完成轻量题材池筛选；每个已选 premise 独立结构化恰好一张完整卡，题材身份由服务器绑定，避免批量大 JSON 少卡/错 ID。最终 Gate 未通过时只允许对原 premise 做一次有序局部字段修复；修复后仍不足请求数量则整次失败。',"
if old_note not in controller:
    raise SystemExit('appeal gate note anchor missing')
controller = controller.replace(old_note, new_note, 1)

for forbidden in [
    'generateBatch(requestedCount',
    '完整题材卡结构化应与创建前筛选出的',
    '\\"sourcePremiseId\\":\\"P1\\"',
    'const generateBatch = async',
]:
    if forbidden in controller:
        raise SystemExit(f'old batch structuring path still present: {forbidden}')
controller_path.write_text(controller, encoding='utf-8')

spec_path = Path('server/src/chain/idea-discovery-contract.spec.ts')
spec = spec_path.read_text(encoding='utf-8')
old_import = '  applyOrderedIdeaRepairPatches,\n  ideaCardStructuringDirective,'
new_import = '  applyOrderedIdeaRepairPatches,\n  bindStructuredIdeaCardToPremise,\n  ideaCardStructuringDirective,'
if old_import not in spec:
    raise SystemExit('contract spec import anchor missing')
spec = spec.replace(old_import, new_import, 1)

spec_start = spec.find("  it('structures only the premises already selected before card creation', () => {")
spec_end = spec.find("\n\n  it('keeps final-gate premise identity on the server", spec_start)
if spec_start < 0 or spec_end < 0:
    raise SystemExit('old card structuring spec block anchors missing')
new_specs = r'''  it('structures one preselected premise at a time without exposing its opaque id to the model', () => {
    const directive = ideaCardStructuringDirective({
      premiseId: 'P2',
      workingTitle: '候选二',
      storyCore: '主角在不可替换的职业责任中被迫做出选择',
      coreConflict: '冲突二',
    });

    expect(directive).toContain('恰好 1 张完整题材卡');
    expect(directive).toContain('不再重新选题');
    expect(directive).toContain('服务器已经锁定题材身份');
    expect(directive).toContain('候选二');
    expect(directive).not.toContain('P2');
    expect(directive).not.toContain('sourcePremiseId');
    expect(directive).not.toContain('premiseId');
    expect(directive).toContain('不是自动补生或改写其它题材');
  });

  it('binds each one-card response back to the server-owned selected premise identity', () => {
    const selected = Array.from({ length: 5 }, (_, index) => ({
      premiseId: `P${index + 1}`,
      workingTitle: `候选${index + 1}`,
    }));
    const cards = selected.map((premise, index) => bindStructuredIdeaCardToPremise(premise, [{
      sourcePremiseId: 'MODEL_SHOULD_NOT_OWN_THIS',
      premiseId: 'MODEL_INTERNAL_ID',
      title: `完整卡${index + 1}`,
      hook: `这是第${index + 1}张完整题材卡的具体钩子`,
    }]));

    expect(cards).toHaveLength(5);
    expect(cards.map(card => card.sourcePremiseId)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5']);
    expect(cards.map(card => card.title)).toEqual(['完整卡1', '完整卡2', '完整卡3', '完整卡4', '完整卡5']);
    expect(cards.every(card => card.premiseId === undefined)).toBe(true);
  });

  it('rejects zero or multiple full cards for one selected premise instead of hiding the mismatch in a batch', () => {
    const premise = { premiseId: 'P3', workingTitle: '候选三' };
    expect(() => bindStructuredIdeaCardToPremise(premise, []))
      .toThrow('返回 0 张，期望恰好 1 张');
    expect(() => bindStructuredIdeaCardToPremise(premise, [{ title: 'A' }, { title: 'B' }]))
      .toThrow('返回 2 张，期望恰好 1 张');
  });'''
spec = spec[:spec_start] + new_specs + spec[spec_end:]
spec_path.write_text(spec, encoding='utf-8')

arch_path = Path('server/src/chain/chain-route-architecture.spec.ts')
arch = arch_path.read_text(encoding='utf-8')
insert_before = "\n  it('never reports a partial idea batch as successful after the final gate', () => {"
if insert_before not in arch:
    raise SystemExit('architecture insertion anchor missing')
new_arch_test = r'''
  it('materializes each selected premise as exactly one independent full card instead of one five-card JSON batch', () => {
    const source = read('chain.controller.ts');

    expect(source).toContain('const generateStructuredCard = async');
    expect(source).toContain('for (let index = 0; index < selectedPremises.length; index += 1)');
    expect(source).toContain('structuredCards.push(await generateStructuredCard(selectedPremise, index))');
    expect(source).toContain('bindStructuredIdeaCardToPremise(selectedPremise, rawIdeas)');
    expect(source).toContain("structuringProtocol: 'one_selected_premise_per_call_server_owned_identity'");
    expect(source).not.toContain('generateBatch(requestedCount');
    expect(source).not.toContain('const generateBatch = async');
    expect(source).not.toContain('完整题材卡结构化应与创建前筛选出的');
    expect(source).not.toContain('\\"sourcePremiseId\\":\\"P1\\"');
  });
'''
arch = arch.replace(insert_before, new_arch_test + insert_before, 1)
arch_path.write_text(arch, encoding='utf-8')
