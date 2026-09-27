import { describe, expect, it, vi } from 'vitest';
import { ChainController } from './chain.controller';

describe('configured long novel planning acceptance', () => {
  it('dynamically plans enough 3000-5000 word chapters for two million words and uses token configuration only as batch size', async () => {
    const controller: any = Object.create(ChainController.prototype);
    controller.logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    // 执行标准是生成前提：解析器要求项目行真实存在（缺行按设计抛 404，不再静默返空）。
    // 替身提供一个带完整创作宪法的长篇项目，让框架层拿到与正文层同一份执行标准。
    const projectRow = {
      type: 'long_novel',
      target_platform: 'fanqie',
      settings: JSON.stringify({
        creativeConstitution: {
          schemaVersion: 1, revision: 1, projectType: 'long_novel', targetPlatform: 'fanqie',
          category: '悬疑', pov: '第一人称', storyTone: ['紧张'], writingStyle: ['白描'],
          webNovelGenre: ['悬疑流'], targetWords: 2000000,
          platformRules: {}, chapterWordRange: { min: 3000, max: 5000 },
        },
      }),
    };
    controller.db = {
      getDb: () => ({
        prepare: vi.fn().mockImplementation((sql: string) => ({
          get: vi.fn().mockReturnValue(String(sql).includes('FROM projects') ? projectRow : undefined),
          all: vi.fn().mockReturnValue([]),
          run: vi.fn().mockReturnValue({}),
        })),
      }),
    };
    controller.chainTemplate = {
      executeChain: vi.fn(async (_name: string, _params: any, onProgress: any) => {
        const skeleton = {
        coreSetting: { title: '长篇验证', coreConflict: '真相与秩序冲突' },
        skeletonVolumes: [
          { volumeNumber: 1, title: '追查卷', theme: '追查', description: '找到入口', estimatedChapters: 251, chapterCountReason: '调查链包含建立、误判、升级与阶段揭示，需要251个独立事件节点' },
          { volumeNumber: 2, title: '兑现卷', theme: '兑现', description: '完成回收', estimatedChapters: 250, chapterCountReason: '真相推进、关系决裂和伏笔回收形成250个不可合并节点' },
        ],
        };
        onProgress?.(0, 'node_1_skeleton', 'completed', { output: skeleton });
        return { outputs: { node_1_skeleton: skeleton, node_2_worldview: {
          worldview: { geography: [{ name: '北城', description: '旧工业城' }], factions: [{ name: '守夜局', description: '调查组织' }] },
        } } };
      }),
    };
    controller.realLLM = { getConfiguredMaxTokens: vi.fn(() => 1400) };
    const outlineCalls: string[] = [];
    controller.llmCallWithRetry = vi.fn(async (step: string, prompt: string) => {
      if (step === '长篇角色架构') return { data: { characters: [{ name: '林川', identity: '调查员', arc: '从怀疑到承担' }] }, rawContent: '', warnings: [] };
      if (step === '长篇跨卷伏笔') return { data: { foreshadowings: [{ content: '旧信日期', type: 'identity', scope: 'global', setupChapter: 1, recoveryChapter: 501, recoveryWindowStart: 495, recoveryWindowEnd: 501, evidenceText: '信纸日期早于车站建成', riskLevel: 'high', recoveryCondition: '抵达终点', payoffDescription: '揭示循环' }] }, rawContent: '', warnings: [] };
      outlineCalls.push(step);
      const count = Number(prompt.match(/共(\d+)章；全书第/)?.[1]);
      const start = Number(prompt.match(/全书第(\d+)-/)?.[1]);
      return { data: { chapters: Array.from({ length: count }, (_, index) => ({
        title: `第${start + index}章`, targetWords: start + index === 501 ? 5000 : 3992, wordCountReason: index % 2 ? '双场景冲突升级需要完整铺陈' : '证据发现与人物选择需要完整因果链', content: `第${start + index}章的具体事件链和结果`, chapterFunction: index % 2 ? 'rising' : 'conflict',
        scenes: ['现场', '值班室'], characterActions: '调查', conflict: '阻止与追查', highlight: '证据反转',
        foreshadowing: [{ content: `线索${start + index}`, type: 'clue', scope: 'chapter', action: '埋设', recoveryChapter: Math.min(501, start + index + 2), recoveryWindowStart: Math.min(501, start + index + 1), recoveryWindowEnd: Math.min(501, start + index + 2), evidenceText: `现场证据${start + index}`, riskLevel: 'medium', recoveryCondition: '再次见到证人', payoffDescription: '推进真相' }],
        hook: '门后传来旧称呼', timelineEvent: { title: `事件${start + index}`, description: '调查推进' },
      })) }, rawContent: '', warnings: [], usage: { promptTokens: 500, completionTokens: count * 600, totalTokens: 500 + count * 600 } };
    });

    const result = await controller.generateConfiguredLongNovelPlan({
      projectId: 'test-project',
      title: '长篇验证', storySetting: '调查员追查旧站循环', targetWords: 2_000_000,
      targetWanZi: 200, genre: '悬疑', chapterWordMin: 3000, chapterWordMax: 5000,
      onProgress: vi.fn(),
    });

    const chapters = result.volumes.flatMap((volume: any) => volume.chapters);
    expect(chapters).toHaveLength(20);
    expect(result.volumes.map((volume: any) => volume.chapters.length)).toEqual([20, 0]);
    expect(result.volumes.map((volume: any) => volume.estimatedChapters)).toEqual([251, 250]);
    expect(chapters.every((chapter: any) => chapter.targetWords >= 3000 && chapter.targetWords <= 5000 && chapter.wordCountReason)).toBe(true);
    expect(501 * 3000).toBeLessThanOrEqual(2_000_000);
    expect(501 * 5000).toBeGreaterThanOrEqual(2_000_000);
    expect(result.timeline).toHaveLength(20);
    expect(outlineCalls).toHaveLength(11);
    expect(outlineCalls[0]).toContain('1-1');
    expect(controller.realLLM.getConfiguredMaxTokens).toHaveBeenCalledWith('outline');
  });

  // 回归：项目卡片（创作宪法）与创建前确认的题材标签必须驱动长篇的每一个环节。
  // 此前角色/章纲/伏笔三个环节只拿到平台基准与三标签，拿不到题材标签与创作宪法，
  // 与正文层执行标准不是同一份——框架与正文对不上，用户创建时选的基调/文风/标签就形同摆设。
  it('injects one shared project execution standard into foundation, characters, chapter outlines and foreshadowing', async () => {
    const controller: any = Object.create(ChainController.prototype);
    controller.logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const STANDARD = '【目标平台与风格定位 · 最高优先级】题材标签（创建前已确认）：规则怪谈、悬疑；【项目创作宪法】{"targetPlatform":"fanqie","projectType":"long_novel"}';
    controller.resolvePlatformToneDirective = vi.fn(() => STANDARD);

    let foundationParams: any = null;
    controller.chainTemplate = {
      executeChain: vi.fn(async (_name: string, params: any, onProgress: any) => {
        foundationParams = params;
        const skeleton = {
          coreSetting: { title: '标准注入验证', coreConflict: '规则与生存冲突' },
          skeletonVolumes: [
            { volumeNumber: 1, title: '入楼卷', theme: '入楼', description: '触发规则', estimatedChapters: 2, chapterCountReason: '两次独立触规事件不可合并' },
          ],
        };
        onProgress?.(0, 'node_1_skeleton', 'completed', { output: skeleton });
        return { outputs: { node_1_skeleton: skeleton, node_2_worldview: {
          worldview: { geography: [{ name: '旧楼', description: '封禁地' }], factions: [{ name: '巡查组', description: '执行者' }] },
        } } };
      }),
    };
    controller.realLLM = { getConfiguredMaxTokens: vi.fn(() => 2048) };
    const calls: Array<{ step: string; prompt: string }> = [];
    controller.llmCallWithRetry = vi.fn(async (step: string, prompt: string) => {
      calls.push({ step, prompt });
      if (step === '长篇角色架构') return { data: { characters: [{ name: '周砚', identity: '巡查员', arc: '从服从到反抗' }] }, rawContent: '', warnings: [] };
      if (step === '长篇跨卷伏笔') return { data: { foreshadowings: [] }, rawContent: '', warnings: [] };
      const count = Number(prompt.match(/共(\d+)章；全书第/)?.[1]) || 1;
      const start = Number(prompt.match(/全书第(\d+)-/)?.[1]) || 1;
      return { data: { chapters: Array.from({ length: count }, (_, index) => ({
        title: `第${start + index}章`, targetWords: 4000, wordCountReason: '单场景规则冲突需要完整因果链',
        content: `第${start + index}章的具体事件链和结果`, chapterFunction: index % 2 ? 'rising' : 'conflict',
        scenes: ['楼道'], characterActions: '巡查', conflict: '触规与制止', highlight: '规则反转',
        foreshadowing: [], hook: '门缝里有第二道影子',
        timelineEvent: { title: `事件${start + index}`, description: '规则推进' },
      })) }, rawContent: '', warnings: [] };
    });

    await controller.generateConfiguredLongNovelPlan({
      projectId: 'proj-standard',
      title: '标准注入验证', storySetting: '标准注入验证', targetWords: 8000, targetWanZi: 0.8,
      genre: '悬疑', chapterWordMin: 3000, chapterWordMax: 5000,
    });

    expect(controller.resolvePlatformToneDirective).toHaveBeenCalledWith('proj-standard');
    // 地基：统一标准进入 story_setting，且宪法不再被重复拼接第二遍
    expect(String(foundationParams.story_setting)).toContain(STANDARD);
    // 角色、章纲、伏笔三个环节此前拿不到统一标准，必须全部携带
    expect(calls.find(item => item.step === '长篇角色架构')?.prompt).toContain(STANDARD);
    expect(calls.find(item => item.step === '长篇跨卷伏笔')?.prompt).toContain(STANDARD);
    expect(calls.some(item => /^长篇第\d+卷章纲/.test(item.step) && item.prompt.includes(STANDARD))).toBe(true);
    // 回归：不存在第二份"回落口径"。此前 resolvePlatformToneDirective 返空时会另拼一份
    // 宪法+平台基准+三标签，那份必然缺分类/视角/目标读者，等于用降级标准生成地基。
    expect(String(foundationParams.story_setting)).not.toContain('【项目创作宪法 · 必须严格执行】');
    expect(String(foundationParams.story_setting)).not.toContain('【故事基调与风格 · 必须贯穿全部设定】');
  });
});
