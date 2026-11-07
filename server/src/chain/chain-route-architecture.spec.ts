import {STORY_PREREQUISITE_POLICY,IDEA_PREMISE_DIFFERENCE_POLICY,OUTLINE_PROJECTION_POLICY} from '../../shared/src/执行标准';
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

  it('does not report short or long project creation complete before the active state is stored', () => {
    const source=read('chain.controller.ts');
    const longPersist=source.indexOf('const longActivation=db.prepare(');
    const longDone=source.indexOf("emit('done', 100, \`长篇生成完成");
    const shortPersist=source.indexOf('const shortActivation=db.prepare(');
    const shortDone=source.indexOf("emit('done', 100, '全部内容生成完成'");
    expect(longPersist).toBeGreaterThan(0);
    expect(shortPersist).toBeGreaterThan(longPersist);
    expect(longDone).toBeGreaterThan(longPersist);
    expect(shortDone).toBeGreaterThan(shortPersist);
    expect(source).toContain("if(Number(longActivation.changes)!==1)throw");
    expect(source).toContain("if(Number(shortActivation.changes)!==1)throw");
    // Existing failed-project and active-project resumes remain authorized.
    expect(source.split("status IN ('creating','generation_failed','active')").length - 1).toBe(2);
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
    expect(source).toContain('既有行动全部成立而所称结果仍可能不成立');
    expect(source).toContain('screened: screenPremisePoolBatch(parsed.pool)');
    expect(source).toContain('const screened=batch.screened??screenPremisePoolBatch(batch.candidates)');
    expect(source).toContain('就在本次生成调用内改构该槽位');
    expect(source).toContain('不能把补造条件留到选优、成卡或终审');
    expect(source).toContain('已经发出或交付的原件不能仍留在主角手中');
    expect(source).toContain('不能拿主线调查成功自动担保');
    // These constraints now live in the single canonical selection directive,
    // not a fragile controller-side string replacement.
    const selectionDirective = read('idea-discovery-contract.ts');
    expect(source).toContain('ideaPremiseSelectionDirective(');
    expect(selectionDirective).toContain('配角轮流解释旧资料不算推进');
    expect(selectionDirective).toContain('任何需要补造原池没有的桥梁才能成立的身份必须淘汰');
    expect(IDEA_PREMISE_DIFFERENCE_POLICY).toContain('只换职业、道具、名字或分类不算实质差异');
    expect(source).toContain('不得因职业、地点或证据道具不同就漏掉真实的结构同构');
    expect(source).toContain('普通扮猪吃虎类型外壳本身不构成同构');
    expect(source).toContain("success: false, status: 'incomplete', ideas: []");
    expect(source).toContain('qualifiedIdeas: acceptedWithAudit, totalIdeas: 0, warning, appealGate');
    expect(source).toContain('每个独立结果的实际必要条件、决定者与执行状态');
    expect(source).toContain('来源兼容不能代替因果、分类或流派通过');
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

    expect(source).toContain('quarantineIncompletePremiseReviews(completePremiseSourceProof(expandPremiseSourceCheckRows(value),selection),selection,requiredGenres,true)');
    expect(source).toContain('review.issues.push(...materializePremisePayoffReview(payoffEvidence,selection,true))');
    expect(source).toContain("const partial = selectedAccepted.length < requestedCount");
  });

  it('keeps evidenced physical proof and relationship conditions at the candidate source, not just final-card rejection', () => {
    const source = read('chain.controller.ts');
    const contract = read('idea-discovery-contract.ts');
    expect(STORY_PREREQUISITE_POLICY).toContain('资料的发现/取得/复制/转交/出示');
    expect(STORY_PREREQUISITE_POLICY).toContain('资源时序');
    expect(STORY_PREREQUISITE_POLICY).toContain('单个人同意不替代其它实际权利人或有权办理者的决定');
    expect(source).toContain('承担结果的人物选择与必要条件须已实际发生');
    expect(source).toContain('premisePayoffReviewDirective(selection)');
    expect(source).toContain('premiseCategoryReviewDirective(selection');
    expect(source).toContain('premiseSourceReviewWork(selection).pending');
    expect(source).not.toContain('本次来源继承这一部分逐项核对');
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
    const env=source.split('outlineEnvironmentContext=JSON.stringify({')[1]?.split('});')[0]||'';
    expect(env).toContain('era:savedWorld.era');
    expect(env).toContain('locations:worldPromptValue(savedWorld.locations)');
    expect(env).not.toContain('rules:');
    expect(env).not.toContain('constraints:');
    expect(env).not.toContain('storyPremise:');
    expect(source).not.toContain('outlineContextPrefix');
    expect(source).not.toContain('【本章事件与状态唯一来源】');
    expect(source).toContain('【同源事件投影】${OUTLINE_PROJECTION_POLICY}');
    expect(source).toContain('【首章已确认的原始吸睛钩子');
    expect(source).toContain('savedWorldForOutline=savedWorld');
    expect(source).toContain('world:savedWorldForOutline,emit}');
    expect(source).toContain('const worldRowForOutline=savedWorldForOutline');
    expect(source).toContain('const currentWorldForOutlineReview=savedWorldForOutline');
    expect(source).not.toContain('const currentWorldForOutlineReview = db.prepare(');
    expect(source).not.toContain('const worldRowForOutline = db.prepare(');
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
    expect(source).toContain('【同源事件投影】${OUTLINE_PROJECTION_POLICY}');
    expect(OUTLINE_PROJECTION_POLICY).toContain('详细章纲先形成content的事件、人物、时间与结果');
    expect(OUTLINE_PROJECTION_POLICY).toContain('不能在辅助字段虚构交付、完成或授权');
    expect(OUTLINE_PROJECTION_POLICY).toContain('实际发令者、执行者、接收者、对象与当前完成状态');
    expect(OUTLINE_PROJECTION_POLICY).toContain('同一机构或组织的不同成员不得交换动作归属');
    expect(OUTLINE_PROJECTION_POLICY).toContain('不能把尚未完成的交付、核验或后续安排写成既成事实');
    expect(OUTLINE_PROJECTION_POLICY).toContain('散会、日常叮嘱、普通离开等没有独立推进作用的行为留在content');
    expect(source).not.toContain('【本章事件与状态唯一来源】');
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
    expect(source).toContain("work.runReview(budget=>accept(batch,");
    expect(source).toContain('const missingAfterFirstGate=Math.max(0,requestedCount-accepted.length)');
    expect(source).toContain("stepKey:'idea_premise_pool_refill'");
    expect(source).toContain("stepKey:'idea_premise_refill_selection'");
    expect(source).toContain('reviewReadyCards(refillWork,refillWave())');
    expect(source).not.toContain("await accept(supplementaryStructured,'repair')");
    expect(source).toContain('affordableFullCardRefillCount(');
    expect(source).toContain('desiredSupplement>=missingAfterFirstGate');
    expect(source).toContain('neededFreshPremiseSeeds(');
    expect(source).not.toContain('Math.max(0,desiredSupplement-unusedSeeds.length)');
    expect(source).toContain('affordableReviewedPremiseCount(');
    expect(source).toContain('sourceCompletionBudget.remaining,discoveryBudget.sourceBatchSize,');
    expect(source).toContain('discoveryBudget.reviewGroupingMode,missingAfterFirstGate');
    // Both stages of the SAME already-funded refill must inherit independently
    // evidenced preselection failure modes, not only later full-card failures.
    expect(source).toContain('const refillFailureReasons=()=>premiseRefillFailureReasons(');
    expect(source.match(/failureReasons:refillFailureReasons\(\)/g)).toHaveLength(2);
    expect(source).not.toContain('failureReasons:rejectedReasons');
    expect(source).not.toContain('minimumPresentationCredits');
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

  it('keeps the desktop discovery wizard aligned with current incomplete and earlier partial response contracts', () => {
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
    const afterGate = source.slice(source.indexOf("work.runReview(budget=>accept(batch,"), source.indexOf('const selectedAccepted = accepted'));
    expect(afterGate).not.toContain('reservePremiseSelection(');
    expect(afterGate).not.toContain('repairMissing(');
    expect(afterGate).not.toContain('fulfillDiscoveryGaps(');
    expect(source).toContain('全部进入并发完整卡生成');
    expect(source).toContain("const selectedAccepted = accepted");
    expect(source.includes("work.runReview(budget=>accept(batch,")).toBe(true);
    const jsonRetry = source.slice(source.indexOf('private async llmCallWithRetry'));
    expect(jsonRetry).toContain('this.safeExtractJson<T>(rawContent, null as unknown as T)');
    expect(jsonRetry).not.toContain('const lineParsed: any[] = []');
    expect(jsonRetry).not.toContain('rawContent.matchAll(');
    expect(jsonRetry).toContain('if (parsedAnyResponse && lastValidationIssues.length > 0)');
  });

  it('does not confuse optional preselection screening hedge with the requested five final cards',()=>{
    const source=read('chain.controller.ts');
    expect(source).toContain('partial:retained.selection.selected.length<deliveryCount');
    expect(source).toContain('screeningCapacityGap:Math.max(0,requestedCount-retained.selection.selected.length)');
    expect(source).toContain('个真实合格预选（尚非完整卡）');
    expect(source).toContain('停止可选冗余换选，直接成卡及独立终审');
    expect(source).toContain("selectionStopReason:'delivery_capacity_met'");
    expect(source).not.toContain('affordablePreselectionHedge');
    expect(source).not.toContain('capacityMet?');
    expect(source).toContain('partial:false,screeningCapacityGap:Math.max(0,requestedCount-partialSelection.selected.length)');
  });

  it('retains full model reasoning for evidence-bearing causal selection, not only the downstream review',()=>{
    const real=read('real-llm.service.ts');
    const steps=real.split('const preliminarySteps=[')[1]?.split('];')[0]||'';
    expect(steps).toContain('idea_premise_pool_generation');
    expect(steps).not.toContain('idea_premise_selection');
    expect(steps).not.toContain('idea_premise_pool_reselection');
    expect(real).toContain("if(scenario==='idea_generate'&&stepKey&&preliminarySteps.includes(stepKey))return 'low'");
  });

  it('presents saved world rule arrays directly to short outline generation before incidental scenes',()=>{
    const source=read('chain.controller.ts');
    expect(source).toContain('rules: worldPromptValue(worldRowForOutline.rules)');
    expect(source).toContain("const parsed=JSON.parse(value)");
    expect(source).toContain('世界规则也约束次要场景与过场动作');
    expect(source).toContain('无推进价值的过场可不写');
    expect(source).toContain('reviewChapterDependencies(chData, reviewChapterFacts, reviewChapterActions)');
  });

  it('does not promote a nested JSON fragment into an independently reviewed result', () => {
    const source = read('chain.controller.ts');
    const safeJson = source.slice(source.indexOf('private safeExtractJson'), source.indexOf('private loadChapterOutlineConsistencyRows'));
    expect(safeJson).toContain('extractBalancedJson<T>(cleaned)');
    expect(safeJson).not.toContain('cleaned.matchAll(');
    expect(source).not.toContain('const lineParsed: any[] = []');
  });

});
