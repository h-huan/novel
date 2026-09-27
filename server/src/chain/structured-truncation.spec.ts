import { describe, expect, it } from 'vitest';
import {
  STRUCTURED_JSON_OUTPUT_CEILING,
  STRUCTURED_TRUNCATION_FLAG,
  StructuredOutputTruncatedError,
  isStructuredOutputTruncated,
  structuredTruncationError,
} from './structured-truncation';

describe('structured-truncation: 唯一标记与唯一上限', () => {
  it('硬顶与最大场景配置对齐（32768）', () => {
    expect(STRUCTURED_JSON_OUTPUT_CEILING).toBe(32768);
    expect(STRUCTURED_TRUNCATION_FLAG).toBe('structuredOutputTruncated');
  });

  it('判定只认结构化标记，不认错误文案前缀', () => {
    const lookalike = new Error('结构化生成因输出长度被截断，已扩容至 32768 仍不足');
    expect(isStructuredOutputTruncated(lookalike)).toBe(false);

    const real = structuredTruncationError('结构化生成因输出长度被截断', { maxTokens: 24576 });
    expect(isStructuredOutputTruncated(real)).toBe(true);
  });

  it('非对象输入一律判否，不抛异常', () => {
    expect(isStructuredOutputTruncated(null)).toBe(false);
    expect(isStructuredOutputTruncated(undefined)).toBe(false);
    expect(isStructuredOutputTruncated('structuredOutputTruncated')).toBe(false);
    expect(isStructuredOutputTruncated({ structuredOutputTruncated: false })).toBe(false);
  });

  it('错误保留原文案前缀，并挂上上限/场景/模型上下文', () => {
    const err = structuredTruncationError('结构化生成因输出长度被截断（正文）', {
      maxTokens: 32768,
      scenario: 'outline',
      model: 'deepseek-flash',
    });
    expect(err).toBeInstanceOf(StructuredOutputTruncatedError);
    expect(err.name).toBe('StructuredOutputTruncatedError');
    expect(err.message.startsWith('结构化生成因输出长度被截断')).toBe(true);
    expect(err.message).toContain('maxTokens=32768');
    expect(err.message).toContain('scenario=outline');
    expect(err.message).toContain('model=deepseek-flash');
    expect(err.context).toEqual({ maxTokens: 32768, scenario: 'outline', model: 'deepseek-flash' });
    expect(err.structuredOutputTruncated).toBe(true);
  });

  it('缺省场景回落到 daily，缺省模型显式为 unknown（不静默留空）', () => {
    const err = structuredTruncationError('结构化生成因输出长度被截断', { maxTokens: 4096 });
    expect(err.message).toContain('scenario=daily');
    expect(err.message).toContain('model=unknown');
  });
});