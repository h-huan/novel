import { describe, expect, it } from 'vitest';
import {
  CROSS_STAGE_MUTABLE_ENTITY_TYPES,
  CROSS_STAGE_PATCH_TABLE_MAP,
  applyCrossStagePatch,
  isImmutableWorldPatchTarget,
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

  it('never authorizes a live Canon mutation before candidate re-review', () => {
    expect(applyCrossStagePatch('核心内容：十四户。', '十四户', '十三户')).toBeNull();
    expect(applyCrossStagePatch('["倒退一小时"]', '一小时', '两小时')).toBeNull();
  });

  it('also rejects missing, ambiguous, or malformed suggestions', () => {
    expect(applyCrossStagePatch('十四户、十四户', '十四户', '十三户')).toBeNull();
    expect(applyCrossStagePatch('十四户', '十三户', '十二户')).toBeNull();
    expect(applyCrossStagePatch('["倒退一小时"]', '一小时', '"两小时')).toBeNull();
  });
});
