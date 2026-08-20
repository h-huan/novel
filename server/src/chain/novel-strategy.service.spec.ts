import { NovelStrategyService } from './novel-strategy.service';

describe('NovelStrategyService', () => {
  const db = { getDb: () => ({ prepare: () => ({ get: () => null, all: () => [] }) }) } as any;
  const service = new NovelStrategyService(db);

  it('keeps fanqie +爽文 high density without fixed 3-chapter clock', () => {
    const strategy = service.resolve({
      platform: 'fanqie',
      storyType: 'long_novel',
      writingStyle: ['爽文'],
      webNovelGenre: ['系统流'],
      storyTone: ['热血'],
    });

    expect(strategy.pacing).toBe('very_high');
    expect(strategy.payoffRange.min).toBeGreaterThanOrEqual(2);

    const plan = service.buildRhythmPlan([
      { title: '异常订单', func: 'opening', brief: '主角被迫接下任务' },
      { title: '第一次追查', func: 'conflict', brief: '线索指向幕后人物' },
      { title: '喘息', func: 'transition', brief: '整理线索并处理关系变化' },
      { title: '身份揭晓', func: 'climax', brief: '关键身份揭晓并形成反击' },
    ], strategy);

    expect(plan[2].role).toBe('breathing');
    expect(plan[3].role).toBe('burst');
    expect(plan[2].role).not.toBe('burst'); // 第3章不再因为章号被强制爆发
  });

  it('treats suspense reveal as reader payoff', () => {
    const strategy = service.resolve({
      platform: 'zhihu',
      writingStyle: ['悬疑'],
      storyTone: ['烧脑'],
    });
    expect(strategy.preferredPayoffs).toContain('reveal');
    expect(strategy.preferredPayoffs).toContain('reversal');
  });

  it('allows soft payoff for realistic ensemble without becoming no-progress', () => {
    const strategy = service.resolve({
      platform: 'qidian',
      storyCategory: '现实',
      writingStyle: ['白描/朴素', '群像叙事'],
    });
    expect(strategy.allowSoftPayoff).toBe(true);
    expect(strategy.payoffRange.min).toBeGreaterThanOrEqual(1);
  });

  it('unknown platform falls back to generic instead of fanqie', () => {
    expect(service.resolve({ platform: 'unknown-platform' }).platform).toBe('generic');
  });

  it('breathing chapter disables hard cadence timer', () => {
    const projectStrategy = service.resolve({ platform: 'fanqie' });
    const plan = service.buildRhythmPlan([
      { title: '大战之后', func: 'transition', brief: '处理伤势与关系变化' },
    ], projectStrategy);
    expect(plan[0].role).toBe('breathing');
  });
});
