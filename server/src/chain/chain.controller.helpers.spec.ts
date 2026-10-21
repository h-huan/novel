import { standardDirectiveCache } from '../modules/module-standards/standard-directive.cache';
import { premiseSourceComparisonCatalog } from './premise-selection-review';
import { getPlatform, targetForLength, measureAgainstTarget } from './platform-benchmarks';
import { SOURCE_QUALITY_AXES } from '../modules/writing-quality/source-quality-review';
import { TEMPORAL_FACT_CONTINUITY_POLICY, PLATFORM_MEASUREMENT_REVIEW_POLICY } from '../../shared/src/system-workflow-rules.registry';
import { describe, expect, it, vi } from 'vitest';
import {
  ChainController,
  canFitChapterWordRange,
  canFitStoryTargetWords,
  parsePositiveTargetWords,
  resolveDiscoveryTargetWords,
  resolveCreationChapterPlan,
  collectOutlineForeshadowings,
  serializeGeneratedSqlText,
  extractBalancedJson,
  extractIdeaList,
  ideaSemanticSimilarity,
  parseChapterResponsibilityIssue,
  applyAuditedResponsibilityFixes,
  resolveExplicitCharacterDemographics,
  partitionAlignmentFindings,
  alignmentFindingSeverity,
} from './chain.controller';
import { GateRejectionError, classifyGateFailure } from '../modules/writing-quality/gate-failure';
import { IdeaAppealGateService } from './idea-appeal-gate.service';
import { STANDARD_PRECONDITIONS } from '../acceptance/test-standards';
import { CHAPTER_WORD_RANGE } from '../../shared/src';

/**
 * 单测替身：以下用例只验证 prompt 拼装与守卫流程本身，不验证执行标准解析。生产代码现在要求
 * 「项目执行标准必须真实存在」——项目行缺失会按设计抛 404/500，而不再静默退化成通用口径。
 * 因此替身必须提供一个真实存在的项目行（番茄短篇）、完整执行标准、已落库世界规则与 logger，
 * 否则被测路径会先撞上执行前提/资料完整性闸门，永远到不了用例真正要断言的逻辑。
 * 六维取值与验收 fixture 共用 test-standards 的 STANDARD_PRECONDITIONS，不另抄一份。
 */
const STANDARD_PROJECT_ROW = {
  type: 'short_story',
  target_platform: 'fanqie',
  // 历史列脏值：它现在是「只写不读」的投影，任何读路径回落到它都会立刻被下面的断言抓到。
  platform_style: 'fantasy',
  settings: JSON.stringify({
    creativeConstitution: {
      schemaVersion: 1, revision: 1, projectType: 'short_story',
      ...STANDARD_PRECONDITIONS,
      targetWords: 20000, platformRules: targetForLength(getPlatform(STANDARD_PRECONDITIONS.targetPlatform), 'short_story'), chapterWordRange: { ...CHAPTER_WORD_RANGE },
    },
  }),
};

function standardsDbStub(row: Record<string, any> = STANDARD_PROJECT_ROW) {
  return {
    prepare: vi.fn().mockImplementation((sql: string) => ({
      get: vi.fn().mockImplementation(() => {
        const statement = String(sql);
        if (statement.includes('FROM projects')) return row;
        if (statement.includes('FROM world_settings')) {
          return {
            story_premise: '测试世界观：角色每次进门都会触发既定时间回拨规则。',
            rules: JSON.stringify(['每次进门回拨一小时']),
          };
        }
        return undefined;
      }),
      all: vi.fn().mockReturnValue([]),
      run: vi.fn().mockReturnValue({}),
    })),
  };
}

/** 装上执行前提替身：真实项目行 + 完整 logger。 */
function applyStandardsStub(controller: any) {
  controller.db = { getDb: () => standardsDbStub() };
  controller.worldSettingService = {
    findByProjectId: () => [{ id: 'world-fixture' }],
    getWritingSummary: () => ({ summary: '已确认的世界规则：每次进门回拨一小时。' }),
  };
  controller.logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  return controller;
}

