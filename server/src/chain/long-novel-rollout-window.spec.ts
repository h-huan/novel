import { describe, expect, it, vi } from 'vitest';
import { ChainController } from './chain.controller';

function fixture(writtenMax: number) {
  const controller = Object.create(ChainController.prototype) as any;
  const inserts: string[] = [];
  const detailRows = Array.from({ length: 20 }, (_, order) => ({ order }));
  const volumeRows = [{
    id: 'volume-1', title: '起势卷', content: '主线逐步推进', order: 0,
    volumes: JSON.stringify({ estimatedChapters: 60, theme: '追查', goal: '识别真相' }),
  }];
  const db = {
    prepare: (sql: string) => ({
      get: () => sql.includes('FROM projects')
        ? { title: '长篇测试', type: 'long_novel', target_words: 240000, target_platform: 'fanqie', settings: '{}' }
        : sql.includes('COALESCE(MAX(chapter_index),0)')
          ? { m: writtenMax }
          : undefined,
      all: () => sql.includes("level='volume'") ? volumeRows
        : sql.includes("level='chapter'") ? detailRows
          : [],
      run: () => { inserts.push(sql); return {}; },
    }),
  };
  controller.db = { getDb: () => db };
  controller.logger = { log: vi.fn() };
  controller.resolvePlatformToneDirective = () => '项目已确认创作标准';
  controller.generatedCanonGuard = { assertStructuredCanCommit: vi.fn() };
  controller.llmCallWithRetry = vi.fn(async (_step: string, prompt: string) => {
    const match = /本批范围：本卷第\d+-\d+章，即全书第(\d+)-(\d+)章，共(\d+)章/.exec(prompt);
    if (!match) throw Error('没有按卷传入合法滚动批次');
    const start = Number(match[1]);
    const count = Number(match[3]);
    return {
      data: { chapters: Array.from({ length: count }, (_, i) => ({
        title: `第${start+i}章`, content: '真实事件链：主角发现线索并决策',
        conflict: '调查遭遇拒绝', hook: '门外有人敲门',
        scenes: ['值班室'], targetWords: 4000,
        wordCountReason: '调查与选择需要两个有效场景', chapterFunction: 'conflict',
      })) },
      runId: 'reviewed-outline-run',
    };
  });
  return { controller, inserts };
}

describe('ARCH-004 progressive outline window', () => {
  it.each([0, 1, 6, 14])('does not pay for new outlines when 20 exist and only %i chapters are written', async writtenMax => {
    const { controller, inserts } = fixture(writtenMax);
    const result = await controller.rolloutDetailedOutlines('project');
    expect(result.added).toBe(0);
    expect(result.detailedTotal).toBe(20);
    expect(controller.llmCallWithRetry).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
  });

  it('refills in bounded batches only after written progress reaches the existing trigger', async () => {
    const { controller, inserts } = fixture(15);
    const result = await controller.rolloutDetailedOutlines('project');
    expect(result).toMatchObject({ added: 15, target: 35, totalEstimated: 60 });
    expect(controller.llmCallWithRetry).toHaveBeenCalledTimes(4);
    expect(controller.generatedCanonGuard.assertStructuredCanCommit).toHaveBeenCalledTimes(4);
    expect(inserts.filter(sql => sql.includes('INSERT INTO outlines'))).toHaveLength(15);
    expect(inserts.filter(sql => sql.includes('INSERT INTO chapters'))).toHaveLength(15);
    expect(inserts.filter(sql => sql.includes('UPDATE chapters'))).toHaveLength(0);
  });
});
