import { describe, expect, it } from 'vitest';
import { IdeaLabService } from './idea-lab.service';

const service = new IdeaLabService({} as any, {} as any, {} as any) as any;

describe('IdeaLabService evidence-based maturity', () => {
  it('scores only satisfied checks and never grants a fixed starting score', () => {
    const row = { project_type: 'short_story', target_platform: 'generic', target_words: 0 };
    const report = service.computeMaturityReport({
      oneLineHook: '一个足够清晰且可核验的一句话钩子',
      protagonist: '',
      coreConflict: '',
      sellingPoints: [],
      platformFit: '',
      shortStoryFit: '',
    }, row);

    expect(report).toMatchObject({ evaluatedItems: 8, satisfiedItems: 1, canConvertToProject: false });
    expect(service.computeMaturityScore(report)).toBe(13);
  });

  it('allows conversion only when every applicable check has evidence', () => {
    const row = { project_type: 'long_novel', target_platform: 'fanqie', target_words: 2_000_000 };
    const report = service.computeMaturityReport({
      oneLineHook: '调查员发现失踪案都指向一座不存在的旧车站',
      protagonist: '林川，拒绝接受未经验证结论的调查员',
      coreConflict: '林川必须在秩序封锁前证明旧车站循环真实存在',
      sellingPoints: ['可验证线索链', '人物选择改变调查方向'],
      platformFit: '以连续冲突和章节钩子适配番茄长篇阅读节奏',
      longNovelFit: '多卷调查推进、人物关系变化和跨卷伏笔支持长篇展开',
      worldSeed: '旧工业城的公开地图与地下交通档案相互矛盾',
    }, row);

    expect(report).toMatchObject({ evaluatedItems: 7, satisfiedItems: 7, canConvertToProject: true });
    expect(service.computeMaturityScore(report)).toBe(100);
  });
});
