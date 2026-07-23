import { describe, expect, it, vi } from 'vitest';
import { ChainController } from './chain.controller';

describe('configured long novel planning acceptance', () => {
  it('dynamically plans enough 3200-4000 word chapters for two million words and uses token configuration only as batch size', async () => {
    const controller: any = Object.create(ChainController.prototype);
    controller.chainTemplate = {
      executeChain: vi.fn(async () => ({ outputs: { node_1_foundation: {
        coreSetting: { title: '长篇验证', coreConflict: '真相与秩序冲突' },
        worldview: { geography: [{ name: '北城', description: '旧工业城' }], factions: [{ name: '守夜局', description: '调查组织' }] },
        skeletonVolumes: [
          { volumeNumber: 1, title: '追查卷', theme: '追查', description: '找到入口', estimatedChapters: 251, chapterCountReason: '调查链包含建立、误判、升级与阶段揭示，需要251个独立事件节点' },
          { volumeNumber: 2, title: '兑现卷', theme: '兑现', description: '完成回收', estimatedChapters: 250, chapterCountReason: '真相推进、关系决裂和伏笔回收形成250个不可合并节点' },
        ],
      } } })),
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
        title: `第${start + index}章`, targetWords: start + index === 501 ? 4000 : 3992, wordCountReason: index % 2 ? '双场景冲突升级需要完整铺陈' : '证据发现与人物选择需要完整因果链', content: `第${start + index}章的具体事件链和结果`, chapterFunction: index % 2 ? 'rising' : 'conflict',
        scenes: ['现场', '值班室'], characterActions: '调查', conflict: '阻止与追查', highlight: '证据反转',
        foreshadowings: [{ content: `线索${start + index}`, type: 'clue', action: '埋设', recoveryChapter: Math.min(501, start + index + 2), recoveryWindowStart: Math.min(501, start + index + 1), recoveryWindowEnd: Math.min(501, start + index + 2), evidenceText: `现场证据${start + index}`, riskLevel: 'medium', recoveryCondition: '再次见到证人', payoffDescription: '推进真相' }],
        hook: '门后传来旧称呼', timelineEvent: { title: `事件${start + index}`, description: '调查推进' },
      })) }, rawContent: '', warnings: [], usage: { promptTokens: 500, completionTokens: count * 600, totalTokens: 500 + count * 600 } };
    });

    const result = await controller.generateConfiguredLongNovelPlan({
      title: '长篇验证', storySetting: '调查员追查旧站循环', targetWords: 2_000_000,
      targetWanZi: 200, genre: '悬疑', chapterWordMin: 3200, chapterWordMax: 4000, onProgress: vi.fn(),
    });

    const chapters = result.volumes.flatMap((volume: any) => volume.chapters);
    expect(chapters).toHaveLength(501);
    expect(result.volumes.map((volume: any) => volume.chapters.length)).toEqual([251, 250]);
    expect(result.volumes[1].chapters.at(-1).chapterNumber).toBe(501);
    expect(chapters.every((chapter: any) => chapter.targetWords >= 3200 && chapter.targetWords <= 4000 && chapter.wordCountReason)).toBe(true);
    expect(chapters.reduce((sum: number, chapter: any) => sum + chapter.targetWords, 0)).toBe(2_000_000);
    expect(result.timeline).toHaveLength(501);
    expect(outlineCalls).toHaveLength(251);
    expect(outlineCalls[0]).toContain('1-1');
    expect(controller.realLLM.getConfiguredMaxTokens).toHaveBeenCalledWith('outline');
  });
});