describe('idea discovery execution settings', () => {
  it('uses the confirmed story when a framework request omits a new setting, while preserving an explicit request', async () => {
    const controller = applyStandardsStub(Object.create(ChainController.prototype)) as any;
    const settings = JSON.parse(STANDARD_PROJECT_ROW.settings);
    settings.creativeConstitution.confirmedStory = { title: '已确认题材', coreConflict: '保住订单并救人' };
    controller.db = { getDb: () => standardsDbStub({ ...STANDARD_PROJECT_ROW, settings: JSON.stringify(settings) }) };
    controller.workflowGuard = { assertCanGenerateOutline: vi.fn() };
    controller.chainTemplate = { executeChain: vi.fn().mockResolvedValue({ outputs: { node_3_chapters: { volumes: [{ volumeNumber: 1, chapters: [{}] }] } } }) };
    controller.assertOutlineCandidateFacts = vi.fn().mockResolvedValue(undefined);
    await controller.generateOutline({ projectId: 'fixture' });
    expect(controller.chainTemplate.executeChain.mock.calls[0][1].story_setting).toContain('保住订单并救人');
    await controller.generateOutline({ projectId: 'fixture', storySetting: '作者补充的候选设定' });
    expect(controller.chainTemplate.executeChain.mock.calls[1][1].story_setting).toBe('作者补充的候选设定');
    expect(controller.assertOutlineCandidateFacts).toHaveBeenCalledTimes(2);
    expect(controller.assertOutlineCandidateFacts.mock.calls[0][4][0].chapterNumber).toBe(1);
    controller.assertOutlineCandidateFacts.mockRejectedValueOnce(new Error('已举证的上游框架矛盾'));
    await expect(controller.generateOutline({ projectId: 'fixture' })).rejects.toThrow('已举证的上游框架矛盾');
  });
  it('rejects a long idea submitted as a short project before writing a project row', async () => {
    const controller = Object.create(ChainController.prototype) as any;
    const getDb = vi.fn();
    controller.db = { getDb };
    const result = await controller.createProjectAsync({
      title: '错配题材', storyType: 'short_story', targetPlatform: 'fanqie',
      selectedIdea: { title: '错配题材', storyType: 'long_novel' },
    });
    expect(result).toMatchObject({ success: false });
    expect(result.error).toMatch(/长短篇类型/);
    expect(getDb).not.toHaveBeenCalled();
  });

  const configured = {
    storyType: 'long_novel' as const,
    platform: 'fanqie',
    storyCategory: '男频·都市日常',
    storyTone: ['轻松'],
    writingStyle: ['白描朴素'],
    webNovelGenre: ['都市'],
    submissionTags: ['都市'],
    pov: '第一人称',
  };

  it('requires a selected platform even when all creative dimensions are blank', async () => {
    const controller = Object.create(ChainController.prototype) as any;
    await expect(controller.ideaDiscover({ storyType: 'long_novel', platform: '', storyCategory: '' }))
      .rejects.toThrow(/未选择具体目标平台/);
  });

  it('auto-selects a category only within the selected platform', async () => {
    const controller = Object.create(ChainController.prototype) as any;
    controller.logger = { warn: vi.fn() };
    controller.runIdeaDiscovery = vi.fn().mockResolvedValue({ success: true, ideas: [] });
    await controller.ideaDiscover({ storyType: 'long_novel', platform: 'fanqie', storyCategory: '' });
    const selected = controller.runIdeaDiscovery.mock.calls[0][0];
    expect(selected.platform).toBe('fanqie');
    expect(selected.storyCategory).toMatch(/^(男频|女频)·/);
    expect(selected.storyTone).toEqual([]);
  });

  it('combines a short-story reference category for the selected platform without claiming it is verified', async () => {
    const controller = Object.create(ChainController.prototype) as any;
    controller.logger = { warn: vi.fn() };
    controller.runIdeaDiscovery = vi.fn().mockResolvedValue({ success: true, ideas: [] });
    await controller.ideaDiscover({ storyType: 'short_story', platform: 'fanqie', storyCategory: '' });
    const selected = controller.runIdeaDiscovery.mock.calls[0][0];
    expect(selected.platform).toBe('fanqie');
    expect(selected.storyCategory).toBeTruthy();
    expect(selected.storyCategory).not.toMatch(/^(男频|女频)·/);
  });

  it('lets discovery combine unselected creative fields while keeping the chosen platform and category', async () => {
    const controller = Object.create(ChainController.prototype) as any;
    controller.logger = { warn: vi.fn() };
    controller.runIdeaDiscovery = vi.fn().mockResolvedValue({ success: true, ideas: [] });
    await expect(controller.ideaDiscover({
      storyType: configured.storyType,
      platform: configured.platform,
      storyCategory: configured.storyCategory,
      toneTags: ['轻松', '都市'],
    })).resolves.toEqual({ success: true, ideas: [] });
    expect(controller.runIdeaDiscovery).toHaveBeenCalledWith(expect.objectContaining({
      platform: configured.platform,
      storyCategory: configured.storyCategory,
      storyTone: [],
      submissionTags: [],
    }), 5);
  });

  it('passes settings unchanged and does not treat a public sample as an exhaustive tag list', async () => {
    const controller = Object.create(ChainController.prototype) as any;
    controller.logger = { warn: vi.fn() };
    controller.runIdeaDiscovery = vi.fn().mockResolvedValue({ success: true, ideas: [] });
    await expect(controller.ideaDiscover(configured)).resolves.toEqual({ success: true, ideas: [] });
    expect(controller.runIdeaDiscovery).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: configured.platform,
        storyCategory: configured.storyCategory,
        storyTone: configured.storyTone,
        writingStyle: configured.writingStyle,
        webNovelGenre: configured.webNovelGenre,
        submissionTags: configured.submissionTags,
        pov: configured.pov,
      }), 5,
    );
    await expect(controller.ideaDiscover({ ...configured, submissionTags: ['系统'] })).resolves.toEqual({success:true,ideas:[]});
  });
});

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
  it('keeps the latest root field failure without parsing nested fragments or claiming recovery', async () => {
    const generate = vi.fn()
      .mockResolvedValueOnce({ content: JSON.stringify({ title: '第1章', content: '', scenes: [{ location: '食堂' }] }) })
      .mockResolvedValueOnce({ content: JSON.stringify({ title: '第1章', content: '接收食堂', scenes: [{ location: '食堂' }] }) });
    const controller = Object.create(ChainController.prototype) as any;
    controller.realLLM = { generate };
    controller.logger = { warn: vi.fn(), error: vi.fn() };
    const describeValidation = (value: any) => !value?.content ? ['缺少content事件链'] : ['scenes[0]缺少outcome'];
    const result = await controller.llmCallWithRetry('第1章详细大纲', '只输出JSON', {
      scenario: 'outline', validate: () => false, describeValidation,
    });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.data).toBeNull();
    expect(result.validationIssues).toEqual(['scenes[0]缺少outcome']);
    expect(result.warnings.join('；')).not.toMatch(/逐行解析恢复|无法解析|缺少title/);
    expect(result.warnings.join('；')).toContain('缺少content事件链');
    expect(generate.mock.calls[1][0].prompt).toContain('缺少content事件链');
    expect(generate.mock.calls[1][0].prompt).toContain('JSON语法有效');
  });

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
      const gateError = new GateRejectionError(
        classifyGateFailure({
          evaluationStatus: 'evaluated', topic: 'quality_gate', gateStatus: 'blocked',
          buckets: { prose_hardline: ['新增未授权人物“律师”'] },
        }),
        '{"title":"第一章","character":"律师"}',
      );
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
      const gateRejection = (issue: string) => new GateRejectionError(
        classifyGateFailure({
          evaluationStatus: 'evaluated', topic: 'quality_gate', gateStatus: 'blocked',
          buckets: { prose_hardline: [issue] },
        }),
        '{"title":"第二章"}',
      );
      const generate = vi.fn()
        .mockRejectedValueOnce(gateRejection('本章重复前章事件'))
        .mockRejectedValueOnce(gateRejection('本章提前执行下一章任务'))
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
      const repeated = new GateRejectionError(
        classifyGateFailure({
          evaluationStatus: 'evaluated', topic: 'quality_gate', gateStatus: 'blocked',
          buckets: { prose_hardline: ['人物无证据直接泄密'] },
        }),
        '{"title":"第四章"}',
      );
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

  it('does not spend another whole-chapter generation when the execution standard itself is empty', async () => {
    vi.useFakeTimers();
    try {
      const generate = vi.fn().mockRejectedValue(new GateRejectionError(
        classifyGateFailure({
          evaluationStatus: 'evaluated',
          contradictions: ['创作宪法 category 为空，无法核对本章分类归属；修复动作：补全分类字段后重评 category 维度。'],
        }),
        '{"title":"第一章"}',
      ));
      const controller = Object.create(ChainController.prototype) as any;
      controller.realLLM = { generate };
      controller.logger = { warn: vi.fn(), error: vi.fn() };

      const pending = controller.llmCallWithRetry('第1章详细大纲', '只输出JSON', { scenario: 'outline' });
      const assertion = expect(pending).rejects.toThrow('执行标准未落实，正文未保存');
      await vi.runAllTimersAsync();
      await assertion;
      expect(generate).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('still recognises a legacy gate rejection string that predates the structured error type', async () => {
    vi.useFakeTimers();
    try {
      const generate = vi.fn()
        .mockRejectedValueOnce(new Error('质量 Gate blocked：本章重复前章事件'))
        .mockResolvedValueOnce({ content: '{"title":"第二章","boundary":"ok"}' });
      const controller = Object.create(ChainController.prototype) as any;
      controller.realLLM = { generate };
      controller.logger = { warn: vi.fn(), error: vi.fn() };

      const pending = controller.llmCallWithRetry('第2章详细大纲', '只输出JSON', { scenario: 'outline' });
      await vi.runAllTimersAsync();
      const result = await pending;

      expect(result.data.boundary).toBe('ok');
      expect(generate).toHaveBeenCalledTimes(2);
      expect(generate.mock.calls[1][0].prompt).toContain('本章重复前章事件');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('chapter alignment evaluation availability', () => {
  it('does not generate with an empty world context', () => {
    const controller = applyStandardsStub(Object.create(ChainController.prototype) as any);
    controller.worldSettingService.findByProjectId = () => [];
    expect(() => controller.buildWorldWritingContext('p1')).toThrow(/项目尚无世界观主记录/);
  });

  it('uses one sufficiently sized review call and marks truncation as not_evaluated', async () => {
    const generate = vi.fn().mockRejectedValue(new Error('结构化生成因输出长度被截断'));
    // 评审器现在按执行标准验收（第六步）：替身必须给真实项目行，否则先撞执行前提闸门。
    const controller = applyStandardsStub(Object.create(ChainController.prototype) as any);
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
    // 评审 prompt 必须真的带上「按平台分类」派生的执行标准，否则评审器判不了平台分类是否被执行。
    const reviewPrompt = generate.mock.calls[0][0].prompt as string;
    expect(reviewPrompt).toContain('【项目执行标准 · 最高优先级】');
    expect(reviewPrompt).toContain('投稿分类');
    expect(reviewPrompt).toContain('按已注入的质量评审执行标准');
  });

  it('never rewrites the chapter when the evaluator itself is unavailable', async () => {
    const controller = applyStandardsStub(Object.create(ChainController.prototype) as any);
    controller.getActiveLessons = vi.fn().mockReturnValue('');
    controller.generateBodyWithLengthGuard = vi.fn().mockResolvedValue('正文'.repeat(1800));
    controller.assertGeneratedChapterIdentity = vi.fn();
    controller.checkChapterAlignment = vi.fn().mockResolvedValue({
      evaluationStatus: 'not_evaluated', pass: false,
      missing: ['章节验收评审调用失败（评审器故障，不是正文缺陷）：输出截断'], contradictions: [], evidence: [],
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

  it('keeps raw countdown arithmetic as advisory when stable fact identity is unavailable', async () => {
    const controller = applyStandardsStub(Object.create(ChainController.prototype) as any);
    controller.worldSettingService.getWritingSummary = () => ({
      summary: '两天前，72小时倒计时启动。',
    });
    // This test owns the raw-text advisory branch, not world-context assembly. Keep the
    // integration input explicit so missing unrelated service methods cannot mask the rule behavior.
    controller.buildWorldWritingContext = vi.fn().mockReturnValue('两天前，72小时倒计时启动。');
    controller.getActiveLessons = vi.fn().mockReturnValue('');
    controller.generateBodyWithLengthGuard = vi.fn().mockResolvedValue('正文'.repeat(1800));
    controller.assertGeneratedChapterIdentity = vi.fn();
    controller.checkChapterAlignment = vi.fn().mockResolvedValue({
      evaluationStatus: 'evaluated', pass: true,
      requiredEvents: [{ event: '必需事件', covered: true, evidence: '正文证据' }],
      missingRequiredItems: [], missing: [], contradictions: [], advisories: [], sourceConflicts: [], evidence: [], hardlineFindings: [],
      outlineAligned: true, continuityPassed: true, characterPassed: true,
      worldPassed: true, timelinePassed: true, prosePassed: true,
    });
    controller.persistAlignmentContradictions = vi.fn();
    controller.assertNoBlockingGeneratedContentIssues = vi.fn();
    // generateBodyWithAlignmentGuard performs one final locked-context Canon validation after
    // the alignment Gate passes. The test stubs that already-existing transport dependency and
    // returns the exact same prose; it does not bypass or redefine the Gate under test.
    controller.realLLM = {
      validateGeneratedContent: vi.fn().mockImplementation(async (_projectId: string, _chapterIndex: number, content: string) => content),
    };

    await expect(controller.generateBodyWithAlignmentGuard({
      projectId: 'p1', basePrompt: '写正文', targetWords: 4000,
      scenario: 'writing_climax', chapterIndex: 1, chapterTitle: '第一章',
      outlineContract: '三天后零点截止。', storyContext: '已确认上下文',
      wordRange: { min: 3000, max: 5000 },
    })).resolves.toMatchObject({
      content: expect.any(String),
      qualityReport: expect.objectContaining({ pass: true, timelinePassed: true, prosePassed: true }),
    });

    expect(controller.generateBodyWithLengthGuard).toHaveBeenCalledTimes(1);
    expect(controller.realLLM.validateGeneratedContent).toHaveBeenCalledTimes(1);
    expect(controller.logger.warn).toHaveBeenCalledWith(expect.stringContaining('可计算时间风险'));
  });
});

describe('alignment finding partition', () => {
  const outline = '本章必须：断供第三日，主角验毒，让师兄吃下锅气菜后显出毒斑。';

  it('空间感与过渡建议不因提到大纲和出入就升级为事实阻断',()=>{
    const advice=['角色隔着门交换资料，与大纲的同一空间感略有出入，可统一站位表述。','正文位置交代缺过渡，建议加一句衔接。','大纲表述与正文口径可统一，均已完成本章事件。'];
    const result=partitionAlignmentFindings([],outline,advice);
    expect(result.blocking).toEqual([]);expect(result.advisories).toEqual(advice);
    const conflict=partitionAlignmentFindings([],outline,['正文位置同时在门内和门外，两个地点不能同时成立。']);
    expect(conflict.blocking).toHaveLength(1);
  });

  it('promotes cast, countdown, and required-event order conflicts from reviewer advisories', () => {
    const partition = partitionAlignmentFindings([], outline, [
      '配角“李成”有姓名，不在出场角色白名单内，建议改为不具名同事。',
      '起爆时间对话作“后天上午十点”、章末作“三天后上午十点”，口径不一致。',
      '台账细查安排在次日夜里，与大纲“第一次跨出后即核对”的先后次序略有错位。',
      '风从脚手架上灌下来一类句式出现两次，属重复措辞。',
    ]);
    expect(partition.blocking).toHaveLength(3);
    expect(partition.advisories).toHaveLength(1);
  });

  it('keeps explicitly denied advisory conflicts while preserving affirmative and declared conflicts', () => {
    const allowed='角色全名属可接受的合理细节，未与角色卡冲突。';
    const aligned='世界观与大纲没有矛盾，均支持当前行为。';
    const trueConflict='姓名没有冲突；但倒计时三天与两天不一致。';
    const result=partitionAlignmentFindings([],outline,[allowed,aligned,trueConflict]);
    expect(result.advisories).toEqual([allowed,aligned]);
    expect(result.sourceConflicts).toEqual([]);
    expect(result.blocking).toEqual([trueConflict]);
    expect(partitionAlignmentFindings([allowed],outline).blocking).toEqual([allowed]);
  });
  it('keeps an explicit no-boundary-violation advisory without hiding another real conflict', () => {
    const allowed='“锅炉房”在正文出现但未列入本章场景范围，属报馆内部空间，不构成越界。';
    expect(partitionAlignmentFindings([], '报馆排字房', [allowed])).toMatchObject({ blocking: [], advisories: [allowed] });
    const mixed=allowed+'但日期与大纲冲突，正文为明天，大纲为三天后。';
    expect(partitionAlignmentFindings([], '报馆排字房', [mixed]).blocking).toEqual([mixed]);
    expect(partitionAlignmentFindings([allowed], '报馆排字房').blocking).toEqual([allowed]);
  });

  it('keeps a denied factual exclusion advisory while preserving actual and declared conflicts', () => {
    const allowed='“昨天说好今天一早送药钱来”与后文“九点前后，约好一早的药钱还没送来”属于同一次约期的先后叙述，语义上是在强调失约，不构成事实互斥；若后续要写死约点，可在下章用一句“约的是七点”钉死。';
    expect(partitionAlignmentFindings([], outline, [allowed])).toMatchObject({ blocking: [], advisories: [allowed] });
    for (const denied of ['并不构成事实冲突', '不存在事实互斥', '没有事实矛盾']) {
      expect(partitionAlignmentFindings([], outline, [denied]).blocking).toEqual([]);
    }
    const mixed=allowed+'但正文的三天与章纲的两天倒计时不一致。';
    expect(partitionAlignmentFindings([], outline, [mixed]).blocking).toEqual([mixed]);
    expect(partitionAlignmentFindings([allowed], outline).blocking).toEqual([allowed]);
  });

  it('keeps a reviewer contradiction blocking even when it describes repeated wording', () => {
    const partition = partitionAlignmentFindings([
      '第2、3段短距离重复同一句身体反应描写，措辞重复且句式重复',
    ], outline);
    expect(partition.blocking).toHaveLength(1);
    expect(partition.advisories).toEqual([]);
    expect(partition.sourceConflicts).toEqual([]);
  });
  it('does not let a no-mainline-impact phrase hide a factual advisory conflict',()=>{
    const defect='正文自报数量为五，实际为四，数量不一致，但不影响主线理解。';
    const preference='两处雨声措辞可以更简洁，不影响主线理解。';
    const result=partitionAlignmentFindings([],outline,[defect,preference]);
    expect(result.blocking).toEqual([defect]);expect(result.advisories).toEqual([preference]);
  });

  it('keeps an execution-standard deviation blocking instead of demoting it for mentioning 文风', () => {
    const partition = partitionAlignmentFindings([
      '文风与执行标准的「白描/朴素」不符：通篇堆叠比喻与四字对仗，偏离该平台分类读者的阅读节奏',
    ], outline);
    expect(partition.advisories).toEqual([]);
    expect(partition.blocking).toHaveLength(1);
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

  it('keeps draft evidence against both world and outline in the body repair path', () => {
    const partition = partitionAlignmentFindings([
      '林川栏与大纲/世界观冲突：大纲要求“林川那格是空白刻痕”，正文写“林川两个字还在”，姓名仍在。',
    ], outline);
    expect(partition.blocking).toHaveLength(1);
    expect(partition.sourceConflicts).toEqual([]);
  });

  it('blocks the wide "project card is empty" wording instead of letting the source-conflict channel swallow it', () => {
    const partition = partitionAlignmentFindings([
      '项目卡 creativeConstitution 中 category、pov、targetAudience 为空，而世界观档案与本章详细大纲明确为现实题材、第一人称限知；本条正文遵循高权威的详细大纲与世界观档案，不影响判定。',
    ], outline);
    expect(partition.blocking).toHaveLength(1);
    expect(partition.sourceConflicts).toEqual([]);
    expect(partition.advisories).toEqual([]);
  });

  it('blocks a bare "creative constitution field is empty" wording even when it names no source at all', () => {
    const partition = partitionAlignmentFindings([
      '创作宪法 category 为空，无法核对本章分类归属；修复动作：补全分类字段后重评 category 维度。',
      '创作宪法 pov 为空，无法核验第一人称临场感与视角一致性；修复动作：补全POV字段后重评 pov 维度。',
    ], outline);
    expect(partition.blocking).toHaveLength(2);
    expect(partition.sourceConflicts).toEqual([]);
  });
});

describe('矛盾落库严重度（不得降级）', () => {
  it('LLM 验收器判出的执行标准六维偏差、缺事件与事实冲突按 blocking 落库，不再降为 high', () => {
    expect(alignmentFindingSeverity('alignment_verifier')).toBe('blocking');
  });

  it('硬红线确定性扫描同样 blocking', () => {
    expect(alignmentFindingSeverity('alignment_verifier_hardline')).toBe('blocking');
  });

  it('只有明确标注为局部措辞/重复的建议才是 medium', () => {
    expect(alignmentFindingSeverity('alignment_verifier_advisory')).toBe('medium');
  });

  it('资料源冲突阻断保存，修复对象仍是资料源', () => {
    expect(alignmentFindingSeverity('alignment_verifier_source_conflict')).toBe('blocking');
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
    // 判据（不是改数字）：审查/修复回路按 review 标准执行，不落 daily。
    // standardScene('daily')='daily'，而 module_standards 里没有任何 standards.scenarios 含 'daily'，
    // 等于这次调用零标准注入 —— 「执行标准是前提」被绕过；review 会注入 quality_loop + review。
    // 模型/温度/输出上限逐字不变（modelSceneTab 两者都是 daily tab -> scenarios.writing），非降级。
    expect(controller.llmCallWithRetry.mock.calls[0][2]).toMatchObject({
      scenario: 'review',
      deferQualityGate: true,
      stepKey: 'chapter_responsibility_repair',
    });
    // 判据唯一化：修复提示必须注入 shared 的章节分工判据，且不得再夹带某一部旧书的题材化例子。
    const repairPrompt = controller.llmCallWithRetry.mock.calls[0][1];
    expect(repairPrompt).toContain('CR-6');
    expect(repairPrompt).toContain('CR-7');
    expect(repairPrompt).toContain('每章只承担独有推进任务');
    expect(repairPrompt).toContain('授权与章节边界按CR-1～CR-7及已确认世界规则判定');
    expect(repairPrompt).toContain('必要行动结果按QLT-003同源因果账目判定');
    for (const bookSpecific of ['看房', '签约', '失踪登记', '亲属关系证明', '替身', '影子', '门禁', '法律物证']) {
      expect(repairPrompt).not.toContain(bookSpecific);
    }
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
describe('immediate chapter evidence at production boundaries', () => {
  it('keeps unknown demographics instead of borrowing another person’s pronouns or age', () => {
    expect(resolveExplicitCharacterDemographics({basicInfo:'年龄：unavailable；身份：旅馆住户',backstory:'她的父亲七十岁，先生来找他。'})).toEqual({age:null,gender:null});
    expect(resolveExplicitCharacterDemographics({basicInfo:'年龄：24；性别：女；身份：工程师',backstory:'父亲七十岁。'})).toEqual({age:24,gender:'女'});
    expect(resolveExplicitCharacterDemographics({age:1200,gender:'男',basicInfo:'性别：女'})).toEqual({age:1200,gender:'男'});
    expect(resolveExplicitCharacterDemographics({age:'unknown',gender:'unavailable',basicInfo:'中年人'})).toEqual({age:null,gender:null});
  });
  it('loads the full middle facts once without overwriting bounded background or Canon', () => {
    const controller=applyStandardsStub(Object.create(ChainController.prototype) as any);
    const content='开头'.repeat(1500)+'她没有取得通行许可。'+'结尾'.repeat(1500);
    const get=vi.fn().mockReturnValue({id:'prior',chapter_index:1,title:'前章',content});
    controller.db={getDb:()=>({prepare:vi.fn().mockReturnValue({get,all:()=>[]})})};
    const context=controller.previousChapterReviewContext('p',2,'背景'.repeat(10000));
    const parsed=JSON.parse(context);
    expect(parsed.previousChapter[0]).toMatchObject({content,complete:true});
    expect(parsed.storyContext).toHaveLength(14000);
    expect(controller.previousChapterReviewContext('p',2,context)).toBe(context);
    expect(get).toHaveBeenCalledWith('p',1);
    get.mockReturnValue(undefined);
    const missing=JSON.parse(controller.previousChapterReviewContext('p',2,'背景'));
    expect(missing.previousChapter).toEqual([]);
    expect(missing.recentChapters).toEqual([{chapter_index:1}]);
  });
});

describe('cross-chapter boundary enforcement', () => {
  const passVerdict = {
    // These fixtures isolate other gates; source semantics are covered in their own tests.
    sourceQualityAudit: {version:1,checks:Object.fromEntries(SOURCE_QUALITY_AXES.map(axis=>[axis,{status:'not_applicable',evidence:'',reason:'该隔离测试只验证其他验收分支而不评源头语义'}]))},
    readerGoals: Object.fromEntries(['click','completion','sharing','immersion'].map(key=>[key,{status:'unknown',quote:'',reason:'隔离测试没有真实读者证据，不能推定高倾向'}])),
    causalAudit: { status: 'not_applicable', reason: '该测试短句没有决定性行动与处境变化', transitions: [] },
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

  it('does not accept a wrong literal count even when every model flag claims success',async()=>{
    const c=applyStandardsStub(Object.create(ChainController.prototype) as any);
    c.logger={warn:vi.fn(),error:vi.fn()};
    c.realLLM={generate:vi.fn().mockResolvedValue({content:JSON.stringify(passVerdict)})};
    const result=await c.checkChapterAlignment({projectId:'p',chapterIndex:1,chapterTitle:'通知',outlineContract:'本章完成通知与人物决定。'.repeat(12),storyContext:'既定事实。',content:'纸上印着“立即返航”五个字。'});
    expect(result.evaluationStatus).toBe('evaluated');expect(result.pass).toBe(false);expect(result.prosePassed).toBe(false);
    expect(result.contradictions.join('')).toContain('literal-character-count');
    expect(c.realLLM.generate).toHaveBeenCalledTimes(1);
  });
  it('preserves verified temporal conflicts when another countdown remains unresolved',async()=>{
 const controller=applyStandardsStub(Object.create(ChainController.prototype) as any);const body='倒计时23:59:58。\n倒计时23:58:00。\n送达下午两点十一分。\n现场时间十八点三十四。\n倒计时23:12:47。';const temporalAudit={status:'evaluated',checks:[{ref:'T1',status:'supported',reason:'首次读数是此计时器的基准',calculations:[],countdownCalculations:[{readingIndex:0,timerId:'one',relation:'baseline',reason:'首次读数按同一计时器建立基准'}]},{ref:'T2',status:'unknown',reason:'该中间读数暂无可绑定钟点',calculations:[],countdownCalculations:[{readingIndex:0,timerId:'one',relation:'unknown',reason:'该中间读数暂无可绑定钟点'}]},...['T3','T4'].map(ref=>({ref,status:'supported',reason:'目录明确提供同日现场钟点',calculations:[]})),{ref:'T5',status:'supported',reason:'后次读数晚于同日现场钟点',calculations:[],countdownCalculations:[{readingIndex:0,timerId:'one',relation:'elapsed',earlierRef:'T1',earlierReadingIndex:0,startClockId:'T3:C1',endClockId:'T4:C1',startRelation:'at_reading',endRelation:'before_reading',elapsedConstraint:'ge',reason:'同一计时器基准与订单送达同刻，后次读数晚于现场钟点'}]}]};
 controller.realLLM={generate:vi.fn().mockResolvedValueOnce({content:JSON.stringify({...passVerdict,missingRequiredItems:["已确认的身份事件仍未完成"]})}).mockResolvedValue({content:JSON.stringify({temporalAudit})})};const result=await controller.checkChapterAlignment({projectId:'p',chapterIndex:1,chapterTitle:'图',outlineContract:'有效详细大纲'.repeat(30),storyContext:'已确认上下文',content:body});expect(result.evaluationStatus).toBe('not_evaluated');expect(result.pass).toBe(false);expect(result.contradictions.join('')).toContain('2831秒');expect(result.missing.join('')).toContain('尚未验证');expect(result.missing).toContain('已确认的身份事件仍未完成');
 });
  it('uses an independent small continuity report and blocks a false aggregate PASS', async () => {
    const controller=applyStandardsStub(Object.create(ChainController.prototype) as any),base=standardsDbStub();
    const prior='他们初次在一楼大堂见面。',body='昨夜他在302室第一次见到那个人。';
    controller.db={getDb:()=>({prepare:(sql:string)=>sql.includes('FROM chapters')?{get:()=>({id:'prior',chapter_index:1,title:'前章',content:prior}),all:()=>[]}:base.prepare(sql)})};
    const verdict={...passVerdict,sourceQualityAudit:{version:1,checks:{...passVerdict.sourceQualityAudit.checks,continuity:{status:'supported',evidence:body,basisSource:'context',basisEvidence:prior,reason:'初次相见的动作相同却忽略了具体地点'}}}};
    controller.realLLM={generate:vi.fn().mockResolvedValueOnce({content:JSON.stringify(verdict)}).mockResolvedValueOnce({content:JSON.stringify({claimChecks:[{ref:'C1',status:'conflict',basisEvidence:prior,reason:'首次相见的房间与已确认前章大堂地点冲突'}]})})};
    const result=await controller.checkChapterAlignment({projectId:'p',chapterIndex:2,chapterTitle:'次章',outlineContract:'有效详细大纲'.repeat(30),storyContext:'背景',content:body});
    expect(result.pass).toBe(false);expect(result.continuityPassed).toBe(false);
    expect(result.contradictions.join('')).toContain('前序声称·C1');
    expect(controller.realLLM.generate).toHaveBeenCalledTimes(2);
    expect(controller.realLLM.generate.mock.calls[1][0].metrics.stepKey).toBe('alignment_continuity_review');
    expect(controller.realLLM.generate.mock.calls[0][0].prompt).toContain(prior);
    expect(controller.realLLM.generate.mock.calls[1][0].prompt).toContain('此专项只返回一个合法JSON对象');
  });

  it('never turns unresolved countdown continuity into an overall pass after one boundary correction',async()=>{
    const controller=applyStandardsStub(Object.create(ChainController.prototype) as any);const body='倒计时23:59:58。\n倒计时23:12:47。';
    const temporalAudit={status:'evaluated',checks:[{ref:'T1',status:'supported',reason:'首次读数确认为同一倒计时的开始',calculations:[],countdownCalculations:[{readingIndex:0,timerId:'one',relation:'baseline',reason:'首次读数作为同一计时器基准'}]},{ref:'T2',status:'unknown',reason:'缺少起止钟表，不能声称完整时间核对通过',calculations:[],countdownCalculations:[{readingIndex:0,timerId:'one',relation:'unknown',reason:'没有实际经过时长，不能推定该读数成立'}]}]};
    controller.realLLM={generate:vi.fn().mockResolvedValueOnce({content:JSON.stringify(passVerdict)}).mockResolvedValue({content:JSON.stringify({temporalAudit})})};
    const result=await controller.checkChapterAlignment({projectId:'p',chapterIndex:1,chapterTitle:'图',outlineContract:'有效详细大纲'.repeat(30),storyContext:'已确认上下文',content:body});expect(result.pass).toBe(false);expect(result.evaluationStatus).toBe('not_evaluated');expect(result.missing.join('')).toContain('尚未验证');expect(controller.realLLM.generate).toHaveBeenCalledTimes(3);
  });

  it('preserves readable categorized reviewer advice without promoting it to a defect',async()=>{
    const controller=applyStandardsStub(Object.create(ChainController.prototype) as any);controller.realLLM={generate:vi.fn().mockResolvedValue({content:JSON.stringify({...passVerdict,advisories:[{kind:'language_heuristic',summary:'三张截图内容各异，列举承担证据核对用途，不是重复动作。'}]})})};
    const result=await controller.checkChapterAlignment({projectId:'p',chapterIndex:1,chapterTitle:'图',outlineContract:'有效详细大纲'.repeat(30),storyContext:'已确认上下文',content:'他截了三张不同的截图。'});
    expect(result.pass).toBe(true);expect(result.advisories).toContain('三张截图内容各异，列举承担证据核对用途，不是重复动作。');expect(result.advisories).not.toContain('[object Object]');
  });

  it('treats a normal repeated-prefix list as a semantic risk and retains confirmed language failures',async()=>{
    const controller=applyStandardsStub(Object.create(ChainController.prototype) as any);controller.logger={warn:vi.fn()};
    const input={projectId:'p',chapterIndex:1,chapterTitle:'图',outlineContract:'有效详细大纲'.repeat(30),storyContext:'已确认故事上下文',content:'他截了三张图，一张评价总页，一张倒计时，一张账号信息。'};
    controller.realLLM={generate:vi.fn().mockResolvedValue({content:JSON.stringify(passVerdict)})};
    const clean=await controller.checkChapterAlignment(input);expect(clean.pass).toBe(true);expect(clean.hardlineFindings.some((f:any)=>f.ruleId==='53-same-structure-parallel')).toBe(false);
    expect(controller.realLLM.generate.mock.calls[0][0].prompt).toContain('形态风险定位（不是已确认缺陷）');
    controller.realLLM.generate.mockResolvedValue({content:JSON.stringify({...passVerdict,prosePassed:false,contradictions:[{kind:'language',summary:'连续重复同一场景动作，没有推进，原文已逐段核对。'}]})});
    expect((await controller.checkChapterAlignment(input)).pass).toBe(false);
  });

  it('corrects only reader citations once and keeps real language failures',async()=>{
    const controller=applyStandardsStub(Object.create(ChainController.prototype) as any);
    controller.logger={warn:vi.fn()};
    const content='陆沉把截图发进去，只问一句：谁见过这种。';
    const verdict={...passVerdict,prosePassed:false,contradictions:[{kind:'language',summary:'同一段动作被连续重复，缺少推进。'}],readerGoals:{...passVerdict.readerGoals,sharing:{status:'weak',quote:'他把截图发进骑手群，只问一句：谁见过这种。',reason:'这个差异尚不能支持强传播倾向，需要保留原判断'}}};
    controller.realLLM={generate:vi.fn().mockResolvedValueOnce({content:JSON.stringify(verdict)}).mockResolvedValueOnce({content:JSON.stringify({repairs:[{key:'sharing',anchorId:'body:p1',status:'supported'}]})})};
    const result=await controller.checkChapterAlignment({projectId:'p',chapterIndex:1,chapterTitle:'门',outlineContract:'有效详细大纲'.repeat(30),storyContext:'已确认故事上下文。',content});
    expect(controller.realLLM.generate).toHaveBeenCalledTimes(2);
    expect(result.evaluationStatus).toBe('evaluated');expect(result.pass).toBe(false);
    expect(result.readerGoals.sharing.status).toBe('weak');
    expect(result.contradictions.join('；')).toContain('连续重复');
  });

  it('fails closed on omitted source coverage and blocks grounded gaps even with pass=true',async()=>{
    const controller=applyStandardsStub(Object.create(ChainController.prototype) as any);
    controller.realLLM={generate:vi.fn().mockResolvedValue({content:JSON.stringify({...passVerdict,sourceQualityAudit:undefined})})};
    const input={projectId:'p',chapterIndex:1,chapterTitle:'门',outlineContract:'有效详细大纲'.repeat(30),storyContext:'只有城主能允许放行。',content:'学徒命令守卫，守卫开门。'};
    const omitted=await controller.checkChapterAlignment(input);
    expect(omitted.pass).toBe(false);expect(omitted.evaluationStatus).toBe('not_evaluated');
    const audit={...passVerdict.sourceQualityAudit,checks:{...passVerdict.sourceQualityAudit.checks,agency:{status:'gap',evidence:input.content,basisSource:'context',basisEvidence:input.storyContext,reason:'学徒没有命令权限，放行缺少有效授权或守卫选择依据'}}};
    controller.realLLM.generate.mockResolvedValue({content:JSON.stringify({...passVerdict,sourceQualityAudit:audit,overallScore:99})});
    const gap=await controller.checkChapterAlignment(input);
    expect(gap.evaluationStatus).toBe('evaluated');expect(gap.pass).toBe(false);expect(gap.contradictions.join('')).toContain('源头核对·agency');
    expect(gap.readerGoals.sharing.status).toBe('unknown');
  });

  it('blocks a cited causal gap even when the reviewer calls it a wording advisory', async () => {
    const controller = applyStandardsStub(Object.create(ChainController.prototype) as any);
    controller.realLLM = { generate: vi.fn().mockResolvedValue({ content: JSON.stringify({
      ...passVerdict,
      advisories: ['发行版次表述含糊'],
      causalAudit: { status: 'evaluated', reason: '救人结果依赖未呈现的传播条件', transitions: [{
        actionEvidence: '她改掉了指控。', resultEvidence: '他暂缓执行。', basisSource: 'body', bridgeEvidence: '',
        status: 'gap', reason: '正文只有副刊发行，没有指控质疑版出街的条件。',
      }] },
    }) }) };
    const result = await controller.checkChapterAlignment({ projectId:'p1', chapterIndex:1, chapterTitle:'首章',
      outlineContract:'有效详细大纲'.repeat(30), storyContext:'质疑版计划发行', content:'她改掉了指控。副刊已经出街。他暂缓执行。' });
    expect(result.evaluationStatus).toBe('evaluated');
    expect(result.pass).toBe(false);
    expect(result.contradictions.join('')).toContain('没有指控质疑版出街');
  });

  it('does not accept a planned causal bridge as an enacted condition', async () => {
    const controller = applyStandardsStub(Object.create(ChainController.prototype) as any);
    controller.realLLM = { generate: vi.fn().mockResolvedValue({ content: JSON.stringify({
      ...passVerdict, causalAudit: { status:'evaluated', reason:'本章有暂缓执行这一重要结果', transitions:[{
        actionEvidence:'她改掉了指控。', resultEvidence:'他暂缓执行。', basisSource:'chapter_plan',
        bridgeEvidence:'质疑版计划发行', status:'supported', reason:'引用计划但正文没有呈现发行条件。',
      }] },
    }) }) };
    const result = await controller.checkChapterAlignment({ projectId:'p1', chapterIndex:1, chapterTitle:'首章',
      outlineContract:'有效详细大纲'.repeat(30), storyContext:'质疑版计划发行', content:'她改掉了指控。他暂缓执行。' });
    expect(result.pass).toBe(false);
    expect(result.evaluationStatus).toBe('not_evaluated');
  });

  it.each([undefined,false])('不以大纲通过覆盖缺失或失败的语言验收：%s',async prosePassed=>{
    const controller=applyStandardsStub(Object.create(ChainController.prototype) as any);
    controller.realLLM={generate:vi.fn().mockResolvedValue({content:JSON.stringify({...passVerdict,prosePassed})})};
    const report=await controller.checkChapterAlignment({projectId:'any-project',chapterIndex:1,chapterTitle:'首章',outlineContract:'有效详细大纲'.repeat(30),storyContext:'已确认上下文',content:'她按约定交出了钥匙。'});
    expect(report.pass).toBe(false);expect(report.evaluationStatus).toBe('not_evaluated');
    expect(report.missing.join('')).toContain('语言验收');
  });

  it('corrects malformed full reports once with the same draft and never accepts an internal fragment',async()=>{
    const c=applyStandardsStub(Object.create(ChainController.prototype) as any);
    c.realLLM={generate:vi.fn().mockResolvedValueOnce({content:'{"pass":false,"checks":{"voice":{"status":"supported"},{"status":"supported"}}}'})
      .mockResolvedValue({content:JSON.stringify(passVerdict)})};
    const input={projectId:'p',chapterIndex:1,chapterTitle:'门',outlineContract:'有效详细大纲'.repeat(30),storyContext:'已经确认的前章上下文',content:'她留下了清样。'};
    const report=await c.checkChapterAlignment(input);
    expect(report.evaluationStatus).toBe('evaluated');
    expect(c.realLLM.generate).toHaveBeenCalledTimes(2);
    const correction=c.realLLM.generate.mock.calls[1][0];expect(correction.metrics.stepKey).toBe('alignment_review_contract');
    expect(correction.prompt).toContain(input.content);expect(correction.prompt).toContain(input.outlineContract);expect(correction.prompt).toContain('完整JSON语法无效');
  });
  it('stops after one unsuccessful protocol correction and keeps the draft unmodified',async()=>{
    const c=applyStandardsStub(Object.create(ChainController.prototype) as any);
    c.realLLM={generate:vi.fn().mockResolvedValue({content:'{"status":"supported"}'})};
    const input={projectId:'p',chapterIndex:1,chapterTitle:'门',outlineContract:'有效详细大纲'.repeat(30),storyContext:'确认上下文',content:'她留下了清样。'};
    const result=await c.checkChapterAlignment(input);expect(result.evaluationStatus).toBe('not_evaluated');expect(result.pass).toBe(false);
    expect(c.realLLM.generate).toHaveBeenCalledTimes(2);expect(input.content).toBe('她留下了清样。');
  });
  it('requests only missing report paths and preserves the original failed prose decision',async()=>{
    const c=applyStandardsStub(Object.create(ChainController.prototype) as any);
    const original:any={...passVerdict,pass:false,prosePassed:false};delete original.readerGoals;
    c.realLLM={generate:vi.fn().mockResolvedValueOnce({content:JSON.stringify(original)}).mockImplementation(async(request:any)=>{
      expect(request.prompt).toContain('不要重发完整报告');expect(request.prompt).toContain('["readerGoals"]');
      return {content:JSON.stringify({corrections:[{path:'readerGoals',value:passVerdict.readerGoals}]})};
    })};
    const report=await c.checkChapterAlignment({projectId:'p',chapterIndex:1,chapterTitle:'门',outlineContract:'有效详细大纲'.repeat(30),storyContext:'确认上下文',content:'她留下了清样。'});
    expect(report.pass).toBe(false);expect(report.prosePassed).toBe(false);expect(c.realLLM.generate).toHaveBeenCalledTimes(2);
  });
  it('stops ambiguous duplicate report fields instead of regenerating away blocking findings',async()=>{
    const c=applyStandardsStub(Object.create(ChainController.prototype) as any);
    c.realLLM={generate:vi.fn().mockResolvedValue({content:JSON.stringify({...passVerdict,sourceQualityAudit:{...passVerdict.sourceQualityAudit,readerGoals:{click:{status:'supported'}}}})})};
    const report=await c.checkChapterAlignment({projectId:'p',chapterIndex:1,chapterTitle:'门',outlineContract:'有效详细大纲'.repeat(30),storyContext:'确认上下文',content:'她留下了清样。'});
    expect(report.pass).toBe(false);expect(report.evaluationStatus).toBe('not_evaluated');expect(c.realLLM.generate).toHaveBeenCalledTimes(1);
  });
  it('审查入口使用注入的语言标准，不限制为旧的两项AI检查',async()=>{
    const controller=applyStandardsStub(Object.create(ChainController.prototype) as any);
    controller.realLLM={generate:vi.fn().mockResolvedValue({content:JSON.stringify(passVerdict)})};
    await controller.checkChapterAlignment({projectId:'any-project',chapterIndex:1,chapterTitle:'首章',outlineContract:'有效详细大纲'.repeat(30),storyContext:'已确认上下文',content:'她按约定交出了钥匙。'});
    const prompt=controller.realLLM.generate.mock.calls[0][0].prompt;
    expect(prompt).toContain('按已注入的质量评审执行标准完成章节事件、事实、执行维度与语言验收');
    expect(prompt).not.toContain('只补判确定性扫描覆盖不到的两项');
    expect(prompt).toContain('仍检查前文接力、非数值事件先后与世界规则');
  });

  it('blocks a temporal conflict even when the model aggregate passes, and rejects omitted checks',async()=>{
    const controller=applyStandardsStub(Object.create(ChainController.prototype) as any);
    const content='船在九点离港。\n十点靠岸。\n他声称航行了四个小时。';
    const temporalAudit={status:'evaluated',checks:[
      {ref:'T1',status:'supported',reason:'离港时点明确，须与同次靠岸记录核对。'},
      {ref:'T2',status:'supported',reason:'靠岸时点明确，同一天航行间隔一小时。'},
      {ref:'T3',status:'conflict',calculations:[{quantityIndex:0,sameEndpoints:false,reason:'该测试只验证时间结论入闸，计算另有独立测试。'}],comparisonEvidence:'船在九点离港。\n十点靠岸。',reason:'同一次航行九点至十点仅一小时，与四小时精确声明矛盾。'}
    ]};
    controller.realLLM={generate:vi.fn().mockResolvedValue({content:JSON.stringify({...passVerdict,temporalAudit})})};
    const input={projectId:'p',chapterIndex:1,chapterTitle:'渡海',outlineContract:'有效详细大纲'.repeat(30),storyContext:'',content};
    const report=await controller.checkChapterAlignment(input);
    expect(report.pass).toBe(false);expect(report.timelinePassed).toBe(false);
    expect(report.contradictions.join('')).toContain('一小时');
    temporalAudit.checks.pop();
    controller.realLLM.generate.mockResolvedValue({content:JSON.stringify({...passVerdict,temporalAudit})});
    const incomplete=await controller.checkChapterAlignment(input);
    expect(incomplete.evaluationStatus).toBe('not_evaluated');expect(incomplete.missing.join('')).toContain('漏项');
  });

  it('uses one temporal decision source while preserving typed non-time issues',async()=>{
    const controller=applyStandardsStub(Object.create(ChainController.prototype) as any);
    const content='航行不到三个小时。';
    const temporalAudit={status:'evaluated',checks:[{ref:'T1',status:'unknown',reason:'缺少具体靠岸时点，不能把更紧上界判为互斥。',calculations:[{quantityIndex:0,sameEndpoints:false,reason:'缺少当前叙述时刻，保留未知不猜结束时钟。'}]}]};
    controller.realLLM={generate:vi.fn().mockResolvedValue({content:JSON.stringify({...passVerdict,temporalAudit,contradictions:[{kind:'story',summary:'人物名单与确认资料不符。'}]})})};
    const input={projectId:'p',chapterIndex:1,chapterTitle:'渡海',outlineContract:'有效详细大纲'.repeat(30),storyContext:'',content};
    const report=await controller.checkChapterAlignment(input);
    expect(report.contradictions).toEqual(['人物名单与确认资料不符。']);expect(report.pass).toBe(false);
  });

  it('rejects unclassified model findings instead of letting a time claim bypass validation',async()=>{
    const controller=applyStandardsStub(Object.create(ChainController.prototype) as any);
    controller.realLLM={generate:vi.fn().mockResolvedValue({content:JSON.stringify({...passVerdict,contradictions:['两个上界不一致']})})};
    const report=await controller.checkChapterAlignment({projectId:'p',chapterIndex:1,chapterTitle:'首章',outlineContract:'有效详细大纲'.repeat(30),storyContext:'',content:'她关上了门。'});
    expect(report.evaluationStatus).toBe('not_evaluated');expect(report.missing.join('')).toContain('类型');
  });

  it('does not turn a vague clock wording advisory into a second numeric gate',()=>{
    const advisory='傍晚与八点的时间段措辞不一致，属非阻断的局部措辞建议。';
    const result=partitionAlignmentFindings([], '本章合同', [advisory],true);
    expect(result.blocking).toEqual([]);expect(result.advisories).toContain(advisory);
    expect(partitionAlignmentFindings([], '本章合同', ['名单姓名不在人物白名单'],true).blocking).toHaveLength(1);
  });

  it('measures the current candidate and injects the same temporal policy into actual alignment review',async()=>{
    const controller=applyStandardsStub(Object.create(ChainController.prototype) as any);
    controller.realLLM={generate:vi.fn().mockResolvedValue({content:JSON.stringify(passVerdict)})};
    const content='“别烧。”她拒签。\n\n“把遗体留下。”主任收起单子。';
    await controller.checkChapterAlignment({projectId:'p',chapterIndex:1,chapterTitle:'首章',outlineContract:'有效详细大纲'.repeat(30),storyContext:'已确认上下文',content});
    const prompt=controller.realLLM.generate.mock.calls[0][0].prompt;
    standardDirectiveCache.rebuild();
    const effective = prompt + standardDirectiveCache.get('review');
    expect(effective.split(TEMPORAL_FACT_CONTINUITY_POLICY)).toHaveLength(2);
    const target=targetForLength(getPlatform(STANDARD_PRECONDITIONS.targetPlatform),'short_story');
    expect(prompt).toContain(JSON.stringify(measureAgainstTarget(content,target)));
    expect(effective.split(PLATFORM_MEASUREMENT_REVIEW_POLICY)).toHaveLength(2);
  });

  it('语言评审有阻断证据时，即使模型总pass为true仍不能通过',async()=>{
    const controller=applyStandardsStub(Object.create(ChainController.prototype) as any);
    controller.realLLM={generate:vi.fn().mockResolvedValue({content:JSON.stringify({...passVerdict,prosePassed:false,contradictions:[{kind:'language',summary:'正文“她抬起他拿着”缺少谓语衔接，无法判明动作主体。'}]})})};
    const report=await controller.checkChapterAlignment({projectId:'any-project',chapterIndex:1,chapterTitle:'首章',outlineContract:'有效详细大纲'.repeat(30),storyContext:'已确认上下文',content:'她抬起他拿着。'});
    expect(report.evaluationStatus).toBe('evaluated');expect(report.pass).toBe(false);expect(report.prosePassed).toBe(false);
    expect(report.contradictions.join('')).toContain('动作主体');
  });
  it('keeps author requirements reported as missing eligible for repair while blocking PASS',async()=>{
    const controller=applyStandardsStub(Object.create(ChainController.prototype) as any);
    controller.realLLM={generate:vi.fn().mockResolvedValue({content:JSON.stringify({...passVerdict,prosePassed:false,missingRequiredItems:['作者要求消除“周。慕。”碎句，正文仍未执行。']})})};
    const report=await controller.checkChapterAlignment({projectId:'any-project',chapterIndex:1,chapterTitle:'首章',outlineContract:'有效详细大纲'.repeat(30),storyContext:'作者明确要求合并碎句',content:'周。慕。'});
    expect(report.evaluationStatus).toBe('evaluated');
    expect(report.pass).toBe(false);
    expect(report.missing.join('')).toContain('未执行');
  });

  it('keeps a factual reviewer advisory blocking in the actual alignment gate', async () => {
    const controller = applyStandardsStub(Object.create(ChainController.prototype) as any);
    controller.realLLM = { generate: vi.fn().mockResolvedValue({ content: JSON.stringify({
      ...passVerdict, advisories: ['配角李成有姓名，不在出场角色白名单内。'],
    }) }) };
    const report = await controller.checkChapterAlignment({
      projectId: 'p1', chapterIndex: 1, chapterTitle: '第一章',
      outlineContract: '有效详细大纲'.repeat(30), storyContext: '已确认上下文', content: '林野检查了名单。',
    });
    expect(report.pass).toBe(false);
    expect(report.contradictions).toContain('配角李成有姓名，不在出场角色白名单内。');
    expect(report.advisories).not.toContain('配角李成有姓名，不在出场角色白名单内。');
  });

  it('builds a compact subsequent chapter boundary list from outlines', () => {
    const db = {
      prepare: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('FROM chapters c JOIN outlines')) {
          return { get: vi.fn().mockReturnValue({ id: 'current' }) };
        }
        return {
          all: vi.fn().mockReturnValue([
            { id: 'current', title: '当前章', content: '当前章任务' },
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
        if (sql.includes('FROM chapters c JOIN outlines')) {
          return { get: vi.fn().mockReturnValue({ id: 'final' }) };
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
    const controller = applyStandardsStub(Object.create(ChainController.prototype) as any);
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
    expect(prompt).toContain('按已注入的质量评审执行标准');
  });

  it('omits the boundary section when no subsequent chapters exist', async () => {
    const generate = vi.fn().mockResolvedValue({ content: JSON.stringify(passVerdict) });
    const controller = applyStandardsStub(Object.create(ChainController.prototype) as any);
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

  it('blocks a source conflict even when the reviewer marks prose and outline as passed', async () => {
    const generate = vi.fn().mockResolvedValue({ content: JSON.stringify({
      ...passVerdict,
      sourceConflicts: ['世界档案简介称三年前同一雨夜，规则条称每次回拨一小时'],
    }) });
    const controller = applyStandardsStub(Object.create(ChainController.prototype) as any);
    controller.realLLM = { generate };
    const result = await controller.checkChapterAlignment({
      projectId: 'p1', chapterIndex: 1, chapterTitle: '第一章',
      outlineContract: '有效详细大纲'.repeat(30), storyContext: '已确认上下文', content: '正文内容',
    });
    expect(result.pass).toBe(false);
    expect(result.sourceConflicts).toHaveLength(1);
  });

  it('injects the boundary into the first-pass prompt and forwards it to alignment checks', async () => {
    const controller = applyStandardsStub(Object.create(ChainController.prototype) as any);
    controller.realLLM = {
      generate: vi.fn().mockResolvedValue({ content: '正文'.repeat(400) }),
      validateGeneratedContent: vi.fn().mockResolvedValue('正文'.repeat(400)),
    };
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

  it('混合失败且局部事实补丁为空时保留原稿，不回退到整章重写', async () => {
    const controller = applyStandardsStub(Object.create(ChainController.prototype) as any);
    const body = '林野带礼簿走到二楼，核对名单。'.repeat(180);
    controller.realLLM = {
      validateGeneratedContent: vi.fn().mockResolvedValue(body),
      generate: vi.fn().mockResolvedValue({ content: '{"patches":[]}' }),
    };
    controller.getActiveLessons = vi.fn().mockReturnValue('');
    controller.generateBodyWithLengthGuard = vi.fn().mockResolvedValue(body);
    controller.assertGeneratedChapterIdentity = vi.fn();
    controller.repairHardlineFindingsLocally = vi.fn();
    controller.repairOutlineFactsLocally = vi.fn().mockResolvedValue(null);
    controller.persistAlignmentContradictions = vi.fn();
    controller.assertNoBlockingGeneratedContentIssues = vi.fn();
    const failed = {
      evaluationStatus: 'evaluated', pass: false,
      missing: ['第二次进门后，二楼那户必须变空'],
      contradictions: ['【硬红线·确定性扫描·35】标点平板'],
      hardlineFindings: [{ ruleId: '35', message: '标点平板', paragraphs: [body] }],
      advisories: [], sourceConflicts: [], evidence: [],
    };
    const passed = { ...failed, pass: true, missing: [], contradictions: [], hardlineFindings: [] };
    controller.checkChapterAlignment = vi.fn().mockResolvedValueOnce(failed).mockResolvedValueOnce(passed);

    await expect(controller.generateBodyWithAlignmentGuard({
      projectId: 'p1', basePrompt: '写正文', targetWords: 4000,
      scenario: 'writing_climax', chapterIndex: 1, chapterTitle: '第一章',
      outlineContract: '有效详细大纲'.repeat(30), storyContext: '已确认上下文',
      subsequentChapterBoundary: '第二章才揭示投料者',
      wordRange: { min: 3000, max: 5000 },
    })).rejects.toThrow();

    expect(controller.generateBodyWithLengthGuard).toHaveBeenCalledTimes(1);
    expect(controller.repairOutlineFactsLocally).toHaveBeenCalledWith(expect.objectContaining({issues:['第二次进门后，二楼那户必须变空']}));
    expect(controller.repairOutlineFactsLocally).toHaveBeenCalledWith(expect.objectContaining({storyContext: expect.stringContaining('已确认上下文')}));
    expect(controller.repairOutlineFactsLocally).toHaveBeenCalledWith(expect.objectContaining({storyContext: expect.stringContaining('第二章才揭示投料者')}));
    expect(controller.persistAlignmentContradictions).toHaveBeenCalledWith(expect.objectContaining({content:body}));
    expect(controller.repairHardlineFindingsLocally).not.toHaveBeenCalled();
  });

  it('uses a verified local fact patch before whole-chapter rewriting and then reaches hardline repair', async () => {
    const controller = applyStandardsStub(Object.create(ChainController.prototype) as any);
    const body = '林野核对名单，二楼那户仍有名字。'.repeat(180);
    const corrected = body.replace('二楼那户仍有名字', '二楼那户变成空白');
    const final = corrected.replace('林野核对名单', '林野停下来核对名单');
    controller.realLLM = { validateGeneratedContent: vi.fn().mockResolvedValue(body) };
    controller.getActiveLessons = vi.fn().mockReturnValue('');
    controller.generateBodyWithLengthGuard = vi.fn().mockResolvedValue(body);
    controller.assertGeneratedChapterIdentity = vi.fn();
    controller.repairOutlineFactsLocally = vi.fn().mockResolvedValue(corrected);
    controller.repairHardlineFindingsLocally = vi.fn().mockResolvedValue({ content: final, before: 1, after: 0 });
    controller.buildAlignmentRepairPrompt = vi.fn();
    controller.persistAlignmentContradictions = vi.fn();
    controller.assertNoBlockingGeneratedContentIssues = vi.fn();
    const hardline = { ruleId: '35', message: '标点平板', position: '第 1 段', snippet: '林野核对名单' };
    const base = { evaluationStatus: 'evaluated', advisories: [], sourceConflicts: [], evidence: [] };
    controller.checkChapterAlignment = vi.fn()
      .mockResolvedValueOnce({ ...base, pass: false, missing: ['二楼那户必须变空'], contradictions: [], hardlineFindings: [hardline] })
      .mockResolvedValueOnce({ ...base, pass: false, missing: [], contradictions: [], hardlineFindings: [hardline] })
      .mockResolvedValueOnce({ ...base, pass: true, missing: [], contradictions: [], hardlineFindings: [] });

    await controller.generateBodyWithAlignmentGuard({
      projectId: 'p1', basePrompt: '写正文', targetWords: 4000,
      scenario: 'writing_climax', chapterIndex: 1, chapterTitle: '第一章',
      outlineContract: '有效详细大纲'.repeat(30), storyContext: '已确认上下文',
      wordRange: { min: 3000, max: 5000 },
    });
    expect(controller.repairOutlineFactsLocally).toHaveBeenCalledTimes(1);
    expect(controller.repairHardlineFindingsLocally).toHaveBeenCalledTimes(1);
    expect(controller.buildAlignmentRepairPrompt).not.toHaveBeenCalled();
    expect(controller.generateBodyWithLengthGuard).toHaveBeenCalledTimes(1);
  });

  it('keeps the reviewed draft when language repair reduces scanner hits but introduces a story blocker', async () => {
    const controller = applyStandardsStub(Object.create(ChainController.prototype) as any);
    const body='她核对这份名单。'.repeat(180);
    const candidate=body+'她提前揭开下一章的答案。';
    controller.realLLM={validateGeneratedContent:vi.fn()};
    controller.getActiveLessons=vi.fn(()=> '');
    controller.generateBodyWithLengthGuard=vi.fn(async()=>body);
    controller.assertGeneratedChapterIdentity=vi.fn();
    controller.repairHardlineFindingsLocally=vi.fn(async()=>({content:candidate,before:1,after:0}));
    controller.repairOutlineFactsLocally=vi.fn();
    controller.persistAlignmentContradictions=vi.fn();
    controller.assertNoBlockingGeneratedContentIssues=vi.fn();
    const base={evaluationStatus:'evaluated',pass:false,missing:[],advisories:[],sourceConflicts:[],evidence:[]};
    controller.checkChapterAlignment=vi.fn()
      .mockResolvedValueOnce({...base,contradictions:[],hardlineFindings:[{ruleId:'35',message:'标点',position:'首段',snippet:'她核对'}]})
      .mockResolvedValueOnce({...base,contradictions:['跨章提前消费下一章的答案'],hardlineFindings:[]});
    await controller.generateBodyWithAlignmentGuard({projectId:'p1',basePrompt:'生成本章',targetWords:4000,
      scenario:'writing',chapterIndex:1,outlineContract:'本章任务'.repeat(30),storyContext:'上下文',wordRange:{min:3000,max:5000}}).catch(()=>null);
    expect(controller.persistAlignmentContradictions).toHaveBeenCalled();
    expect(controller.persistAlignmentContradictions.mock.calls.every((call:any)=>call[0].content===body)).toBe(true);
    expect(controller.repairOutlineFactsLocally).not.toHaveBeenCalled();
  });

  it('applies an exact outline fact patch while keeping unrelated prose byte-identical', async () => {
    const controller = applyStandardsStub(Object.create(ChainController.prototype) as any);
    controller.buildExecutionStandardTags = vi.fn().mockReturnValue('平台：番茄');
    controller.getProjectCharacterNames = vi.fn().mockReturnValue([]);
    controller.assertGeneratedChapterIdentity = vi.fn();
    const before = `${'林野沿墙核对名单。'.repeat(150)}二楼那户仍写着名字。`;
    controller.realLLM = { generate: vi.fn().mockResolvedValue({ content: JSON.stringify({
      patches: [{ original: '二楼那户仍写着名字。', replacement: '二楼那户已变成空白。' }],
    }) }) };
    const after = await controller.repairOutlineFactsLocally({
      projectId: 'p1', chapterIndex: 1, content: before,
      outlineContract: '二楼那户变空', issues: ['二楼那户必须变空'], attempt: 1,
      storyContext: '作者本次要求：不把未知原因解释为自动获救。人物只知道名单变空。后续章节才揭原因。',
    });
    expect(after).toBe(`${'林野沿墙核对名单。'.repeat(150)}二楼那户已变成空白。`);
    expect(controller.realLLM.generate.mock.calls[0][0].scenario).toBe('refinement');
    expect(controller.realLLM.generate.mock.calls[0][0].structuredRepairIssueCount).toBe(1);
    expect(controller.realLLM.generate.mock.calls[0][0].prompt).toContain('作者本次要求：不把未知原因解释为自动获救。人物只知道名单变空。后续章节才揭原因。');
  });

  it('batches more than four outline defects instead of skipping local repair', async () => {
    const controller = applyStandardsStub(Object.create(ChainController.prototype) as any);
    controller.buildExecutionStandardTags = vi.fn().mockReturnValue('平台：番茄');
    controller.getProjectCharacterNames = vi.fn().mockReturnValue([]);
    controller.assertGeneratedChapterIdentity = vi.fn();
    const before = `${'林野沿墙核对名单。'.repeat(150)}二楼那户仍写着名字。`;
    controller.realLLM = { generate: vi.fn().mockResolvedValue({ content: JSON.stringify({
      patches: [{ original: '二楼那户仍写着名字。', replacement: '二楼那户已变成空白。' }],
    }) }) };
    const after = await controller.repairOutlineFactsLocally({
      projectId: 'p1', chapterIndex: 1, content: before,
      outlineContract: '二楼那户变空', issues: ['问题一', '问题二', '问题三', '问题四', '问题五'], attempt: 1,
    });
    expect(after).toContain('二楼那户已变成空白。');
    const prompt = controller.realLLM.generate.mock.calls[0][0].prompt;
    expect(controller.realLLM.generate.mock.calls[0][0].structuredRepairIssueCount).toBe(4);
    expect(prompt).toContain('问题四');
    expect(prompt).not.toContain('问题五');
  });

  it('keeps a safe fact patch when another patch creates a new hardline', async () => {
    const controller = applyStandardsStub(Object.create(ChainController.prototype) as any);
    controller.buildExecutionStandardTags = vi.fn().mockReturnValue('平台：番茄');
    controller.getProjectCharacterNames = vi.fn().mockReturnValue([]);
    controller.assertGeneratedChapterIdentity = vi.fn();
    const before = `${'林野沿墙核对名单。'.repeat(150)}二楼那户仍写着名字。屋里只有一本账册。`;
    controller.realLLM = { generate: vi.fn().mockResolvedValue({ content: JSON.stringify({
      patches: [
        { original: '二楼那户仍写着名字。', replacement: '二楼那户已变成空白。' },
        { original: '屋里只有一本账册。', replacement: '屋里只有一本账册！！' },
      ],
    }) }) };
    const after = await controller.repairOutlineFactsLocally({
      projectId: 'p1', chapterIndex: 1, content: before,
      outlineContract: '二楼那户变空', issues: ['二楼那户必须变空'], attempt: 1,
    });
    expect(after).toContain('二楼那户已变成空白。');
    expect(after).toContain('屋里只有一本账册。');
    expect(after).not.toContain('屋里只有一本账册！！');
  });

  it('surfaces a network failure in local outline repair instead of silently rewriting the chapter', async () => {
    const controller = applyStandardsStub(Object.create(ChainController.prototype) as any);
    controller.buildExecutionStandardTags = vi.fn().mockReturnValue('平台：番茄');
    controller.realLLM = { generate: vi.fn().mockRejectedValue(new Error('UND_ERR_SOCKET')) };
    await expect(controller.repairOutlineFactsLocally({
      projectId: 'p1', chapterIndex: 1, content: '林野核对名单，二楼那户仍有名字。',
      outlineContract: '二楼那户变空', issues: ['二楼那户必须变空'], attempt: 1,
    })).rejects.toThrow('UND_ERR_SOCKET');
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


describe('idea discovery live orchestrator behavior', () => {
  it.each(['patch_protocol', 'repair_network', 'card_network', 'card_shape', 'category_inheritance', 'review_protocol', 'parallel_order', 'review_budget', 'preselection_shortfall'])(
    'preserves passed cards when another candidate fails: %s', async failure => {
    const selected = (id: string, title: string) => ({
      premiseId: id,
      workingTitle: title,
      storyCore: `${title}的具体人物处境、起始事件与冲突骨架。`,
      causalPlan: [{action:{field:'activeChoice',quote:'主角决定留下证据并主动查清来源'},conditions:[{field:'reversalEffect',quote:'关键事实改变了主角原先的目标'}],result:{field:'payoff',quote:'让真正责任方承担后果'}}],
      protagonistSituation: '主角要守住家人、住处和现实收入，无法无代价退出当前冲突。',
      openingEvent: '一份现实记录出现无法解释的矛盾，迫使主角当天处理。',
      coreConflict: '主角要保住现实利益并查清责任，对方则主动逼她放弃证据。',
      activeChoice: '主角决定留下证据并主动查清来源，而不是接受对方给出的退路。',
      escalation: '选择之后工作、家庭和钱的压力连续升级，并牵连新的利益相关者。',
      reversalEffect: '关键事实改变了主角原先的目标、盟友关系和要承担的代价。',
      payoff: '终局由主角自己的选择兑现开篇承诺，并让真正责任方承担后果。',
      irreplaceableCarrier: '具体职业流程、家庭利益和证据载体彼此绑定，换掉任一项故事就不成立。',
      secondOrderConsequence: '主角公开证据后第三方利益受损，原本支持她的人被迫重新站队。',
      readerQuestion: '主角能否在现实利益被拿走之前证明记录是谁改的？',
      differentiation: '冲突由具体生活载体和利益关系共同推动，不是换名后的秘密追查模板。',
    });
    const premiseOne = selected('P1', '遗嘱里的门牌号');
    const premiseTwo = selected('P2', '门后的普通秘密');
    const pool = [
      { premiseId: 'P1', workingTitle: premiseOne.workingTitle, storyCore: premiseOne.storyCore, storyCategoryId: 'K1' },
      { premiseId: 'P2', workingTitle: premiseTwo.workingTitle, storyCore: premiseTwo.storyCore, storyCategoryId: failure === 'category_inheritance' ? 'K2' : 'K1' },
    ];
    const common = {
      storyType: 'short_story', targetPlatform: 'fanqie', storyCategory: '悬疑',
      storyTone: ['紧张'], writingStyle: ['简洁'], webNovelGenre: ['悬疑推理'], pov: '第一人称',
      submissionTags: ['悬疑'], plotTags: ['调查'], estimatedWords: 20000, plannedChapters: 5,
      scopeBreakdown: [{ arc: '全篇主线', chapters: 5, reason: '五章完成调查、选择和兑现' }],
      scopeReason: '两万字按五章展开，每章约四千字。', setting: '现代城市', characters: ['主角', '母亲'], styleTags: ['现实悬疑'],
    };
    const strongCard = {
      ...common,
      title: '遗嘱写着我家门牌',
      hook: '父亲葬礼后，我在遗嘱里看见自家门牌号；每次回家母亲都会忘记我一小时。我只剩三天查清原因，否则她会彻底失去这段记忆，我决定追查父亲留下的债务和那份遗嘱。',
      description: '最初我只想守住母亲和这个家，查清父亲为什么欠下巨债。第一天，我发现债主拿着房屋合同逼母亲搬走；随后我起诉并追查签字人，找到父亲当年替同事担责的证据。第二次回家，母亲忘了我，却记得合同背后的老板。最后我必须在公开证据和保住母亲名声之间选择，并用父亲留下的录音揭开真相，让真正的责任人承担代价。',
      protagonist: '一个想守住母亲、住房和家庭尊严的普通上班族。',
      coreConflict: '主角必须在三天内查清房屋合同与债务真相，同时保护母亲不被债主和公司逼走。',
      uniquePoint: '每次回家母亲都会短暂忘记主角，这个异常逼迫主角重新理解父亲留下的债务与责任。',
      mainReversal: '主角发现父亲并非单纯欠债，而是替同事承担了被公司转嫁的责任；目标从替父还债转为公开证据并起诉真正责任人。',
      noveltyProof: {
        familiarShell: '家庭债务加现实悬疑',
        uncommonCombination: '遗嘱门牌、母亲短时遗忘、房屋合同与职场转嫁责任共同组成证据链',
        avoidedPatterns: '不靠系统任务或单层超常报应推进',
        irreplaceableWhy: '去掉遗嘱和住房合同，家庭债务无法落到具体证据；去掉母亲关系，选择没有现实重量',
        secondOrderConsequence: '公开证据会洗清债务却损害父亲维护的名声，也让母亲必须重新选择如何理解父亲',
        readerQuestion: '遗嘱为什么写着自家门牌，母亲的遗忘又和父亲替人担责有什么关系？',
      },
    };
    const weakCard = {
      ...common,
      title: '门后的普通秘密',
      hook: '她在下班路上遇到一件说不清的事情，于是继续往前走，准备等有机会时再看看究竟发生了什么。',
      description: '最初她照常生活，随后遇见一些变化，接着又得到几条信息。事情逐渐变得复杂，她尝试处理，却始终没有明确目标。后来她发现先前理解并不完整，于是继续观察。最终事情出现新的解释，但她仍然只是顺着情况往前走，没有形成必须承担的选择和兑现。',
      protagonist: '一个想把生活过好的普通上班族，但当前没有清晰的迫近目标。',
      coreConflict: '她面对越来越复杂的情况，却没有形成双方主动争夺同一利益的具体冲突。',
      uniquePoint: '一个暂时说不清楚的生活秘密，会在后面逐渐出现新的解释。',
      mainReversal: '后来她知道事情和最初理解不同，但这个信息没有改变她的目标或关系。',
      noveltyProof: {
        familiarShell: '都市生活悬疑', uncommonCombination: '普通通勤、模糊秘密和零散信息组成观察过程',
        avoidedPatterns: '避免直接套用知名作品', irreplaceableWhy: '当前载体仍可替换，正是最终 Gate 应识别的问题',
        secondOrderConsequence: '事情变化后周围人的态度有所变化，但没有形成明确利益重组',
        readerQuestion: '那件事情后来到底会怎样发展下去呢？',
      },
    };

    const mixed = failure === 'category_inheritance';
    const selectedForBatch = mixed ? [{ ...premiseOne, storyCategory: '悬疑惊悚' }, { ...premiseTwo, storyCategory: '现实生活' }] : [premiseOne, premiseTwo];
    if (mixed) { strongCard.storyCategory = '悬疑惊悚'; weakCard.storyCategory = '现实生活'; }
    let poolBatchCallsStarted = 0;
    let releasePoolBatches!: () => void;
    const bothPoolBatchesStarted = new Promise<void>(resolve => { releasePoolBatches = resolve; });
    const generate = vi.fn(async (request: any) => {
      const step = request.metrics?.stepKey;
      if (step === 'idea_premise_pool_generation') {
        poolBatchCallsStarted += 1;
        if (poolBatchCallsStarted >= 2) releasePoolBatches();
        // A barrier makes the test fail if pool generation is changed back to serial awaits.
        await bothPoolBatchesStarted;
        return { content: JSON.stringify({ pool }) };
      }
      if (step === 'idea_premise_selection') return { content: JSON.stringify({ selectedPremises: selectedForBatch }) };
      if (step === 'idea_card_structure') {
        const selectedBlock = request.prompt.split('【已选题材胚子（内部标识已由服务器移除）】')[1]?.split('【同批差异参照')[0] || '';
        if (selectedBlock.includes(premiseOne.workingTitle)) return { content: JSON.stringify({ ideas: [strongCard] }) };
        if (failure === 'card_network') throw new Error('card connection reset');
        if (failure === 'card_shape') return { content: JSON.stringify({ ideas: [] }) };
        return { content: JSON.stringify({ ideas: [weakCard] }) };
      }
      if (step === 'idea_card_local_repair') {
        if (failure === 'repair_network') throw new Error('repair connection reset');
        return { content: JSON.stringify({ patches: [{}] }) };
      }
      throw new Error('unexpected generation step: ' + String(step));
    });
    const controller = Object.create(ChainController.prototype) as any;
    controller.realLLM = { assertScenarioModelConfigured: vi.fn(), generate };
    controller.reviewPremiseSelection = vi.fn().mockResolvedValue({ passed: true, issues: [] });
    controller.reviewIdeaPresentation = vi.fn(async (cards: any[]) => cards.map((card, index) => ({
      position: index + 1, title: card.title, titleCompelling: true,
      openingCompelling: true, distinctFromBatch: true,
      storyCoherent: true, payoffCredible: true, platformFit: true,
      storyEvidence: card.hook, payoffEvidence: card.description, platformEvidence: card.hook,
      qualityReason: '以实际题材的主动选择、因果和结局证据完成评审。',
      readerQuestion: '这些记录背后的责任人为何主动逼她放弃证据？', issues: [],
    })));
    if(failure==='preselection_shortfall')controller.reconcilePremiseSelection=vi.fn(async(initial:any)=>({...initial,selected:initial.selected.slice(0,1),selectionAudit:{partial:true,reasons:[{reason:'其余题材同构且原池有界重选后仍不合格'}]}}));
    if(failure==='review_budget'){
      const review=controller.reviewIdeaPresentation.getMockImplementation();
      controller.reviewIdeaPresentation.mockImplementation((cards:any[],refs:any[],note:string,budget:any)=>{budget.remaining=0;return review(cards);});
    }
    if (failure === 'review_protocol') controller.reviewIdeaPresentation.mockRejectedValue(new Error('题材独立审查未完成：platformEvidence引用了执行标准'));
    if (failure === 'parallel_order') {
      let releaseFirst!: () => void;
      const secondStarted = new Promise<void>(resolve => { releaseFirst = resolve; });
      let cardCalls = 0;
      controller.realLLM.generate = async (request: any) => {
        const result = generate(request);
        if (request.metrics?.stepKey === 'idea_card_structure') {
          cardCalls += 1;
          if (cardCalls === 1) await secondStarted;
          if (cardCalls === 2) releaseFirst();
        }
        return result;
      };
    }
    controller.ideaAppealGate = new IdeaAppealGateService();
    controller.logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    controller.db = {
      getDb: () => ({
        prepare: () => ({ all: () => [] }),
      }),
    };

    const result = await controller.runIdeaDiscovery({
      storyType: 'short_story', platform: 'fanqie', customPlatformNote: '',
      storyTone: ['紧张'], writingStyle: ['简洁'], webNovelGenre: ['悬疑推理'],
      submissionTags: ['悬疑'], plotTags: ['调查'], genreFitNote: '', pov: '第一人称',
      targetWords: '20000', storyCategory: '悬疑', targetAudience: '',
      ...(mixed ? { discoveryCategoryOptions: ['悬疑惊悚', '现实生活'] } : {}),
    }, 2);
    expect(generate.mock.calls[0][0].prompt).toContain('【服务器分类编号目录】');
    expect(generate.mock.calls[0][0].prompt).toContain('storyCategoryId');
    const poolCalls = generate.mock.calls.filter(([request]: any[]) => request.metrics?.stepKey === 'idea_premise_pool_generation');
    expect(poolCalls).toHaveLength(2);
    expect(poolCalls.map(([request]: any[]) => request.metrics?.attempt)).toEqual([0, 1]);
    expect(poolCalls[0][0].prompt).toContain('候选池并发生成');
    expect(poolCalls[0][0].prompt).toContain('只生成恰好 4 个轻量题材胚子');
    expect(poolCalls[1][0].prompt).toContain('只生成恰好 3 个轻量题材胚子');
    expect(poolCalls.every(([request]: any[]) => !request.prompt.includes('"selectedPremises"'))).toBe(true);
    const selectionCall = generate.mock.calls.find(([request]: any[]) => request.metrics?.stepKey === 'idea_premise_selection');
    expect(generate.mock.calls.indexOf(selectionCall as any)).toBe(2);
    expect(selectionCall?.[0].prompt).toContain('【服务器已固定的候选池；不得新增、改写或重新编号】');
    expect(selectionCall?.[0].prompt).toContain('"premiseId":"P1"');
    expect(selectionCall?.[0].prompt).toContain('"premiseId":"P2"');
    expect(selectionCall?.[0].prompt).toContain('只输出selectedPremises');
    if(failure==='preselection_shortfall'){
      expect(generate.mock.calls.some(([request]:any[])=>request.metrics?.stepKey==='idea_card_structure')).toBe(true);
      expect(controller.reviewIdeaPresentation).toHaveBeenCalled();
      expect(result.success).toBe(false);expect(result.status).toBe('incomplete');expect(result.ideas).toEqual([]);
      expect(result.appealGate).toMatchObject({premiseSelected:1,preselectionShortfall:1,requested:2,fulfillment:{stopReason:'preselection_shortfall'}});
      expect(result.appealGate.selectionAudit.poolGeneration).toMatchObject({target:7,generated:2,shortfall:5,batchCount:2,maxConcurrency:2});
      expect(Array.isArray(result.qualifiedIdeas)).toBe(true);
      return;
    }
    expect(controller.reviewPremiseSelection).toHaveBeenCalledTimes(2);
    for (const call of controller.reviewPremiseSelection.mock.calls) {
      expect(call[0].selected.every((premise: any) => premise.storyCategory)).toBe(true);
      expect(call[1]).toContain('【与完整卡一致的分类标准】');
      expect(call[1]).toContain('【本次作者明确选择');
      expect(call[1]).toContain('"webNovelGenre":["悬疑推理"]');
      expect(call[1]).toContain('"plotTags":["调查"]');
      expect(call[1]).toContain('"writingStyle":["简洁"]');
      expect(call[1]).toContain('"pov":"第一人称"');
    }
    const firstCardCallIndex = generate.mock.calls.findIndex(([request]: any[]) => request.metrics?.stepKey === 'idea_card_structure');
    expect(firstCardCallIndex).toBeGreaterThanOrEqual(0);
    expect(controller.reviewPremiseSelection.mock.invocationCallOrder[0]).toBeLessThan(generate.mock.invocationCallOrder[firstCardCallIndex]);

    if (failure === 'review_protocol') {
      expect(generate).toHaveBeenCalledTimes(5);
      expect(controller.reviewIdeaPresentation).toHaveBeenCalledOnce();
      expect(result.success).toBe(false);
      expect(result.error).toContain('审查未完成');
      return;
    }

    expect(result.appealGate.selectionAudit.poolGeneration).toMatchObject({target:7,generated:2,shortfall:5,batchCount:2,maxConcurrency:2});
    if(failure==='review_budget'){
      expect(generate).toHaveBeenCalledTimes(5);expect(controller.reviewIdeaPresentation).toHaveBeenCalledOnce();
      expect(result.success).toBe(false);expect(result.appealGate.repairAttempted).toBe(false);
      expect(result.appealGate.fulfillment.stopReason).toBe('budget_or_original_pool_exhausted');return;
    }
    const cardFailed = failure === 'card_network' || failure === 'card_shape';
    // The repair fixture returns an empty patch: preserve the original refusal without another review.
    expect(controller.reviewIdeaPresentation).toHaveBeenCalledTimes(1);
    if (!cardFailed && failure !== 'repair_network') expect(result.appealGate.repairGenerated).toBe(0);
    expect(generate).toHaveBeenCalledTimes(cardFailed ? 5 : 6);
    expect(result.success).toBe(false);
    expect(result.status).toBe('incomplete');
    expect(result.ideas).toHaveLength(0);
    expect(result.qualifiedIdeas).toHaveLength(1);
    expect(result.qualifiedIdeas[0].sourcePremiseId).toBe('P1');
    if (mixed) {
      expect(result.qualifiedIdeas[0].storyCategory).toBe('悬疑惊悚');
      const cardPrompts = generate.mock.calls.filter(([request]: any[]) => request.metrics?.stepKey === 'idea_card_structure').map(([request]: any[]) => request.prompt);
      expect(cardPrompts.find(prompt => prompt.split('【已选题材胚子（内部标识已由服务器移除）】')[1]?.split('【同批差异参照')[0]?.includes(premiseOne.workingTitle))).toContain('分类=悬疑惊悚');
      expect(cardPrompts.find(prompt => prompt.split('【已选题材胚子（内部标识已由服务器移除）】')[1]?.split('【同批差异参照')[0]?.includes(premiseTwo.workingTitle))).toContain('分类=现实生活');
      expect(result.appealGate.selectedCategories).toEqual(['悬疑惊悚', '现实生活']);
    }
    expect(result.totalIdeas).toBe(0);
    expect(result.error).toContain('请求 2，最终通过 1');
    if (cardFailed) {
      expect(result.appealGate.structuringErrors).toEqual([expect.objectContaining({ sourcePremiseId: 'P2' })]);
    }
    if (failure === 'repair_network') expect(result.appealGate.repairError).toContain('repair connection reset');
    expect(result.appealGate).toEqual(expect.objectContaining({
      premiseSelected: 2,
      generated: cardFailed ? 1 : 2,
      qualified: 1,
      requested: 2,
      shortfall: 1,
      returned: 0,
      rejected: 1,
    }));
  });
});

describe('discovery before dimension confirmation', () => {
  it('provides dictionary choices to premise selection and preserves a prerequisite refusal without retrying or weakening gates', async () => {
    const controller = Object.create(ChainController.prototype) as any;
    const refusal = { pool: [], selectedPremises: [], blocked: true,
      missingRequiredDimensions: ['流派', '基调', '文风', '视角'],
      message: '按 GEN-001 当前必填执行维度缺失，必须阻断' };
    controller.realLLM = { assertScenarioModelConfigured: vi.fn(),
      generate: vi.fn().mockResolvedValue({ content: JSON.stringify(refusal) }) };
    controller.logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    controller.db = { getDb: () => ({ prepare: (sql: string) => ({ all: (type: string) =>
      sql.includes('story_dict') ? [{ label: `真实候选-${type}` }] : [] }) }) };
    const result = await controller.runIdeaDiscovery({ storyType: 'short_story', platform: 'fanqie',
      customPlatformNote: '', storyCategory: '年代', storyTone: [], writingStyle: [], webNovelGenre: [],
      submissionTags: [], plotTags: [], genreFitNote: '', pov: '' }, 5);
    expect(controller.realLLM.generate).toHaveBeenCalledTimes(2);
    const prompt = controller.realLLM.generate.mock.calls[0][0].prompt;
    expect(prompt).toContain('当前阶段=灵感发现的题材预选');
    for (const type of ['tone_tag', 'writing_style', 'web_novel_genre', 'narrative_pov']) {
      expect(prompt).toContain(`真实候选-${type}`);
    }
    expect(result.success).toBe(false);
    expect(result.error).toContain(refusal.message);
    expect(result.error).toContain('流派、基调、文风、视角');
    expect(result.error).not.toContain('有效轻量题材胚子');
  });
});

it('routes to upstream diagnosis after a repeated family instead of spending a second repair and review cycle', async()=>{
  const controller=applyStandardsStub(Object.create(ChainController.prototype) as any);
  const body='她核对名单，留下待确认的一行。'.repeat(180);
  controller.getActiveLessons=vi.fn(()=> '');
  controller.generateBodyWithLengthGuard=vi.fn(async()=>body);
  controller.assertGeneratedChapterIdentity=vi.fn();
  controller.repairOutlineFactsLocally=vi.fn(async()=>body+'她核对完第一页。');
  controller.persistAlignmentContradictions=vi.fn();
  controller.recordGateRejection=vi.fn();
  controller.diagnoseUpstreamRepair=vi.fn(async()=>({status:'evaluated',trigger:'同类缺陷',findings:[{
    stage:'generation_execution',reason:'正文对白仍未落实当前章既有交流场景，须检查生成输入。',nextAction:'核对首稿怎样消费平台要求，并检查其它章同类交流处理。'}]}));
  const base={evaluationStatus:'evaluated',pass:false,advisories:[],sourceConflicts:[],evidence:[],hardlineFindings:[],contradictions:[]};
  controller.checkChapterAlignment=vi.fn()
    .mockResolvedValueOnce({...base,missing:['对白占比不足']})
    .mockResolvedValueOnce({...base,missing:['对白占比不足']});
  await expect(controller.generateBodyWithAlignmentGuard({projectId:'p1',basePrompt:'写本章',targetWords:4000,
    scenario:'writing',chapterIndex:1,chapterTitle:'第一章',outlineContract:'本章应有对话和核心事件。'.repeat(30),storyContext:'当前确认的上下文',wordRange:{min:3000,max:5000}})).rejects.toThrow();
  expect(controller.repairOutlineFactsLocally).toHaveBeenCalledTimes(1);
  expect(controller.checkChapterAlignment).toHaveBeenCalledTimes(2);
  expect(controller.diagnoseUpstreamRepair).toHaveBeenCalledTimes(1);
  expect(controller.persistAlignmentContradictions.mock.calls.some((c:any)=>c[0].source==='alignment_verifier_advisory'&&c[0].contradictions.some((x:string)=>x.includes('上游诊断')))).toBe(true);
});

it('uses the full same-scope routing inventory and preserves hardline evidence after semantic improvement',async()=>{
 const controller=applyStandardsStub(Object.create(ChainController.prototype) as any);const body='她核对名单，留下待确认的一行。'.repeat(180);const hard='【硬红线·确定性扫描·54-measure-word-mismatch】量词错配 | 原文: 那束奶油蛋糕';
 controller.getActiveLessons=vi.fn(()=> '');controller.generateBodyWithLengthGuard=vi.fn(async()=>body);controller.assertGeneratedChapterIdentity=vi.fn();controller.repairOutlineFactsLocally=vi.fn(async()=>body+'她核对完第一页。');controller.persistAlignmentContradictions=vi.fn();controller.recordGateRejection=vi.fn();controller.diagnoseUpstreamRepair=vi.fn(async()=>({status:'evaluated',findings:[]}));
 const base={evaluationStatus:'evaluated',pass:false,advisories:[],sourceConflicts:[],evidence:[],hardlineFindings:[{ruleId:'54-measure-word-mismatch',occurrenceCount:1,snippet:'那束奶油蛋糕',position:'第1段',message:'量词错配'}],contradictions:[hard]};
 controller.checkChapterAlignment=vi.fn().mockResolvedValueOnce({...base,missing:['开篇事件未兑现']}).mockResolvedValueOnce({...base,missing:[]});
 await expect(controller.generateBodyWithAlignmentGuard({projectId:'p1',basePrompt:'写本章',targetWords:4000,scenario:'writing',chapterIndex:1,chapterTitle:'第一章',outlineContract:'有效详细大纲'.repeat(30),storyContext:'已确认上下文'})).rejects.toThrow();
 expect(controller.diagnoseUpstreamRepair).toHaveBeenCalledTimes(1);const diagnosis=controller.diagnoseUpstreamRepair.mock.calls[0][0];expect(diagnosis.trigger).not.toBe('问题集合增长');expect(diagnosis.issues).toContain(hard);
});

it('does not promote narrative conflict and dialogue ratio advice from the actual failed review',()=>{
 const advice='对话占比18.8%，低于平台经验区间35%–65%。本章为开篇单视角动作段，独处送单、算账与门禁冲突占据主段，人物可交流处已有对白；属经验区间偏差，建议不改动既有对白结构硬凑比例。';
 expect(partitionAlignmentFindings([], '本章合同', [advice],true)).toMatchObject({blocking:[],advisories:[advice]});
 const actual=advice+'但人物姓名与确认名单冲突。';
 expect(partitionAlignmentFindings([], '本章合同', [actual],true).blocking).toEqual([actual]);
 expect(partitionAlignmentFindings([advice], '本章合同',[],true).blocking).toEqual([advice]);
});


it('reports failed candidate review instead of the previous repaired body defect',async()=>{
 const controller=applyStandardsStub(Object.create(ChainController.prototype) as any),body='她核对名单，留下待确认的一行。'.repeat(180);
 controller.getActiveLessons=vi.fn(()=> '');controller.generateBodyWithLengthGuard=vi.fn(async()=>body);controller.assertGeneratedChapterIdentity=vi.fn();controller.repairOutlineFactsLocally=vi.fn(async()=>body+'她核对完第一页。');controller.persistAlignmentContradictions=vi.fn();controller.recordGateRejection=vi.fn();
 const base={pass:false,advisories:[],sourceConflicts:[],evidence:[],hardlineFindings:[],contradictions:[]};
 controller.checkChapterAlignment=vi.fn().mockResolvedValueOnce({...base,evaluationStatus:'evaluated',missing:['原先缺失的关键行动']}).mockResolvedValueOnce({...base,evaluationStatus:'not_evaluated',missing:['专项时间审查未完成：结构化输出截断']});
 await expect(controller.generateBodyWithAlignmentGuard({projectId:'p1',basePrompt:'写本章',targetWords:4000,scenario:'writing',chapterIndex:1,chapterTitle:'第一章',outlineContract:'有效详细大纲'.repeat(30),storyContext:'已确认上下文'})).rejects.toThrow();
 const record=controller.recordGateRejection.mock.calls[0][0];expect(JSON.stringify(record.report)).toContain('专项时间审查未完成');expect(JSON.stringify(record.report)).not.toContain('原先缺失的关键行动');expect(record.content).toBe(body);expect(controller.repairOutlineFactsLocally).toHaveBeenCalledTimes(1);
});

it('does not promote an advisory that explicitly denies missing facts, while retaining affirmative defects',()=>{
 const denied='大纲要求从门卫确认住户身份，正文姓名确认来自订单与电话，未构成缺失或冲突。';
 expect(partitionAlignmentFindings([], '故事章纲', [denied],true)).toMatchObject({blocking:[],advisories:[denied]});
 const mixed='大纲要求的关键行动缺失。其余表达未构成缺失或冲突。';expect(partitionAlignmentFindings([], '故事章纲',[mixed],true).blocking).toEqual([mixed]);
 expect(partitionAlignmentFindings([denied], '故事章纲',[],true).blocking).toEqual([denied]);
});


it('sends matching complete pool sources to source review and every selected item to overlap review',async()=>{
 const controller=Object.create(ChainController.prototype) as any;
 controller.llmCallWithRetry=vi.fn(async (_label:string,_prompt:string,options:any)=>{const data=options.stepKey==='idea_premise_source_drift_review'
  ? {sourceChecks:premiseSourceComparisonCatalog(selection).map(row=>({ref:row.ref,status:'preserved',reason:'当前展开字段保留原池的行动与结果约束'})),payoffChecks:[{ref:'S1.payoff',status:'supported',actionEvidenceRef:'S1.activeChoice',reason:'该普通行动能够直接造成规划中的对应结果'}]}
  : {passed:true,issues:[]};expect(options.validate(data)).toBe(true);return {data,warnings:[]};});
 const selection={pool:[{premiseId:'P1',storyCore:'保留原始骨架完整内容'},{premiseId:'P2',storyCore:'未选原池项专用标记'}],selected:[{premiseId:'P1',storyCore:'保留原始骨架完整内容',activeChoice:'她拨通电话并说明具体情况。',payoff:'电话接通，双方开始交谈。'}]};
 await controller.reviewPremiseSelection(selection,'既定标准','source_drift');
 const source=controller.llmCallWithRetry.mock.calls[0][1];expect(source).toContain('保留原始骨架完整内容');expect(source).not.toContain('未选原池项专用标记');
 await controller.reviewPremiseSelection(selection,'既定标准','overlap');
 const overlap=controller.llmCallWithRetry.mock.calls[1][1];expect(overlap).toContain('保留原始骨架完整内容');expect(overlap).not.toContain('原轻量池');
});

it('supplies exact saved closing text while retaining the complete predecessor for handoff review',()=>{
 const c=Object.create(ChainController.prototype) as any;const raw='前章完整正文。'.repeat(400)+'早上八点零六分，他已经收到通知。';
 c.db={getDb:()=>({prepare:()=>({get:()=>({id:'previous',chapter_index:3,title:'前章',content:raw}),all:()=>[]})})};
 const context=JSON.parse(c.previousChapterReviewContext('p',4,'既定背景'));
 expect(context.previousChapter[0].content).toBe(raw);expect(context.chapterHandoff.predecessorClosingScene).toBe(raw.slice(-1800));
 expect(context.chapterHandoff.predecessorId).toBe('previous');
});


it('keeps selected POV candidates separate from the single POV of each story',async()=>{
 const controller=Object.create(ChainController.prototype) as any;controller.logger={warn:vi.fn()};
 controller.runIdeaDiscovery=vi.fn().mockResolvedValue({success:true,ideas:[]});
 await controller.ideaDiscover({storyType:'short_story',platform:'fanqie',storyCategory:'',pov:JSON.stringify(['第一人称','第三人称限知'])});
 const selected=controller.runIdeaDiscovery.mock.calls[0][0];
 expect(selected.pov).toBe('');expect(selected.discoveryPovOptions).toEqual(['第一人称','第三人称限知']);
});
it('does not merge in-flight requests with different selected POV candidates',async()=>{
 const controller=Object.create(ChainController.prototype) as any;controller.logger={warn:vi.fn()};
 controller.runIdeaDiscovery=vi.fn().mockImplementation(async()=>({success:true,ideas:[]}));
 await Promise.all([
 controller.ideaDiscover({storyType:'short_story',platform:'fanqie',storyCategory:'都市日常',pov:JSON.stringify(['第一人称','第三人称限知'])}),
 controller.ideaDiscover({storyType:'short_story',platform:'fanqie',storyCategory:'都市日常',pov:JSON.stringify(['第一人称','第三人称全知'])})]);
 expect(controller.runIdeaDiscovery).toHaveBeenCalledTimes(2);
});

it('sends full standards only for actual reviewed cards while preserving all reference story comparison fields',async()=>{
 const c=Object.create(ChainController.prototype) as any;let captured='';const stop=Error('local prompt capture');
 c.llmCallWithRetry=vi.fn(async(_label:string,prompt:string)=>{captured=prompt;throw stop;});
 const actual={title:'当场揭穿真假凭证',storyType:'short_story',targetPlatform:'fanqie',storyCategory:'悬疑',hook:'紧迫人物选择',coreConflict:'双方真实利益冲突',description:'主角行动引发后果',mainReversal:'新条件改变胜负',setting:'同一能力与代价边界',ending:'原条件兑现',protagonist:'既有人物',scopeBreakdown:[{arc:'完整阶段',outcome:'独立比较需保留的结果'}],storyTone:['紧张'],pov:'第一人称'};
 const reference={...actual,title:'另一个已通过故事',description:'不可删除的参考卡因果行动全文',ending:'不可删除的参考结局全文'};
 await expect(c.reviewIdeaPresentation([actual],[reference],'',{remaining:5})).rejects.toBe(stop);
 const packed=JSON.parse(captured.split('【实际题材卡与已通过参考卡】')[1].split('\n若存在standardLines')[0]);
 expect(packed.cards[0].executionStandard||packed.cards[0].executionStandardRefs).toBeTruthy();
 expect(packed.references[0]).not.toHaveProperty('executionStandard');expect(packed.references[0]).not.toHaveProperty('executionStandardRefs');expect(packed.references[0]).not.toHaveProperty('lockedPremise');
 for(const key of ['hook','coreConflict','description','mainReversal','setting','ending','protagonist','scopeBreakdown','storyCategory','storyTone','pov'])expect(packed.references[0][key]).toEqual((reference as any)[key]);
});
