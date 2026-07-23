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

  it('repairs valid legacy array output without truncating nested objects', () => {
    expect(extractIdeaList('[{"title":"旧梦","meta":{"hook":"[异响]"}}]')).toEqual([
      { title: '旧梦', meta: { hook: '[异响]' } },
    ]);
  });

  it('uses one json_object batch call for the requested ideas instead of sequential per-idea calls', async () => {
    const idea = (index: number) => ({
      title: `倒计时证词${index}`,
      alternateTitles: ['失效证词', '最后一夜'],
      angle: '限时悬疑',
      hook: '死者在直播中点名主角偷走证词，十二小时后直播证据会被永久销毁，主角必须先证明自己没有杀人。',
      description: '主角为夺回被篡改的证词潜入封锁现场，却发现每一位证人都在替同一个不存在的人作证。追查迫使他公开旧案中的伪证，盟友因此倒戈；为了确认幕后者的身份，他又必须回到当年签署鉴定书的地下档案室，面对被自己毁掉前途的家属。最终他必须在直播销毁前承认自己的责任，才能让真正的凶手现身，并阻止所有证人继续替谎言作证。',
      setting: '当代封闭城区', protagonist: '被停职的法证员', characters: ['法证员', '证人', '凶手'],
      styleTags: ['悬疑'], tone: '紧迫冷峻', estimatedWords: 16000, plannedChapters: 4,
      scopeBreakdown: [{ arc: '锁定证词与反转', chapters: 4, reason: '四次证据翻转和一次不可逆公开足以完成事件链' }],
      scopeReason: '四章分别承载异常、追查、选择和回收，按每章四千字完成。',
      coreConflict: '主角必须公开旧案伪证才能阻止证据销毁，而公开会毁掉他唯一的清白。',
      uniquePoint: '证词会在直播中自行改写，所有人都被迫成为同一份谎言的证人。',
      mainReversal: '主角发现被篡改的证词出自自己当年签字的鉴定书。',
    });
    const generate = vi.fn(async () => ({ content: JSON.stringify({ ideas: [1, 2, 3, 4, 5].map(idea) }) }));
    const controller = new ChainController(...Array(18).fill(null) as any);
    (controller as any).realLLM = { generate };

    const result = await controller.ideaDiscover({ storyType: 'short_story', platform: 'fanqie', count: 5, targetWords: '16000' });

    expect(result).toMatchObject({ success: true, totalIdeas: 5 });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0]).toMatchObject({ scenario: 'idea_generate', responseFormat: 'json_object' });
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

describe('chapter outline alignment gate', () => {
  const input = {
    chapterIndex: 1,
    chapterTitle: '雨夜的来信',
    outlineContract: '核心内容：林岚在旧档案室收到一封来自失踪姐姐的信。核心冲突：信封上的邮戳来自已经拆除的邮局。人物行动：她带着信去找门卫核对值班记录。本章结尾钩子：门卫认出信上的笔迹，却拒绝解释。',
    storyContext: '世界观：当代城市。角色：林岚的姐姐三年前失踪。',
    content: '林岚推开旧档案室的门，信封正压在姐姐的旧卷宗上。',
  };

  it('only accepts a structured, explicit pass verdict', async () => {
    const controller = new ChainController(...Array(18).fill(null) as any);
    (controller as any).realLLM = {
      generate: vi.fn(async () => ({ content: JSON.stringify({ pass: true, outlineAligned: true, continuityPassed: true, characterPassed: true, worldPassed: true, timelinePassed: true, prosePassed: true, missingRequiredItems: [], contradictions: [], evidence: ['正文写入了信件与门卫'] }) })),
    };
    await expect((controller as any).assertGeneratedChapterAlignment(input)).resolves.toMatchObject({
      outlineAligned: true,
      continuityPassed: true,
      characterPassed: true,
      worldPassed: true,
      timelinePassed: true,
      prosePassed: true,
    });
  });

  it('rejects prose that does not enact the bound outline before persistence', async () => {
    const controller = new ChainController(...Array(18).fill(null) as any);
    (controller as any).realLLM = {
      generate: vi.fn(async () => ({ content: JSON.stringify({ pass: false, missingRequiredItems: ['未出现门卫核对值班记录'], contradictions: [], evidence: ['正文改成了另一桩案件'] }) })),
    };
    await expect((controller as any).assertGeneratedChapterAlignment(input)).rejects.toMatchObject({ status: 422 });
  });

  it('does not treat a bare pass flag as a completed post-write quality inspection', async () => {
    const controller = new ChainController(...Array(18).fill(null) as any);
    (controller as any).realLLM = {
      generate: vi.fn(async () => ({ content: JSON.stringify({ pass: true, missingRequiredItems: [], contradictions: [], evidence: [] }) })),
    };
    await expect((controller as any).assertGeneratedChapterAlignment(input)).rejects.toMatchObject({ status: 422 });
  });

  it('rejects instead of saving when the configured reviewer cannot be reached', async () => {
    const controller = new ChainController(...Array(18).fill(null) as any);
    (controller as any).realLLM = { generate: vi.fn(async () => { throw new Error('Connection error'); }) };
    await expect((controller as any).assertGeneratedChapterAlignment(input)).rejects.toMatchObject({ status: 502 });
  });
});
