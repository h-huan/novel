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

  it('requires causally executable seed candidates and does not relax independent quality gates', () => {
    const source = read('chain.controller.ts');
    // The 2026-10-24 production report had 15 seed premises but only 2 qualified:
    // missing decisive actors/conditions were being discovered after expensive reselection.
    expect(source).toContain('没有可信条件就换一条能成立的故事骨架');
    // These constraints now live in the single canonical selection directive,
    // not a fragile controller-side string replacement.
    const selectionDirective = read('idea-discovery-contract.ts');
    expect(source).toContain('ideaPremiseSelectionDirective(');
    expect(selectionDirective).toContain('仅靠配角依次揭露旧资料');
    expect(selectionDirective).toContain('原池缺少必要条件的，不得在展开字段里自造相反事实救活');
    expect(source).toContain('不准只换职业、场所或物证名称');
    expect(source).toContain('不得因职业、地点或证据道具不同就漏掉真实的结构同构');
    expect(source).toContain('普通扮猪吃虎类型外壳本身不构成同构');
    expect(source).toContain("success: false, status: 'incomplete', ideas: []");
    expect(source).toContain('qualifiedIdeas: acceptedWithAudit, totalIdeas: 0, warning, appealGate');
    expect(source).toContain('causalPlan每个关键结果的必要条件与整体反转兑现核对');
    expect(source).toContain('分类机制和手动流派落实');
    expect(source).toContain('reviewChangedPremiseSources(');
    expect(source).toContain("generationTasks.run('discovery', discoveryRequestId");
    expect(source).toContain("generationTasks.cancel('discovery', requestId)");
    expect(source).not.toContain('if(slots.length>=4)');
    expect(source).toContain('splitReviewMaterial(slots,slot=>');
    expect(source).toContain('if(!await reselectScope(part))return false');
    expect(source).toContain('isReviewOutputCapacityError(error)');
    expect(source).not.toContain('backupReplacements');
    expect(source).not.toContain('pendingBackup');
    expect(source).toContain('const finalReview=postReselectionReview;');
    expect(source).not.toContain('reserveReconciliationRounds');

    expect(source).toContain('quarantineIncompletePremiseReviews(value,selection,requiredGenres)');
    expect(source).toContain('review.issues.push(...materializePremisePayoffReview(payoffEvidence,selection))');
    expect(source).toContain("const partial = selectedAccepted.length < requestedCount");
  });

  it('keeps evidenced physical proof and relationship conditions at the candidate source, not just final-card rejection', () => {
    const source = read('chain.controller.ts');
    const contract = read('idea-discovery-contract.ts');
    expect(source).toContain('留在钥匙柄上的标记不能作为锁芯痕迹');
    expect(source).toContain('反派私库样本');
    expect(source).toContain('仅是男女朋友就不能凭空出现婚内财产');
    expect(source).toContain('主角承诺亲自递送材料');
    expect(source).toContain('核对物证的物理来源与样本取得链');
    expect(contract).toContain('标记在钥匙柄上就不能突然成为锁芯的痕迹');
    expect(contract).toContain('一次有界轻量候选补足、候选独立复核和完整卡终审');
    expect(contract).toContain('模型此轮只能忠实结构化当前已锁定身份');
  });

  it('anchors each new chapter result to an unconsumed chapter-local action instead of re-awarding prior outcomes', () => {
    const source = read('chain.controller.ts');
    expect(source).toContain('若前章已通过联名、决定、交付或对手改口实现目标');
    expect(source).toContain('不能再把保管同一文件、重述既有决定写成第二次实现该目标');
    expect(source).toContain('本章的文件保管、后续行动或付出代价，不得重述为前章已完成');
    const shared = fs.readFileSync(path.resolve(chainDir, '../../shared/src/chapter-responsibility-review.ts'), 'utf8');
    expect(shared).toContain('【跨章已完成结果不得重复兑现】');
    expect(shared).toContain('每章的responsibility必须能被该章content与characterActions自己的实际行动独立证明');
    expect(source).toContain('chapterResponsibilityPlanningDirective(false)');
    expect(source).toContain('reviewChapterDependencies(chData, reviewChapterFacts, reviewChapterActions)');
  });

  it('uses existing plan-only reselection support instead of requesting unchanged whole stories', () => {
    const source = read('chain.controller.ts');
    const normalizer = read('premise-selection-review.ts');
    expect(source).toContain('const reselectionOutputShape=');
    // A mandatory hedged replacement must not receive the old plan-only JSON template.
    expect(source).toContain('const citationOnlyIds=new Set(scopedSlots.filter');
    expect(source).toContain('citationOnlyIds.has(String(slot.replacesPremiseId))');
    expect(source).toContain('【每个问题位置的实际输出形状】');
    expect(source).not.toContain('只输出JSON：{"replacements":[{"replacesPremiseId":"问题位置原ID"');
    expect(normalizer).toContain('const planOnly = row.premiseId === slotId');
    expect(normalizer).toContain('bySlot.set(slotId, { ...slot.original, causalPlan: row.causalPlan })');
  });

  it('stops recovery once actual delivery count is independently vetted, not surplus screening count', () => {
    const source = read('chain.controller.ts');
    expect(source).toContain('retained.selection.selected.length>=deliveryCount&&retainedReview.passed');
    expect(source).not.toContain('retained.selection.selected.length>=requestedCount&&retainedReview.passed');
  });

  it('prevents claims of involuntary detention or binding decisions from being created only in projections', () => {
    const source = read('chain.controller.ts');
    expect(source).toContain('口头要求、自愿配合和合法实际控制不可混同');
    expect(source).toContain('缺权限或执行动作时不得写成强制留置');
    expect(source).toContain('scenes.outcome、characterActions.result、characterStates.stateAfter及伏笔回收必须从同一已发生事件投影');
    expect(source).toContain('reviewChapterDependencies(chData, reviewChapterFacts, reviewChapterActions)');
    expect(source).toContain('outlineFactPatchSynchronizationIssues(chData,rawPatch,defects,actionRepairEvidence)');
  });

  it('materializes each selected premise as exactly one independent full card instead of one five-card JSON batch', () => {
    const source = read('chain.controller.ts');

    expect(source).toContain('const generateStructuredCard = async');
    expect(source).toContain('bindStructuredIdeaCardToPremise(selectedPremise,normalizedIdeas)');
    expect(source).toContain('normalizeGeneratedFictionNames(raw)');
    expect(source).not.toContain("applyFictionNamingReplacements(raw,{'微信':'青信'})");
    expect(source).toContain('const prohibited = prohibitedFictionNames(candidate)');
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

    expect(source).toContain("repairProtocol: 'one_budgeted_lightweight_refill_wave_after_full_card_gate'");
    expect(source).toContain('retainValidAutomaticPlotTags');
    expect(source).not.toContain('await fulfillDiscoveryGaps(');
    expect(source).not.toContain("kind:'repair_patch_rejected'");
    expect(source).toContain("mode: 'parallel_vetted_full_card_filter'");
    expect(source).toContain('await accept(structuredCards');
    expect(source).toContain('const missingAfterFirstGate=Math.max(0,requestedCount-accepted.length)');
    expect(source).toContain("stepKey:'idea_premise_pool_refill'");
    expect(source).toContain("stepKey:'idea_premise_refill_selection'");
    expect(source).toContain("await accept(supplementaryStructured,'repair')");
    expect(source).toContain('sourceCompletionBudget.remaining>=2');
    expect(source).toContain('presentationBudget.remaining>=minimumPresentationCredits');
    expect(source).toContain('selectedAccepted.length === 0');
    expect(source).toContain('selectedAccepted.length < requestedCount');
    expect(source).toContain("status: 'incomplete'");
    expect(source).toContain('qualifiedIdeas: acceptedWithAudit');
    expect(source).toContain('evaluatedAttempts: candidateAssessments.length');
    expect(source).toContain('repairGenerated: supplementaryStructured.length');
    expect(source).toContain("repairError: fulfillmentActions.find(item=>item.phase==='refill_blocked')?.reason||null");
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
    expect(source).toContain('const causalReviewChapter=(candidate:Record<string,any>)=>planningChapterForCausalReview(candidate,order+1,expectedChapter.func)');
    expect(source).toContain('[causalReviewChapter(candidate)]');
    expect(source).toContain('const actionRepairEvidence = chapterActionRepairEvidence(causalReviewChapter(chData), dependencyCheck.actionFailure)');
    expect(source).toContain('outlineFactPatchSynchronizationIssues(chData,rawPatch,defects,actionRepairEvidence)');
    expect(source).toContain('chData = applyOutlineFactPatch(chData,rawPatch)');
    expect(source).toContain("shortOutlineSourceRunIds.add(String(repair.runId))");
    expect(patch).toContain('OUTLINE_FACT_REPAIR_FIELDS = [');
    expect(patch).not.toContain("'targetWords'");
    expect(patch).not.toContain("'wordCountReason'");
    expect(source).not.toContain('只输出与当前章纲同字段的完整 JSON 对象；修复后所有事件');
  });
  it('keeps one JSON extraction path and removes post-card retry/replacement without weakening review', () => {
    const source = read('chain.controller.ts');
    const afterGate = source.slice(source.indexOf('await accept(structuredCards'), source.indexOf('const selectedAccepted = accepted'));
    expect(afterGate).not.toContain('reservePremiseSelection(');
    expect(afterGate).not.toContain('repairMissing(');
    expect(afterGate).not.toContain('fulfillDiscoveryGaps(');
    expect(source).toContain('全部进入并发完整卡生成');
    expect(source).toContain("const selectedAccepted = accepted");
    expect(source).toContain("await accept(structuredCards, 'initial')");
    const jsonRetry = source.slice(source.indexOf('private async llmCallWithRetry'));
    expect(jsonRetry).toContain('this.safeExtractJson<T>(rawContent, null as unknown as T)');
    expect(jsonRetry).not.toContain('const lineParsed: any[] = []');
    expect(jsonRetry).not.toContain('rawContent.matchAll(');
    expect(jsonRetry).toContain('if (parsedAnyResponse && lastValidationIssues.length > 0)');
  });

  it('does not promote a nested JSON fragment into an independently reviewed result', () => {
    const source = read('chain.controller.ts');
    const safeJson = source.slice(source.indexOf('private safeExtractJson'), source.indexOf('private loadChapterOutlineConsistencyRows'));
    expect(safeJson).toContain('extractBalancedJson<T>(cleaned)');
    expect(safeJson).not.toContain('cleaned.matchAll(');
    expect(source).not.toContain('const lineParsed: any[] = []');
  });

});
