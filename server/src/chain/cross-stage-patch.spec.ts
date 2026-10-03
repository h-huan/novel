import { describe, expect, it } from 'vitest';
import {
  CROSS_STAGE_MUTABLE_ENTITY_TYPES,
  CROSS_STAGE_PATCH_TABLE_MAP,
  applyCrossStagePatch,
  isImmutableWorldPatchTarget,
  selectMinimumImpactCrossStagePatches,
} from './cross-stage-patch';

describe('cross-stage Canon mutation boundary', () => {
  it('never exposes world canon as an automatic repair target', () => {
    expect(CROSS_STAGE_MUTABLE_ENTITY_TYPES).not.toContain('world');
    expect(CROSS_STAGE_MUTABLE_ENTITY_TYPES).not.toContain('worldProfile');
    expect(CROSS_STAGE_PATCH_TABLE_MAP.world).toBeUndefined();
    expect(CROSS_STAGE_PATCH_TABLE_MAP.worldProfile).toBeUndefined();
    expect(isImmutableWorldPatchTarget('world')).toBe(true);
    expect(isImmutableWorldPatchTarget('worldProfile')).toBe(true);
  });

  it('builds a pure candidate patch without mutating the original value', () => {
    const original = '核心内容：十四户。';
    expect(applyCrossStagePatch(original, '十四户', '十三户')).toBe('核心内容：十三户。');
    expect(original).toBe('核心内容：十四户。');
    expect(applyCrossStagePatch('["倒退一小时"]', '一小时', '两小时')).toBe('["倒退两小时"]');
  });

  it('rejects missing, ambiguous, or JSON-breaking suggestions', () => {
    expect(applyCrossStagePatch('十四户、十四户', '十四户', '十三户')).toBeNull();
    expect(applyCrossStagePatch('十四户', '十三户', '十二户')).toBeNull();
    expect(applyCrossStagePatch('["倒退一小时"]', '一小时', '"两小时')).toBeNull();
  });

  it('chooses the smallest-impact target for the same contradiction and keeps same-target field patches together', () => {
    const selected = selectMinimumImpactCrossStagePatches([
      { entityType: 'character', entityId: 'char-1', field: 'background', match: '十四户', replacement: '十三户', reason: '户数冲突', dependentCount: 4 },
      { entityType: 'chapter', entityId: 'chapter-8', field: 'content', match: '十四户', replacement: '十三户', reason: '户数冲突', dependentCount: 1 },
      { entityType: 'chapter', entityId: 'chapter-8', field: 'scenes', match: '十四户', replacement: '十三户', reason: '户数冲突', dependentCount: 1 },
      { entityType: 'world', entityId: 'world-1', field: 'rules', match: '十四户', replacement: '十三户', reason: '户数冲突', dependentCount: 0 },
    ]);
    expect(selected).toHaveLength(2);
    expect(selected.every(item => item.entityType === 'chapter' && item.entityId === 'chapter-8')).toBe(true);
  });
});
