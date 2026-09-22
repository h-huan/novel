import { describe, expect, it, vi } from 'vitest';
import {
  ChainController,
  canFitChapterWordRange,
  canFitStoryTargetWords,
  parsePositiveTargetWords,
  resolveDiscoveryTargetWords,
  resolveCreationChapterPlan,
  buildChapterContinuityLedgerEntry,
  collectOutlineForeshadowings,
  serializeGeneratedSqlText,
  extractBalancedJson,
  extractIdeaList,
  ideaSemanticSimilarity,
  parseChapterResponsibilityIssue,
  applyAuditedResponsibilityFixes,
  partitionAlignmentFindings,
} from './chain.controller';

describe('idea novelty and audited repair compilers', () => {
  it('detects renamed versions of the same premise but keeps distinct mechanisms apart', () => {
    const elevator = { title: '午夜电梯', description: '夜班保安进入循环电梯，违反规则后身份逐字消失，必须在天亮前救妹妹。' };
    const renamed = { title: '凌晨升降机', description: '值夜保安困在反复循环的升降机，犯规就被抹去身份，要在日出前寻找妹妹。' };
    const courtroom = { title: '最后一份证词', description: '退休速记员从庭审停顿中识别伪证，为翻案走访旧案证人并承担作伪旧责。' };
    expect(ideaSemanticSimilarity(elevator, renamed)).toBeGreaterThan(ideaSemanticSimilarity(elevator, courtroom));
    expect(ideaSemanticSimilarity(elevator, courtroom)).toBeLessThan(0.42);
  });

  it('parses the auditor fix and replaces the violating chapter without another model call', () => {
    const issue = JSON.stringify({
      chapter: 1,
      task: '门禁显示今晚刷卡记录',
      conflict: '规则不能改写现实门禁记录',
      retain: '五点前上楼确认妹妹去向',
      fix: '只查到三年前真实最后记录；当晚失联由电话不通和加班登记推断',
    });
    expect(parseChapterResponsibilityIssue(issue)?.chapter).toBe(1);
    const applied = applyAuditedResponsibilityFixes([
      { title: '入楼', func: 'opening', brief: '门禁显示今晚刷卡记录' },
      { title: '追查', func: 'conflict', brief: '继续追查' },
    ], [issue]);
    expect(applied.applied).toHaveLength(1);
    expect(applied.chapterTitles[0].brief).toContain('三年前真实最后记录');
    expect(applied.chapterTitles[0].brief).not.toContain('门禁显示今晚刷卡记录');
  });
});

