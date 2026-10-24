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
    expect(controllerSource).toContain('qualifiedIdeas: acceptedWithAudit');
    expect(controllerSource).toContain("if (partial) {");
    expect(controllerSource).not.toContain("stoppedAt:'premise_preselection'");
  });
  it('avoids reviewing an unchanged selection twice and projects chapter events consistently', () => {
    expect(controllerSource).toContain('selectionChangeScope(initial,selected)');
    expect(controllerSource).toContain('reviewBoth(selected,changeScope,initialReview)');
    expect(controllerSource).toContain('retainPremiseReviewEvidence(initial,initialReview,selected)');
    expect(controllerSource).toContain('【本章事件与状态唯一来源】');
    expect(controllerSource).toContain('同一时点不得同时在两个人手中或两个地点');
  });

  it('prevents cross-channel message contradictions and protects explicit action evidence during outline repair', () => {
    expect(controllerSource).toContain('【通信渠道与同源事件约束】');
    expect(controllerSource).toContain('私聊回复不能被投影成群消息回复');
    expect(controllerSource).toContain('询问某人不等于已经得到答复');
    expect(controllerSource).toContain('核定金额、签署协议、办手续不等于款项实际发放或收到');
    expect(controllerSource).toContain('不能推出整个后续时间段“始终没再进去”');
    expect(controllerSource).toContain('只写记录人记下姓名不能作为已记下具体观察的依据');
    expect(controllerSource).toContain('scenes.outcome和characterActions.result只能保留为待查状态');
    expect(controllerSource).toContain('【通信渠道矛盾修复规则】');
    expect(controllerSource).toContain('不得删除或忽略该直接证据去迁就错误审查');
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
