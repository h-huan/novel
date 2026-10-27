import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const controllerSource = readFileSync(
  fileURLToPath(new URL('./chain.controller.ts', import.meta.url)),
  'utf8',
);
const patchSource = readFileSync(
  fileURLToPath(new URL('./cross-stage-patch.ts', import.meta.url)),
  'utf8',
);

function indexOrFail(source: string, marker: string): number {
  const index = source.indexOf(marker);
  expect(index, `missing architecture marker: ${marker}`).toBeGreaterThanOrEqual(0);
  return index;
}

describe('creation consistency architecture invariants', () => {
  it('treats candidate-pool size as a search target and bounds repeated reserve replacement', () => {
    expect(controllerSource).toContain('if (candidatePool.length === 0)');
    expect(controllerSource).not.toContain('if (candidatePool.length < minimumPremiseSelectionCount)');
    expect(controllerSource).toContain('minimumSelectedCountForPool');
    expect(controllerSource).toContain('prerequisiteError(firstBlockedBatch.blocked)');
    expect(controllerSource).toContain("'candidate_pool_empty'");
    expect(controllerSource).not.toContain('if (candidatePool.length < requestedCount)');
    expect(controllerSource).not.toContain('reserveReconciliationRounds<1');
    expect(controllerSource).toContain('while(!finalReview.passed&&!unresolvedIds.length&&reselectionBudget.remaining>0)');
    expect(controllerSource).toContain('phaseTimings: { selectionWallMs, preselectionReviewWallMs, totalWallMs');
  });

  it('keeps good preselection cards reviewable but never passes an incomplete batch', () => {
    expect(controllerSource).toContain('const preselectionShortfall = Math.max(0, requestedCount - selectedPremises.length);');
    expect(controllerSource).toContain('poolTarget,categories,current.selected.length');
    expect(controllerSource).toContain("if(reserve.error){finalGateRepairError=reserve.error;return 'unavailable';}");
    expect(controllerSource).toContain('证据指向具体责任人须有区别于“只是排除自己”的指认依据');
    expect(controllerSource).toContain('qualifiedIdeas: acceptedWithAudit');
    expect(controllerSource).toContain("if (partial) {");
    expect(controllerSource).not.toContain("stoppedAt:'premise_preselection'");
  });
  it('avoids reviewing an unchanged selection twice and projects chapter events consistently', () => {
    expect(controllerSource).toContain('selectionChangeScope(initial,selected)');
    expect(controllerSource).toContain('reviewBoth(selected,changeScope,initialReview)');
    expect(controllerSource).toContain('retainPremiseReviewEvidence(initial,initialReview,selected)');
    expect(controllerSource).toContain('【选优终检：不得留给后续长时复审才发现】');
    expect(controllerSource).toContain('此为选优前的自检，不输出自评分，不代替后续全部独立审查。');
    expect(controllerSource).toContain('【同源事件投影】${OUTLINE_PROJECTION_POLICY}');
    expect(controllerSource).toContain('先发生的话不能改称见证后来证据的反应');
    expect(controllerSource).toContain('沉默、询问或下一章计划升级为已执行结果');
    expect(controllerSource).toContain('"characterStates":[]');
    expect(controllerSource).not.toContain('"stateAfter":"本章后状态"');
    expect(controllerSource).toContain('【本章事件与状态唯一来源】');
    expect(controllerSource).toContain('同一时点不得同时在两个人手中或两个地点');
  });

  it('prevents cross-channel message contradictions and protects explicit action evidence during outline repair', () => {
    expect(controllerSource).toContain('【通信渠道与同源事件约束】');
    expect(controllerSource).toContain('私聊回复不能被投影成群消息回复');
    expect(controllerSource).toContain('询问某人不等于已经得到答复');
    expect(controllerSource).toContain('本章新增几笔');
    expect(controllerSource).toContain('所有字段使用同一时点和口径');
    expect(controllerSource).toContain('本人直接听到的问话不得投影成第三人此前向其转述');
    expect(controllerSource).toContain('推测他人知情不能投影成已有某人报信');
    expect(controllerSource).toContain('核定金额、签署协议、办手续不等于款项实际发放或收到');
    expect(controllerSource).toContain('没有明写的后续行动、持续状态和范围不可凭空补全');
    expect(controllerSource).toContain('仅记下身份不得推定具体证据已记录、被采信或已完成调查');
    expect(controllerSource).toContain('scenes.outcome和characterActions.result只能保留为待查状态');
    expect(controllerSource).toContain('【通信渠道矛盾修复规则】');
    expect(controllerSource).toContain('不得删除或忽略该直接证据去迁就错误审查');
  });

  it('uses one mandatory final short-outline fact audit without legacy unreachable recheck', () => {
    const finalAudit = indexOrFail(controllerSource, 'await this.assertOutlineCandidateFacts(projectId, canonicalCreativeBrief, executionStandardForReview,');
    const persistedOutline = controllerSource.indexOf("db.exec('BEGIN IMMEDIATE')", finalAudit);
    expect(persistedOutline).toBeGreaterThan(finalAudit);
    expect(controllerSource).not.toContain('completeOutlineFactsReviewed');
    // All accepted earlier chapters are still sent as source facts; the full
    // responsibilities remain. Do not resend a redundant prefix of that plan.
    expect(controllerSource).toContain('buildOutlineContinuityContext(acceptedOutlineSources, priorOutlineFactLedger, false)');
    expect(controllerSource).toContain('【后续章节职责与节拍（本章禁止提前执行）】');
    expect(controllerSource).toContain('chapterResponsibilityPlan.slice(chapterIndex + 1)');
    expect(controllerSource).toContain('chapterResponsibilities: chapterResponsibilityPlan, priorChapters: acceptedOutlineSources');
    expect(controllerSource).not.toContain('completedTaskBoundary');
    expect(controllerSource).not.toContain('nextTaskBoundary');
    expect(controllerSource).not.toContain('【全书章节分工与动态节拍】');
    expect(controllerSource).not.toContain('【已经完成、禁止重演的章节任务】');
  });

  it('does not leak a past novel\'s mechanics into every new world and cross-stage review', () => {
    expect(controllerSource).toContain('能力、信息、物件与证据的触发条件、作用对象、范围、时序、存续及可取得性以【唯一故事基准】为准');
    expect(controllerSource).toContain('深度档案不得增造原骨架没有的规则、代价或结果');
    expect(controllerSource).not.toContain('每进门');
    expect(controllerSource).not.toContain('仅楼内回拨');
    expect(controllerSource).not.toContain('已确认题材的触发条件、回拨范围、抹除对象');
  });

  it('keeps patch-only synchronization policy out of first draft but in the one local repair contract', () => {
    const draftAt = indexOrFail(controllerSource, 'const chapterPrompt =');
    const draftEnd = indexOrFail(controllerSource, 'const chapterJsonExample =');
    const draft = controllerSource.slice(draftAt, draftEnd);
    const repairAt = indexOrFail(controllerSource, '【局部修复硬约束】禁止重新生成完整章纲');
    const repairEnd = controllerSource.indexOf('stepKey:\'creation_chapter_fact_repair\'', repairAt);
    expect(repairEnd).toBeGreaterThan(repairAt);
    expect(draft).toContain('【同源事件投影】${OUTLINE_PROJECTION_POLICY}');
    expect(draft).not.toContain('OUTLINE_FACT_REPAIR_SYNC_POLICY');
    expect(draft).toContain('【数量、信息与证据连续性】');
    expect(draft).toContain('【通信渠道与同源事件约束】');
    expect(controllerSource.slice(repairAt, repairEnd)).toContain('${OUTLINE_FACT_PATCH_ADDRESS_POLICY}${OUTLINE_FACT_REPAIR_SYNC_POLICY}');
    expect(controllerSource).not.toContain('【本章输出前事件投影核对】');
  });

  it('short-world directive cannot override the confirmed story or silently rewrite a conflict', () => {
    expect(controllerSource).toContain('【已确认世界规则（不得覆盖已确认题材的核心事实）】');
    expect(controllerSource).not.toContain('【已确认世界规则（高于故事卡和章纲措辞）】');
    expect(controllerSource).toContain('若二者存在真实互斥，停止下游改写并将冲突交由既有一致性审核处理');
  });

  it('projects one confirmed story into the same Story Foundation for long and short creation', () => {
    expect(controllerSource).toContain('const storyFoundation = buildStoryFoundation(dto.selectedIdea);');
    expect(controllerSource).toContain('const ideaStr = JSON.stringify({ confirmedStory: dto.selectedIdea, storyFoundation });');
    expect(controllerSource).toContain('storyFoundation,');

    const foundationAt = indexOrFail(controllerSource, 'const storyFoundation = buildStoryFoundation(dto.selectedIdea);');
    const longPlanAt = indexOrFail(controllerSource, 'const data = await this.generateConfiguredLongNovelPlan({');
    const shortBriefAt = indexOrFail(controllerSource, 'const canonicalCreativeBrief = JSON.stringify({');
    expect(foundationAt).toBeLessThan(longPlanAt);
    expect(foundationAt).toBeLessThan(shortBriefAt);
  });

  it('preflights every long-creation provenance proof before the first same-batch Canon write', () => {
    const preflightAt = indexOrFail(controllerSource, '同一长篇创建批次必须在第一条 Canon 写入之前一次性验明全部来源');
    const skeletonAt = controllerSource.indexOf('runId: provenance.skeletonRunId', preflightAt);
    const worldAt = controllerSource.indexOf('runId: provenance.worldRunId', preflightAt);
    const characterAt = controllerSource.indexOf('runId: provenance.characterRunId', preflightAt);
    const outlineLoopAt = controllerSource.indexOf('for (const runId of creationBatchOutlineRunIds)', preflightAt);
    const firstSettingsWriteAt = controllerSource.indexOf('UPDATE projects SET settings = ? WHERE id = ?', preflightAt);

    for (const index of [skeletonAt, worldAt, characterAt, outlineLoopAt, firstSettingsWriteAt]) {
      expect(index).toBeGreaterThan(preflightAt);
    }
    expect(skeletonAt).toBeLessThan(firstSettingsWriteAt);
    expect(worldAt).toBeLessThan(firstSettingsWriteAt);
    expect(characterAt).toBeLessThan(firstSettingsWriteAt);
    expect(outlineLoopAt).toBeLessThan(firstSettingsWriteAt);
  });

  it('keeps world canon out of every automatic cross-stage repair target', () => {
    expect(patchSource).not.toMatch(/\bworld\s*:\s*['"]world_settings['"]/);
    expect(patchSource).not.toMatch(/\bworldProfile\s*:\s*['"]world_system_profiles['"]/);
    expect(controllerSource).not.toContain('entityType":"world|worldProfile|');
    expect(controllerSource).toContain('crossStageRepairAnchorView(visibleRepairAnchors)');
    expect(controllerSource).toContain('CROSS_STAGE_PATCH_TABLE_MAP');
  });

  it('reviews an in-memory minimum-impact candidate before any cross-stage Canon commit', () => {
    const candidateAt = indexOrFail(controllerSource, 'const candidateBundle = structuredClone(generatedBundle)');
    const reviewAt = controllerSource.indexOf('跨模块故事一致性第${repairAttempt}次候选复查', candidateAt);
    const transactionAt = controllerSource.indexOf("db.exec('BEGIN IMMEDIATE')", candidateAt);
    expect(reviewAt).toBeGreaterThan(candidateAt);
    expect(transactionAt).toBeGreaterThan(reviewAt);
  });

  it('reuses frozen world during long recovery instead of generating or inserting a second world', () => {
    expect(controllerSource).toContain('frozenWorldview: frozenLongWorldview');
    expect(controllerSource).toContain('executeLongNovelFoundationSkeleton');
    expect(controllerSource).toContain('if (!reusingFrozenWorld && Object.keys(worldSetting).length > 0)');
    expect(controllerSource).toContain('wsCount = reusingFrozenWorld ? 1 : 0');
  });

  it('has one creation-world authority and no legacy post-outline world regeneration', () => {
    const shortWorld = indexOrFail(controllerSource, 'const worldResult = await this.llmCallWithRetry<any>(\'世界观生成\', worldPrompt, {');
    const savedWorld = indexOrFail(controllerSource, 'const savedWorld = db.prepare');
    const chapterOutlines = indexOrFail(controllerSource, 'const chapterPrompt =');
    const guard = indexOrFail(controllerSource, '创建期世界观主记录缺失或无效：前序世界观必须先通过审核并落库');
    const enrichment = indexOrFail(controllerSource, '// 任务C：组织/地点生成');
    expect(shortWorld).toBeLessThan(savedWorld);
    expect(savedWorld).toBeLessThan(chapterOutlines);
    expect(chapterOutlines).toBeLessThan(guard);
    expect(guard).toBeLessThan(enrichment);
    expect(controllerSource.match(/const worldPrompt =/g)).toHaveLength(1);
    expect(controllerSource).not.toContain('world_system_profiles 已创建 (sequential path');
    expect(controllerSource).not.toContain('任务B：世界观生成（仅当 DB 中无世界观时执行');
    expect(controllerSource).not.toContain('顺序生成角色/世界观/组织/伏笔');
  });

  it('collects short foreshadowing from accepted outlines without a dormant long-model path', () => {
    const shortCollection = indexOrFail(controllerSource, 'const generatedForeshadowings = collectOutlineForeshadowings(outlineForeshadowRows);');
    const shortPersistence = controllerSource.indexOf('INSERT INTO foreshadowings', shortCollection);
    const savedCount = controllerSource.indexOf('const fsCountNow = getCreationCounts().foreshadowings;', shortCollection);
    expect(shortPersistence).toBeGreaterThan(shortCollection);
    expect(savedCount).toBeGreaterThan(shortPersistence);
    expect(controllerSource).not.toContain('伏笔生成(长篇)');
    expect(controllerSource).not.toContain('globalForeshadowings || []');
    expect(controllerSource).toContain('foreshadowingGenerationConfirmedEmpty = generatedForeshadowings.length === 0');
  });

  it('does not force invented fixed-role characters or unsupported growth tags into creation', () => {
    const start = indexOrFail(controllerSource, 'const charPrompt =');
    const end = controllerSource.indexOf("const charResult = await this.llmCallWithRetry<any[]>('角色生成'", start);
    expect(end).toBeGreaterThan(start);
    const prompt = controllerSource.slice(start, end);
    expect(prompt).toContain('【角色来源定位目录（原文见上方唯一完整创作上下文）】');
    expect(prompt).toContain('已确认题材是最高事实基准');
    expect(prompt).toContain('每一项仍须回读对应的实际原文才能确定');
    expect(prompt).toContain('没有明确证据，填写"unavailable"或留空');
    expect(prompt).not.toContain('必须以世界观为唯一事实依据');
    expect(prompt).not.toContain('characterFactLedger');
    expect(prompt).toContain('characterEvidenceLocations');
    expect(prompt).toContain('不为凑固定人数添加女主角、反派、导师或同盟');
    expect(prompt).toContain('未规划成长变化时 growthTags=[]');
    expect(prompt).toContain('没有足够依据写[]');
    expect(prompt).toContain('"growthTags":[],"tags":[]');
    expect(prompt).toContain('【关系与过去】relationships仅收录已确认关系');
    expect(prompt).toContain('"relationships":[]');
    expect(prompt).toContain('缺证据留空，不补造过往事件');
    expect(prompt).not.toContain('"role":"主角|女主角|重要配角|主要反派|导师同盟|其他"');
    expect(prompt).not.toContain('"relationships":[{"targetName":');
    expect(prompt).not.toContain('需要包含 5 个核心人物');
    expect(prompt).not.toContain('童年被关地下室导致幽闭恐惧');
    expect(controllerSource).toContain('const confirmedCharacterNames = [');
    expect(controllerSource).toContain('const characterEvidenceLocations = [...new Set(confirmedCharacterNames)]');
    expect(controllerSource).toContain('confirmedStoryFields: Object.entries(dto.selectedIdea || {})');
    expect(controllerSource).toContain('chapterOrders: generatedChapterContext.filter');
    expect(controllerSource).not.toContain('confirmedStoryEvidence: Object.fromEntries');
    expect(controllerSource).not.toContain('chapterEvidence: generatedChapterContext');
    expect(controllerSource).toContain('normalizeGeneratedCharacters(value)');
  });

  it('does not run a late world-depth mutation after downstream canon exists', () => {
    expect(controllerSource).not.toContain('// 世界观 depth\n    enrichTasks.push');
    expect(controllerSource).toContain('世界观已经冻结，只作为输入；顺序：组织 → 地点 → 大纲 → 伏笔');
  });

  it('keeps batch audit out of confirmedStory and persists it separately for diagnostics', () => {
    const splitAt = indexOrFail(controllerSource, 'separateIdeaDiscoveryAudit(rawSelectedIdea)');
    const storyAt = indexOrFail(controllerSource, 'constitution.confirmedStory = confirmedStory;');
    const auditAt = indexOrFail(controllerSource, '...(ideaDiscoveryAudit ? { ideaDiscoveryAudit } : {})');
    expect(splitAt).toBeLessThan(storyAt);
    expect(storyAt).toBeLessThan(auditAt);
    expect(controllerSource).toContain('ideaDiscoveryAudit: _untrustedIdeaDiscoveryAudit');
    expect(controllerSource).not.toContain('constitution.confirmedStory = dto.selectedIdea');
  });

  it('routes early creation failures through the persisted failure boundary before returning', () => {
    const unavailableAt = indexOrFail(controllerSource, 'if (!llmAvailable) {');
    const unavailableBoundaryAt = controllerSource.indexOf("persistCreationFailure('preflight', errMsg", unavailableAt);
    const unavailableReturnAt = controllerSource.indexOf('return;', unavailableAt);
    expect(unavailableBoundaryAt).toBeGreaterThan(unavailableAt);
    expect(unavailableBoundaryAt).toBeLessThan(unavailableReturnAt);

    const worldFailureAt = indexOrFail(controllerSource, '世界观生成失败，未继续生成大纲，避免上下文不一致。');
    const worldBoundaryAt = controllerSource.indexOf("persistCreationFailure('world', message", worldFailureAt);
    const worldReturnAt = controllerSource.indexOf('return;', worldFailureAt);
    expect(worldBoundaryAt).toBeGreaterThan(worldFailureAt);
    expect(worldBoundaryAt).toBeLessThan(worldReturnAt);
    expect(controllerSource).toContain('失败状态写入失败');
    expect(controllerSource).not.toContain("catch {}\n      this.emitProjectProgress(projectId, { type: 'error', cancelled:");
  });

});
