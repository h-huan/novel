import { describe, expect, it } from 'vitest';
import { applyCrossStagePatch } from './cross-stage-patch';

describe('cross-stage Canon mutation boundary', () => {
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
