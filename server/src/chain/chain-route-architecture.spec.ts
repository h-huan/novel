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
    expect(source).toContain('ideaPremiseSelectionDirective');
    expect(source).toContain('ideaCardStructuringDirective');
    expect(source).not.toContain('pool 以 ${premisePoolSize} 项为广搜目标，不是整批成功的硬门槛');
    expect(source).not.toContain('selectedPremises 必须恰好 ${requestedCount} 项');
    expect(source).not.toContain('创建前题材筛选未形成至少');
    expect(source).not.toContain('selectedPremiseIds');
    expect(source).not.toContain('pool.length < premisePoolSize || malformed');
  });

  it('materializes each selected premise as exactly one independent full card instead of one five-card JSON batch', () => {
    const source = read('chain.controller.ts');

    expect(source).toContain('const generateStructuredCard = async');
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

  it('carries server-owned preselection evidence through structuring and bounded repair into the final gate', () => {
    const contract = read('idea-discovery-contract.ts');
    const gate = read('idea-appeal-gate.service.ts');

    expect(contract).toContain('selectedPremiseEvidenceByCard = new WeakMap');
    expect(contract).toContain('selectedPremiseEvidenceByCard.set(boundCard, structuredClone(selectedPremise))');
    expect(contract).toContain('const selectedPremiseEvidence = selectedPremiseEvidenceForIdeaCard(card)');
    expect(contract).toContain('selectedPremiseEvidenceByCard.set(next, selectedPremiseEvidence)');
    expect(gate).toContain('selectedPremiseEvidenceForIdeaCard(idea)');
    expect(gate).toContain('const selectedAgencyEvidence');
    expect(gate).toContain('const selectedPressureEvidence');
    expect(gate).toContain('const selectedOpeningEvidence');
  });

  it('preserves final-gate-passed selected premises as diagnostics when the batch is incomplete', () => {
    const source = read('chain.controller.ts');

    expect(source).toContain('finalGateRepairAttempted');
    expect(source).toContain("repairProtocol: 'budgeted_progress_or_original_pool_replacement'");
    expect(source).toContain('applyOrderedIdeaRepairPatches');
    expect(source).toContain('ideaGateLocalRepairDirective');
    expect(source).toContain("mode: 'budgeted_original_pool_fulfillment'");
    expect(source).toContain('selectedAccepted.length === 0');
    expect(source).toContain('selectedAccepted.length < requestedCount');
    expect(source).toContain("status: 'incomplete'");
    expect(source).toContain('qualifiedIdeas: acceptedWithAudit');
    expect(source).toContain('evaluatedAttempts: candidateAssessments.length');
    expect(source).toContain('repairGenerated: finalGateRepairGenerated');
    expect(source).toContain('repairError: finalGateRepairError');
    expect(source).not.toContain('selectedAccepted.length !== requestedCount');
    expect(source).not.toContain('系统不会把部分结果伪装成完整成功');
  });

  it('keeps the desktop discovery wizard aligned with the server partial-success response contract', () => {
    const desktopPage = fs.readFileSync(
      path.resolve(chainDir, '../../../desktop/src/renderer/pages/DiscoveryWizardPage.tsx'),
      'utf8',
    );
    expect(desktopPage).toContain("result.status === 'partial'");
    expect(desktopPage).toContain("result.status === 'incomplete'");
    expect(desktopPage).toContain('normalizeDiscoveryResponse(res, requestedThisRun)');
    expect(desktopPage).toContain('count: requestedThisRun');
    expect(desktopPage).toContain('mergeDiscoveryBatch(preservedIdeas, newIdeas, configuredState.ideaCount)');
  });

  it('repairs outline fact conflicts as a local patch instead of regenerating the whole chapter plan', () => {
    const source = read('chain.controller.ts');

    const patch = read('outline-fact-patch.ts');
    expect(source).toContain('OUTLINE_FACT_REPAIR_FIELDS');
    expect(source).toContain('禁止重新生成完整章纲');
    expect(source).toContain('const actionRepairEvidence = chapterActionRepairEvidence(chData, dependencyCheck.actionFailure)');
    expect(source).toContain('outlineFactPatchSynchronizationIssues(chData,rawPatch,defects,actionRepairEvidence)');
    expect(source).toContain('chData = applyOutlineFactPatch(chData,rawPatch)');
    expect(source).toContain("shortOutlineSourceRunIds.add(String(repair.runId))");
    expect(patch).toContain('OUTLINE_FACT_REPAIR_FIELDS = [');
    expect(patch).not.toContain("'targetWords'");
    expect(patch).not.toContain("'wordCountReason'");
    expect(source).not.toContain('只输出与当前章纲同字段的完整 JSON 对象；修复后所有事件');
  });
});
