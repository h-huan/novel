import { describe, expect, it, vi } from 'vitest';
import { StateExtractionService } from './state-extraction.service';

describe('StateExtractionService structured extraction', () => {
  const createService = (content: string) => new StateExtractionService(
    {} as any,
    {} as any,
    {} as any,
    { generate: vi.fn().mockResolvedValue({ content, model: 'deepseek', latency: 1 }) } as any,
  ) as any;

  it('normalizes LLM foreshadowing mentions', async () => {
    const service = createService(JSON.stringify({
      mentions: [
        { id: 'fs-1', status: 'recovered', reason: '本章兑现暗线', recoveryMethod: '公开真相' },
        { id: 'unknown', status: 'active', reason: '不应采信' },
      ],
    }));

    const result = await service.extractForeshadowingWithLLM('正文', [
      { id: 'fs-1', description: '暗线', type: 'hint' },
    ]);

    expect(result).toEqual([
      { id: 'fs-1', status: 'recovered', reason: '本章兑现暗线', recoveryMethod: '公开真相' },
    ]);
  });

  it('normalizes LLM plot extraction', async () => {
    const service = createService(JSON.stringify({
      activeConflicts: ['军费短缺'],
      resolvedConflicts: ['码头冲突'],
      mainGoalProgress: 37.6,
      subGoalProgress: { 整军: '完成第一步' },
      emotionalBeat: 'rising',
      emotionalIntensity: 8,
      pacingScore: 7,
      turningPoints: ['主角拿到关键账册'],
    }));

    const result = await service.extractPlotWithLLM('正文', '前情');

    expect(result).toMatchObject({
      activeConflicts: ['军费短缺'],
      resolvedConflicts: ['码头冲突'],
      mainGoalProgress: 38,
      subGoalProgress: { 整军: '完成第一步' },
      emotionalBeat: 'rising',
      emotionalIntensity: 8,
      pacingScore: 7,
      turningPoints: ['主角拿到关键账册'],
    });
  });
});
