import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const chainDir = path.resolve(__dirname);
const read = (name: string) => fs.readFileSync(path.join(chainDir, name), 'utf8');

describe('chain HTTP architecture', () => {
  it('keeps the legacy orchestrator out of Nest controller registration', () => {
    const moduleSource = read('chain.module.ts');
    const controllersBlock = moduleSource.match(/controllers\s*:\s*\[([\s\S]*?)\]\s*,\s*providers\s*:/)?.[1] ?? '';
    const providersBlock = moduleSource.match(/providers\s*:\s*\[([\s\S]*?)\]\s*,\s*exports\s*:/)?.[1] ?? '';

    expect(controllersBlock).toContain('ChainPlanningController');
    expect(controllersBlock).toContain('ChainWritingController');
    expect(controllersBlock).toContain('ChainUtilityController');
    expect(controllersBlock).not.toMatch(/\bChainController\b/);
    expect(providersBlock).toMatch(/\bChainController\b/);
  });

  it('keeps focused route adapters under the existing /chain contract', () => {
    for (const file of [
      'chain-planning.controller.ts',
      'chain-writing.controller.ts',
      'chain-utility.controller.ts',
    ]) {
      const source = read(file);
      expect(source).toContain("@Controller('chain')");
      expect(source).toContain("from './chain.controller'");
    }
  });

  it('keeps broad premise search as a non-blocking target before full idea cards', () => {
    const source = read('chain.controller.ts');

    expect(source).toContain('normalizePremiseSelectionPayload');
    expect(source).toContain('premisePoolTargetMet');
    expect(source).toContain('pool 以 ${premisePoolSize} 项为广搜目标，不是整批成功的硬门槛');
    expect(source).toContain('selectedPremises 必须恰好 ${requestedCount} 项');
    expect(source).not.toContain('创建前题材筛选未形成至少');
    expect(source).not.toContain('selectedPremiseIds');
    expect(source).not.toContain('pool.length < premisePoolSize || malformed');
  });

  it('materializes each selected premise as exactly one independent full card instead of one five-card JSON batch', () => {
    const source = read('chain.controller.ts');

    expect(source).toContain('const generateStructuredCard = async');
    expect(source).toContain('for (let index = 0; index < selectedPremises.length; index += 1)');
    expect(source).toContain('structuredCards.push(await generateStructuredCard(selectedPremise, index))');
    expect(source).toContain('bindStructuredIdeaCardToPremise(selectedPremise, rawIdeas)');
    expect(source).toContain('第 ${position + 1}/${requestedCount} 个已选题材结构化失败');
    expect(source).toContain("structuringProtocol: 'one_selected_premise_per_call_server_owned_identity'");
    expect(source).toContain('JSON 结构（ideas 必须恰好 1 项）');
    expect(source).not.toContain('generateBatch(requestedCount');
    expect(source).not.toContain('const generateBatch = async');
    expect(source).not.toContain('请一次生成 ${count} 个互不重复、可直接创建作品');
    expect(source).not.toContain('完整题材卡结构化应与创建前筛选出的');
    expect(source).not.toContain('\\"sourcePremiseId\\":\\"P1\\"');
  });

  it('returns final-gate-passed selected premises without replacing or zeroing a partial batch', () => {
    const source = read('chain.controller.ts');

    expect(source).toContain('finalGateRepairAttempted');
    expect(source).toContain("repairProtocol: 'ordered_local_patch_server_owned_identity'");
    expect(source).toContain('applyOrderedIdeaRepairPatches');
    expect(source).toContain('ideaGateLocalRepairDirective');
    expect(source).toContain("mode: 'premise_preselection_then_final_gate_bounded_repair'");
    expect(source).toContain('selectedAccepted.length === 0');
    expect(source).toContain('selectedAccepted.length < requestedCount');
    expect(source).toContain('const qualityWarning = partial');
    expect(source).toContain('未通过题材已淘汰，系统未换题或补数');
    expect(source).toContain('evaluatedAttempts: candidateAssessments.length');
    expect(source).toContain('repairGenerated: finalGateRepairGenerated');
    expect(source).toContain('repairError: finalGateRepairError');
    expect(source).not.toContain('selectedAccepted.length !== requestedCount');
    expect(source).not.toContain('系统不会把部分结果伪装成完整成功');
  });

  it('repairs outline fact conflicts as a local patch instead of regenerating the whole chapter plan', () => {
    const source = read('chain.controller.ts');

    expect(source).toContain('factRepairFields');
    expect(source).toContain('禁止重新生成完整章纲');
    expect(source).toContain('const preservedTargetWords = chData.targetWords');
    expect(source).toContain('const preservedWordCountReason = chData.wordCountReason');
    expect(source).toContain("shortOutlineSourceRunIds.add(String(repair.runId))");
    expect(source).not.toContain('只输出与当前章纲同字段的完整 JSON 对象；修复后所有事件');
  });
});