describe('structured generation quality retry', () => {
  it('skips the prose quality Gate for schema-validated JSON by default', async () => {
    const generate = vi.fn().mockResolvedValue({ content: '{"title":"第一章"}' });
    const controller = Object.create(ChainController.prototype) as any;
    controller.realLLM = { generate };
    controller.logger = { warn: vi.fn(), error: vi.fn() };

    await controller.llmCallWithRetry('章节结构', '只输出JSON', {
      scenario: 'outline',
      validate: (value: any) => value?.title === '第一章',
    });

    expect(generate).toHaveBeenCalledWith(expect.objectContaining({
      responseFormat: 'json_object',
      deferQualityGate: true,
    }));
  });

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

  it('allows another attempt only when the Gate adds new information and accumulates all issues', async () => {
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
      expect(generate.mock.calls[2][0].prompt).toContain('本章重复前章事件');
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops when the same Gate issue repeats instead of spending a quota of retries', async () => {
    vi.useFakeTimers();
    try {
      const repeated = new Error('质量 Gate blocked：人物无证据直接泄密');
      const generate = vi.fn().mockRejectedValue(repeated);
      const controller = Object.create(ChainController.prototype) as any;
      controller.realLLM = { generate };
      controller.logger = { warn: vi.fn(), error: vi.fn() };

      const pending = controller.llmCallWithRetry('第4章详细大纲', '只输出JSON', { scenario: 'outline' });
      const assertion = expect(pending).rejects.toThrow('人物无证据直接泄密');
      await vi.runAllTimersAsync();
      await assertion;
      expect(generate).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('chapter alignment evaluation availability', () => {
  it('uses one sufficiently sized review call and marks truncation as not_evaluated', async () => {
    const generate = vi.fn().mockRejectedValue(new Error('结构化生成因输出长度被截断'));
    const controller = Object.create(ChainController.prototype) as any;
    controller.realLLM = { generate };

    const report = await controller.checkChapterAlignment({
      projectId: 'p1', chapterIndex: 1, chapterTitle: '第一章',
      outlineContract: '有效详细大纲'.repeat(30), storyContext: '已确认上下文', content: '正文内容',
    });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({
      maxTokens: 32768,
      maxEmptyRetries: 0,
      metrics: expect.objectContaining({ projectId: 'p1', chapterIndex: 1, stepKey: 'alignment_review' }),
    }));
    expect(report.evaluationStatus).toBe('not_evaluated');
  });

  it('never rewrites the chapter when the evaluator itself is unavailable', async () => {
    const controller = Object.create(ChainController.prototype) as any;
    controller.logger = { warn: vi.fn(), error: vi.fn() };
    controller.getActiveLessons = vi.fn().mockReturnValue('');
    controller.generateBodyWithLengthGuard = vi.fn().mockResolvedValue('正文'.repeat(1800));
    controller.assertGeneratedChapterIdentity = vi.fn();
    controller.checkChapterAlignment = vi.fn().mockResolvedValue({
      evaluationStatus: 'not_evaluated', pass: false,
      missing: ['本章大纲一致性审查调用失败：输出截断'], contradictions: [], evidence: [],
      advisories: [], sourceConflicts: [],
      outlineAligned: false, continuityPassed: false, characterPassed: false,
      worldPassed: false, timelinePassed: false, prosePassed: false,
    });
    controller.buildAlignmentRepairPrompt = vi.fn();
    controller.persistAlignmentContradictions = vi.fn();

    await expect(controller.generateBodyWithAlignmentGuard({
      projectId: 'p1', basePrompt: '写正文', targetWords: 4000,
      scenario: 'writing_climax', chapterIndex: 1, chapterTitle: '第一章',
      outlineContract: '有效详细大纲'.repeat(30), storyContext: '已确认上下文',
      wordRange: { min: 3000, max: 5000 },
    })).rejects.toMatchObject({ status: 503 });

    expect(controller.generateBodyWithLengthGuard).toHaveBeenCalledTimes(1);
    expect(controller.checkChapterAlignment).toHaveBeenCalledTimes(1);
    expect(controller.buildAlignmentRepairPrompt).not.toHaveBeenCalled();
  });
});

describe('alignment finding partition', () => {
  const outline = '本章必须：断供第三日，主角验毒，让师兄吃下锅气菜后显出毒斑。';

  it('keeps a repeated body reaction visible as an advisory instead of blocking the save', () => {
    const partition = partitionAlignmentFindings([
      '第2、3段短距离重复同一句身体反应描写，措辞重复且句式重复',
    ], outline);
    expect(partition.blocking).toEqual([]);
    expect(partition.advisories).toHaveLength(1);
    expect(partition.sourceConflicts).toEqual([]);
  });

  it('still blocks a chapter that genuinely misses a required outline event', () => {
    const partition = partitionAlignmentFindings([
      '正文未出现「师兄吃下锅气菜后显出毒斑」这一必需事件，本章要求的事件缺失',
    ], outline);
    expect(partition.blocking).toHaveLength(1);
    expect(partition.advisories).toEqual([]);
  });

  it('reports a world-archive claim that contradicts the detailed outline as a source conflict', () => {
    const partition = partitionAlignmentFindings([
      '世界观档案写的是第三日才断供，与详细大纲的断供时间线互相矛盾',
    ], outline);
    expect(partition.sourceConflicts).toHaveLength(1);
    expect(partition.blocking).toEqual([]);
  });
});

describe('chapter responsibility semantic repair', () => {
  const initialPlan = [
    { order: 0, title: '断供', func: 'development', brief: '断供第三日，弟子灵基不稳' },
    { order: 1, title: '验毒', func: 'climax', brief: '让师兄吃下锅气菜后显出毒斑' },
  ];

  const repairedChapters = (firstResponsibility: string) => ({
    data: {
      chapters: [
        { order: 1, title: '断供', function: 'development', responsibility: firstResponsibility },
        { order: 2, title: '验毒', function: 'climax', responsibility: '明确师兄在九名食客内，吃下锅气菜后显出毒斑' },
      ],
    },
  });

  it('applies structured auditor fixes deterministically and only re-audits once', async () => {
    const controller = Object.create(ChainController.prototype) as any;
    controller.logger = { warn: vi.fn(), error: vi.fn() };
    controller.llmCallWithRetry = vi.fn();
    const audit = vi.fn().mockResolvedValue([]);
    const issue = JSON.stringify({
      chapter: 1,
      task: '影子主动模仿并诱导回头',
      conflict: '影子没有主动行为能力',
      retain: '维持再次回头的心理诱惑',
      fix: '影子只站在轿厢外；诱惑来自镜面和楼层环境异响',
    });

    const result = await controller.repairChapterResponsibilityPlan({
      chapterTitles: initialPlan,
      initialIssues: [issue],
      canonicalCreativeBrief: '电梯规则怪谈',
      shortStoryCard: null,
      worldContinuityDirective: '影子仅替他站在轿厢外',
      isShort: true,
      audit,
    });

    expect(result.issues).toEqual([]);
    expect(result.chapterTitles[0].brief).toContain('只站在轿厢外');
    expect(controller.llmCallWithRetry).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledTimes(1);
  });

  it('compiles the reported device-record and shadow-capability fixes in one pass', async () => {
    const controller = Object.create(ChainController.prototype) as any;
    controller.logger = { warn: vi.fn(), error: vi.fn() };
    controller.llmCallWithRetry = vi.fn();
    const issues = [
      JSON.stringify({
        chapter: 1,
        task: '门禁电子摘要显示今晚刷卡进入且手机屏幕被规则改写',
        conflict: '规则只作用于感知和身份痕迹，不能改写现实门禁与设备记录',
        retain: '五点前确认妹妹在二十四楼失联',
        fix: '门禁只显示三年前真实最后记录；当晚失联由电话不通与加班登记推断，手机只显示本就存在的旧通话记录',
      }),
      JSON.stringify({
        chapter: 3,
        task: '影子主动模仿动作并用声音诱导回头',
        conflict: '影子仅是替身痕迹，没有主动诱导能力',
        retain: '制造再次回头的心理诱惑',
        fix: '影子只站在轿厢外；诱惑来自镜面本身，异响来自楼层环境',
      }),
    ];
    const audit = vi.fn(async (plan: any[]) => {
      expect(plan[0].responsibility).toContain('三年前真实最后记录');
      expect(plan[0].responsibility).not.toContain('今晚刷卡进入');
      expect(plan[2].responsibility).toContain('只站在轿厢外');
      expect(plan[2].responsibility).not.toContain('主动模仿动作');
      return [];
    });

    const result = await controller.repairChapterResponsibilityPlan({
      chapterTitles: [
        { order: 0, title: '记录', func: 'opening', brief: '门禁电子摘要显示今晚刷卡进入且手机屏幕被规则改写' },
        { order: 1, title: '上楼', func: 'conflict', brief: '进入电梯并验证规则' },
        { order: 2, title: '影子', func: 'climax', brief: '影子主动模仿动作并用声音诱导回头' },
        { order: 3, title: '选择', func: 'resolution', brief: '完成不可逆选择' },
      ],
      initialIssues: issues,
      canonicalCreativeBrief: '夜班保安进入规则电梯寻找妹妹',
      shortStoryCard: null,
      worldContinuityDirective: '规则只作用于感知和身份痕迹；影子仅替他站在轿厢外',
      isShort: true,
      audit,
    });

    expect(result.issues).toEqual([]);
    expect(controller.llmCallWithRetry).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledTimes(1);
  });

  it('keeps repairing the latest candidate until the semantic audit passes', async () => {
    const controller = Object.create(ChainController.prototype) as any;
    controller.logger = { warn: vi.fn(), error: vi.fn() };
    controller.llmCallWithRetry = vi.fn()
      .mockResolvedValueOnce(repairedChapters('断供第三日，弟子灵基不稳'))
      .mockResolvedValueOnce(repairedChapters('断供已超三日，第四日弟子灵基不稳'));
    const audit = vi.fn()
      .mockResolvedValueOnce(['第三日尚未超过三日，触发条件仍不成立'])
      .mockResolvedValueOnce([]);

    const result = await controller.repairChapterResponsibilityPlan({
      chapterTitles: initialPlan,
      initialIssues: ['断供触发时点错误'],
      canonicalCreativeBrief: '食堂断供危机',
      shortStoryCard: { ending: '守住食堂' },
      worldContinuityDirective: '断供超过三日才会灵基不稳',
      isShort: true,
      projectId: 'project-1',
      audit,
    });

    expect(result.issues).toEqual([]);
    expect(result.chapterTitles[0].brief).toContain('第四日');
    expect(controller.llmCallWithRetry).toHaveBeenCalledTimes(2);
    expect(controller.llmCallWithRetry.mock.calls[0][2]).toMatchObject({
      scenario: 'daily',
      deferQualityGate: true,
      stepKey: 'chapter_responsibility_repair',
    });
    expect(controller.llmCallWithRetry.mock.calls[0][1]).toContain('亲属关系证明或失踪登记');
    expect(controller.llmCallWithRetry.mock.calls[0][1]).toContain('人物立场反转');
    expect(controller.llmCallWithRetry.mock.calls[0][1]).toContain('高权限响应');
    expect(controller.llmCallWithRetry.mock.calls[1][1]).toContain('第三日尚未超过三日');
    expect(controller.llmCallWithRetry.mock.calls[1][1]).toContain('断供第三日，弟子灵基不稳');
    expect(audit).toHaveBeenCalledTimes(2);
  });

  it('stops early after two different strategies make no progress', async () => {
    const controller = Object.create(ChainController.prototype) as any;
    controller.logger = { warn: vi.fn(), error: vi.fn() };
    controller.llmCallWithRetry = vi.fn().mockResolvedValue(repairedChapters('断供第三日，弟子灵基不稳'));
    const audit = vi.fn().mockResolvedValue(['触发条件仍不成立']);

    const result = await controller.repairChapterResponsibilityPlan({
      chapterTitles: initialPlan,
      initialIssues: ['断供触发时点错误'],
      canonicalCreativeBrief: '食堂断供危机',
      shortStoryCard: null,
      worldContinuityDirective: '断供超过三日才会灵基不稳',
      isShort: true,
      audit,
    });

    expect(result.issues).toEqual(['触发条件仍不成立']);
    expect(controller.llmCallWithRetry).toHaveBeenCalledTimes(2);
    expect(audit).toHaveBeenCalledTimes(2);
  });

  it('tries the historically successful strategy first and records only audited success', async () => {
    const controller = Object.create(ChainController.prototype) as any;
    controller.logger = { warn: vi.fn(), error: vi.fn() };
    controller.llmCallWithRetry = vi.fn().mockResolvedValue(
      repairedChapters('断供已超三日，第四日弟子灵基不稳'),
    );
    controller.generationMetrics = {
      selectChapterResponsibilityRepairStrategies: vi.fn().mockReturnValue([
        'full_replan', 'constraint_matrix', 'dependency_cascade',
      ]),
      recordChapterResponsibilityRepairAttempt: vi.fn(),
    };
    const audit = vi.fn().mockResolvedValue([]);

    await controller.repairChapterResponsibilityPlan({
      chapterTitles: initialPlan,
      initialIssues: ['断供触发时点错误'],
      canonicalCreativeBrief: '食堂断供危机',
      shortStoryCard: null,
      worldContinuityDirective: '断供超过三日才会灵基不稳',
      isShort: true,
      projectId: 'project-1',
      audit,
    });

    expect(controller.llmCallWithRetry).toHaveBeenCalledTimes(1);
    expect(controller.llmCallWithRetry.mock.calls[0][0]).toContain('full_replan');
    expect(controller.generationMetrics.recordChapterResponsibilityRepairAttempt)
      .toHaveBeenCalledWith('project-1', ['断供触发时点错误'], 'full_replan', true, []);
  });
});

describe('discovery target word planning helpers', () => {
  it('keeps a confirmed chapter count when it fits the 3000-5000 word contract', () => {
    expect(resolveCreationChapterPlan(24_000, { min: 3_000, max: 5_000 }, 5)).toEqual({
      minChapters: 5,
      maxChapters: 8,
      recommendedChapters: 5,
    });
  });

  it('falls back to a feasible calculated chapter count when the confirmed count cannot carry the target', () => {
    expect(resolveCreationChapterPlan(24_000, { min: 3_000, max: 5_000 }, 4)).toEqual({
      minChapters: 5,
      maxChapters: 8,
      recommendedChapters: 6,
    });
  });

  it('parses configured and AI-planned target word formats', () => {
    expect(parsePositiveTargetWords(2_000_000)).toBe(2_000_000);
    expect(parsePositiveTargetWords('200万字')).toBe(2_000_000);
    expect(parsePositiveTargetWords('320,000')).toBe(320_000);
    expect(parsePositiveTargetWords('')).toBeNull();
    expect(parsePositiveTargetWords('很多')).toBeNull();
  });

  it('accepts only totals that can be exactly carried by 3000-5000 word chapters', () => {
    expect(canFitChapterWordRange(8_000)).toBe(true);
    expect(canFitChapterWordRange(2_000_000)).toBe(true);
    expect(canFitChapterWordRange(5_000)).toBe(true);
    expect(canFitChapterWordRange(5_500)).toBe(false);
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

describe('creation context compaction', () => {
  it('keeps continuity facts without copying rendered outline labels', () => {
    const ledger = JSON.parse(buildChapterContinuityLedgerEntry({
      content: '陈野拿到备份卡',
      characterActions: [{ character: '陈野', action: '收起备份卡' }],
      characterStates: [{ character: '阿满', stateAfter: '被调离资料室' }],
      foreshadowing: [{ content: '卡套中还有空白卡' }],
      hook: '塔吊突然断电',
    }, 4));
    expect(ledger).toMatchObject({ chapter: 4, eventChain: '陈野拿到备份卡', hook: '塔吊突然断电' });
    expect(ledger.characterStates[0].stateAfter).toBe('被调离资料室');
  });

  it('extracts short-story foreshadowing from its original chapter evidence without re-generation', () => {
    const items = collectOutlineForeshadowings([
      { order: 3, scenes: JSON.stringify({ foreshadowing: [{ content: '卡套里有空白卡', evidenceText: '阿满把卡套交给陈野', plannedRecoveryChapter: 6 }] }) },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ buriedChapter: 4, recoveryChapter: 6, evidenceText: '阿满把卡套交给陈野' });
  });

  it('does not invent a recovery chapter when the outline did not provide a valid later chapter', () => {
    const items = collectOutlineForeshadowings([
      { order: 3, scenes: { foreshadowing: [{ content: '未定回收线索', plannedRecoveryChapter: 2 }] } },
    ]);
    expect(items[0].recoveryChapter).toBeNull();
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
describe('cross-chapter boundary enforcement', () => {
  const passVerdict = {
    pass: true,
    evaluationStatus: 'evaluated',
    requiredEvents: [{ event: '必需事件', covered: true, evidence: '证据' }],
    missingRequiredItems: [],
    contradictions: [],
    advisories: [],
    sourceConflicts: [],
    outlineAligned: true,
    continuityPassed: true,
    characterPassed: true,
    worldPassed: true,
    timelinePassed: true,
    prosePassed: true,
    evidence: ['证据'],
  };

  it('builds a compact subsequent chapter boundary list from outlines', () => {
    const db = {
      prepare: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('"order" IN')) {
          return { get: vi.fn().mockReturnValue({ order: 1 }) };
        }
        return {
          all: vi.fn().mockReturnValue([
            {
              title: '第二章',
              content: '改本藏线索，逼玩家自曝，追问出店长删监控',
              scenes: JSON.stringify({
                foreshadowingRecover: '回收左手来源',
                reversals: ['医生在扮演中露馅'],
                hook: '锁门直播倒计时',
              }),
            },
            {
              title: '第三章',
              content: '直播收凶，妹妹投稿反转落地',
              scenes: '{}',
            },
          ]),
        };
      }),
    };
    const controller = Object.create(ChainController.prototype) as any;
    controller.db = { getDb: () => db };

    const boundary = controller.buildSubsequentChapterBoundary('p1', 2);
    expect(boundary).toContain('后续章节边界');
    expect(boundary).toContain('不得提前消费');
    expect(boundary).toContain('第二章');
    expect(boundary).toContain('改本藏线索');
    expect(boundary).toContain('回收左手来源');
    expect(boundary).toContain('第三章');
    expect(boundary).not.toContain('【本章大纲】');
  });

  it('returns empty boundary for the final chapter or invalid input', () => {
    const db = {
      prepare: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('"order" IN')) {
          return { get: vi.fn().mockReturnValue({ order: 3 }) };
        }
        return { all: vi.fn().mockReturnValue([]) };
      }),
    };
    const controller = Object.create(ChainController.prototype) as any;
    controller.db = { getDb: () => db };
    expect(controller.buildSubsequentChapterBoundary('p1', 3)).toBe('');
    expect(controller.buildSubsequentChapterBoundary('', 1)).toBe('');
    expect(controller.buildSubsequentChapterBoundary('p1', 0)).toBe('');
  });

  it('injects the subsequent chapter boundary into the alignment review prompt', async () => {
    const generate = vi.fn().mockResolvedValue({ content: JSON.stringify(passVerdict) });
    const controller = Object.create(ChainController.prototype) as any;
    controller.realLLM = { generate };

    await controller.checkChapterAlignment({
      projectId: 'p1', chapterIndex: 2, chapterTitle: '第二章',
      outlineContract: '有效详细大纲'.repeat(30),
      storyContext: '已确认上下文',
      content: '正文内容',
      subsequentChapterBoundary: '【后续章节边界 · 本章不得提前消费】\n- 第三章：直播收凶、妹妹反转落地',
    });

    expect(generate).toHaveBeenCalledTimes(1);
    const prompt = String(generate.mock.calls[0][0].prompt);
    expect(prompt).toContain('【后续章节边界（本章不得提前消费）】');
    expect(prompt).toContain('第三章：直播收凶、妹妹反转落地');
    expect(prompt).toContain('跨章提前消费');
    expect(prompt).toContain('跨章断言冲突');
  });

  it('omits the boundary section when no subsequent chapters exist', async () => {
    const generate = vi.fn().mockResolvedValue({ content: JSON.stringify(passVerdict) });
    const controller = Object.create(ChainController.prototype) as any;
    controller.realLLM = { generate };

    await controller.checkChapterAlignment({
      projectId: 'p1', chapterIndex: 3, chapterTitle: '第三章',
      outlineContract: '有效详细大纲'.repeat(30),
      storyContext: '已确认上下文',
      content: '正文内容',
    });

    const prompt = String(generate.mock.calls[0][0].prompt);
    expect(prompt).not.toContain('【后续章节边界（本章不得提前消费）】');
  });

  it('injects the boundary into the first-pass prompt and forwards it to alignment checks', async () => {
    const controller = Object.create(ChainController.prototype) as any;
    controller.realLLM = {
      generate: vi.fn().mockResolvedValue({ content: '正文'.repeat(400) }),
      validateGeneratedContent: vi.fn().mockResolvedValue('正文'.repeat(400)),
    };
    controller.logger = { warn: vi.fn(), error: vi.fn() };
    controller.getActiveLessons = vi.fn().mockReturnValue('');
    controller.generateBodyWithLengthGuard = vi.fn()
      .mockImplementation(async ({ basePrompt }: { basePrompt: string }) => basePrompt.slice(0, 2000));
    controller.assertGeneratedChapterIdentity = vi.fn();
    const checkChapterAlignment = vi.fn().mockResolvedValue({
      evaluationStatus: 'evaluated', pass: true,
      missing: [], contradictions: [], advisories: [], sourceConflicts: [], evidence: [],
      outlineAligned: true, continuityPassed: true, characterPassed: true,
      worldPassed: true, timelinePassed: true, prosePassed: true,
    });
    controller.checkChapterAlignment = checkChapterAlignment;
    controller.persistAlignmentContradictions = vi.fn();
    controller.assertNoBlockingGeneratedContentIssues = vi.fn();

    await controller.generateBodyWithAlignmentGuard({
      projectId: 'p1', basePrompt: '写正文', targetWords: 4000,
      scenario: 'writing_climax', chapterIndex: 2, chapterTitle: '第二章',
      outlineContract: '有效详细大纲'.repeat(30),
      storyContext: '已确认上下文',
      subsequentChapterBoundary: '【后续章节边界 · 本章不得提前消费】\n- 第三章：直播收凶',
      wordRange: { min: 3000, max: 5000 },
    });

    const firstPrompt = String(controller.generateBodyWithLengthGuard.mock.calls[0][0].basePrompt);
    expect(firstPrompt).toContain('后续章节边界（本章不得提前消费，必须逐条遵守）');
    expect(firstPrompt).toContain('第三章：直播收凶');
    expect(checkChapterAlignment).toHaveBeenCalledWith(expect.objectContaining({
      subsequentChapterBoundary: expect.stringContaining('后续章节边界'),
    }));
  });
});

describe('cross-chapter finding partition', () => {
  const outline = '本章必须：主角发现投稿本与旧本差异，确认倒计时启动。';

  it('keeps cross-chapter early consumption blocking', () => {
    const partition = partitionAlignmentFindings([
      '跨章提前消费：正文已兑现第二章大纲计划的核心事件“追问出店长手动删除监控”，本章不得提前',
    ], outline);
    expect(partition.blocking).toHaveLength(1);
    expect(partition.advisories).toEqual([]);
    expect(partition.sourceConflicts).toEqual([]);
  });

  it('keeps cross-chapter assertion conflicts blocking', () => {
    const partition = partitionAlignmentFindings([
      '跨章断言冲突：正文写死“只有站过那间卧室的人才知道拿锥子的是哪只手”，与第三章既定事实（妹妹从网络旧本截图设局）冲突',
    ], outline);
    expect(partition.blocking).toHaveLength(1);
    expect(partition.advisories).toEqual([]);
    expect(partition.sourceConflicts).toEqual([]);
  });
});

