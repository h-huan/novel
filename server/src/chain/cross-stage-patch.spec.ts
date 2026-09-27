import { describe, expect, it } from 'vitest';
import { applyCrossStagePatch } from './cross-stage-patch';

describe('cross-stage repair source anchoring', () => {
  it('preserves the complete chapter when the review saw only an excerpt', () => {
    const original = '核心内容：十四户。' + '后续场景'.repeat(400) + '\n结尾设置：推门';
    const repaired = applyCrossStagePatch(original, '十四户', '十三户');
    expect(repaired).toBe('核心内容：十三户。' + '后续场景'.repeat(400) + '\n结尾设置：推门');
  });

  it('rejects missing or ambiguous anchors', () => {
    expect(applyCrossStagePatch('十四户、十四户', '十四户', '十三户')).toBeNull();
    expect(applyCrossStagePatch('十四户', '十三户', '十二户')).toBeNull();
  });

  it('does not break JSON fields', () => {
    expect(applyCrossStagePatch('["倒退一小时"]', '一小时', '两小时')).toBe('["倒退两小时"]');
    expect(applyCrossStagePatch('["倒退一小时"]', '一小时', '"两小时')).toBeNull();
  });
});
