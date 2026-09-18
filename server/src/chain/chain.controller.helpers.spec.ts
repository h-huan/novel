import { describe, expect, it, vi } from 'vitest';
import {
  ChainController,
  canFitChapterWordRange,
  canFitStoryTargetWords,
  parsePositiveTargetWords,
  resolveDiscoveryTargetWords,
  serializeGeneratedSqlText,
  extractBalancedJson,
  extractIdeaList,
} from './chain.controller';

describe('structured generation quality retry', () => {
  it('feeds the real Gate issue back to the same structured task instead of reporting a parse failure', async () => {
    vi.useFakeTimers();
    try {
      const gateError = Object.assign(new Error('质量 Gate blocked：新增未授权人物“律师”'), {
        generatedContent: '{"title":"第一章","character":"律师"}',
      });
      const generate = vi.fn()
        .mockRejectedValueOnce(gateError)
        .mockResolvedValueOnce({ content: '{"title":"第一章","character":"林铎"}' });
      const controller = Object.create(ChainController.prototype) as any;
      controller.realLLM = { generate };
      controller.logger = { warn: vi.fn(), error: vi.fn() };

      const pending = controller.llmCallWithRetry('第1章详细大纲', '只输出JSON', {
        scenario: 'outline',
        validate: (value: any) => value?.character === '林铎',
      });
      await vi.runAllTimersAsync();
      const result = await pending;

      expect(result.data.character).toBe('林铎');
      expect(generate).toHaveBeenCalledTimes(2);
      expect(generate.mock.calls[1][0].prompt).toContain('新增未授权人物“律师”');
      expect(result.warnings).not.toContain('第1章详细大纲生成结果无法解析');
    } finally {
      vi.useRealTimers();
    }
  });

  it('allows a third constrained attempt when a Gate error has no attached candidate', async () => {
    vi.useFakeTimers();
    try {
      const generate = vi.fn()
        .mockRejectedValueOnce(new Error('质量 Gate blocked：本章重复前章事件'))
        .mockRejectedValueOnce(new Error('质量 Gate blocked：本章提前执行下一章任务'))
        .mockResolvedValueOnce({ content: '{"title":"第二章","boundary":"ok"}' });
      const controller = Object.create(ChainController.prototype) as any;
      controller.realLLM = { generate };
      controller.logger = { warn: vi.fn(), error: vi.fn() };

      const pending = controller.llmCallWithRetry('第2章详细大纲', '只输出JSON', {
        scenario: 'outline',
        validate: (value: any) => value?.boundary === 'ok',
      });
      await vi.runAllTimersAsync();
      const result = await pending;

      expect(result.data.boundary).toBe('ok');
      expect(generate).toHaveBeenCalledTimes(3);
      expect(generate.mock.calls[1][0].prompt).toContain('本章重复前章事件');
      expect(generate.mock.calls[2][0].prompt).toContain('本章提前执行下一章任务');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('discovery target word planning helpers', () => {
  it('parses configured and AI-planned target word formats', () => {
    expect(parsePositiveTargetWords(2_000_000)).toBe(2_000_000);
    expect(parsePositiveTargetWords('200万字')).toBe(2_000_000);
    expect(parsePositiveTargetWords('320,000')).toBe(320_000);
    expect(parsePositiveTargetWords('')).toBeNull();
    expect(parsePositiveTargetWords('很多')).toBeNull();
  });

  it('accepts only totals that can be exactly carried by 3200-4000 word chapters', () => {
    expect(canFitChapterWordRange(8_000)).toBe(true);
    expect(canFitChapterWordRange(2_000_000)).toBe(true);
    expect(canFitChapterWordRange(5_000)).toBe(false);
    expect(canFitChapterWordRange(0)).toBe(false);
  });

  it('enforces the short-story reading range without imposing a cap on long fiction', () => {
    expect(canFitStoryTargetWords(8_000, 'short_story')).toBe(true);
    expect(canFitStoryTargetWords(35_000, 'short_story')).toBe(true);
    expect(canFitStoryTargetWords(7_999, 'short_story')).toBe(false);
    expect(canFitStoryTargetWords(35_001, 'short_story')).toBe(false);
    expect(canFitStoryTargetWords(99_999, 'long_novel')).toBe(false);
    expect(canFitStoryTargetWords(100_000, 'long_novel')).toBe(true);
    expect(canFitStoryTargetWords(2_000_000, 'long_novel')).toBe(true);
  });

  it('strictly uses configured words and only falls back to the selected idea when blank', () => {
    expect(resolveDiscoveryTargetWords(2_000_000, { estimatedWords: 500_000 })).toEqual({
      targetWords: 2_000_000,
      source: 'configured',
    });
    expect(resolveDiscoveryTargetWords(undefined, { estimatedWords: '50万字' })).toEqual({
      targetWords: 500_000,
      source: 'idea',
    });
    expect(resolveDiscoveryTargetWords(0, { estimatedWords: 500_000 }).source).toBe('invalid_config');
    expect(resolveDiscoveryTargetWords(undefined, {}).source).toBe('missing');
  });
});

describe('balanced model JSON extraction', () => {
  it('extracts nested JSON surrounded by model commentary', () => {
    const parsed = extractBalancedJson<any>('结果如下：\n```json\n{"title":"第一章","scenes":[{"goal":"调查","result":{"found":true}}]}\n```');
    expect(parsed?.scenes?.[0]?.result?.found).toBe(true);
  });

  it('ignores brackets inside JSON strings', () => {
    expect(extractBalancedJson<any>('prefix {"hook":"门后传来[异响]","items":[]} suffix')).toEqual({
      hook: '门后传来[异响]',
      items: [],
    });
  });
});

describe('idea discovery structured output', () => {
  it('accepts the json_object-compatible ideas wrapper with nested fields', () => {
    expect(extractIdeaList('{"ideas":[{"title":"门后有声","scopeBreakdown":[{"arc":"开局","chapters":2,"reason":"建立危机"}]}]}')).toEqual([
      { title: '门后有声', scopeBreakdown: [{ arc: '开局', chapters: 2, reason: '建立危机' }] },
    ]);
  });

  it('rejects obsolete top-level array output instead of maintaining a second response contract', () => {
    expect(extractIdeaList('[{"title":"旧梦","meta":{"hook":"[异响]"}}]')).toBeNull();
  });
});

describe('generated SQLite text boundary', () => {
  it('keeps strings and converts primitive values', () => {
    expect(serializeGeneratedSqlText('现实都市')).toBe('现实都市');
    expect(serializeGeneratedSqlText(3)).toBe('3');
    expect(serializeGeneratedSqlText(false)).toBe('false');
  });

  it('serializes object and array values instead of binding them directly', () => {
    expect(serializeGeneratedSqlText({ rule: '不能说谎' })).toBe('{"rule":"不能说谎"}');
    expect(serializeGeneratedSqlText(['医院', '法庭'])).toBe('["医院","法庭"]');
  });

  it('uses the supplied fallback for empty values', () => {
    expect(serializeGeneratedSqlText(null, '未设定')).toBe('未设定');
    expect(serializeGeneratedSqlText('', '未设定')).toBe('未设定');
  });
});


