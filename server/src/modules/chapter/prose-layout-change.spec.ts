import { expect, it } from 'vitest';
import { isProseLayoutOnlyChange } from './prose-layout-change';
it('accepts paragraph and display delimiters with identical text', () => {
  expect(isProseLayoutOnlyChange('提示：口令错误。程野停下。', '提示：\n【口令错误。】\n\n程野停下。')).toBe(true);
});
it('rejects changed text, punctuation, times, order, titles and English word boundaries', () => {
  for (const after of ['提示：口令正确。程野停下。', '提示：口令错误！程野停下。', '程野停下。提示：口令错误。', '【系统】提示：口令错误。程野停下。']) {
    expect(isProseLayoutOnlyChange('提示：口令错误。程野停下。', after)).toBe(false);
  }
  expect(isProseLayoutOnlyChange('23:41', '23:47')).toBe(false);
  expect(isProseLayoutOnlyChange('is not', 'isnot')).toBe(false);
  expect(isProseLayoutOnlyChange('read log', 'read\nlog')).toBe(true);
});
it('does not treat unchanged or empty text as a new formatting revision', () => {
 expect(isProseLayoutOnlyChange('原文。', '原文。')).toBe(false);
 expect(isProseLayoutOnlyChange('', '【】')).toBe(false);
});
