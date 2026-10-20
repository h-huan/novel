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
  it('never lets a later generated world overwrite a confirmed short-story causal foundation', () => {
    const start = indexOrFail(controllerSource, 'const worldContinuityDirective = worldRowForOutline');
    const end = controllerSource.indexOf('if (isShort) {', start);
    expect(end).toBeGreaterThan(start);
    const directive = controllerSource.slice(start, end);
    expect(directive).toContain('仅可补充已确认题材，不得覆盖故事卡的已锁定事实');
    expect(directive).toContain('${STORY_FACT_PRIORITY}');
    expect(directive).toContain('不得以世界规则反向改写原有触发、能力、时序、因果、真相或结局');
    expect(directive).not.toContain('高于故事卡和章纲措辞');
    expect(controllerSource).toContain('【核心层级纪律（最高优先级）】${STORY_FACT_PRIORITY}');
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
});
