import { describe, expect, it } from 'vitest';
import { ChainController } from './chain.controller';

const controller = () => Object.create(ChainController.prototype) as any;

describe('first-pass scene plan parsing', () => {
  it('parses the current prose context scene block', () => {
    const prompt = [
      '## 不可偏离的详细大纲',
      '【本章事件骨架】第一夜（功能：opening）',
      '场景顺序（按顺序写；场景篇幅按冲突强度和信息量自然分配）：',
      '场景1：地点=化妆间；目标=净面；阻碍=手攥得死紧；结果=从手心发现耳机',
      '场景2：地点=值班室；目标=查登记簿；阻碍=老周回来；结果=记住三页签字',
      '人物行动与结果：我：净面→发现耳机',
    ].join('\n');
    expect(controller().firstPassScenePlan(prompt)).toEqual([
      { index: 1, location: '化妆间', goal: '净面', conflict: '手攥得死紧', outcome: '从手心发现耳机', beats: [] },
      { index: 2, location: '值班室', goal: '查登记簿', conflict: '老周回来', outcome: '记住三页签字', beats: [] },
    ]);
  });

  it('still parses the older scene-list marker', () => {
    const prompt = '场景列表（按顺序逐场展开）：\n场景1：地点=走廊；目标=交接；阻碍=没人应；结果=听见推车声\n【下一段】';
    expect(controller().firstPassScenePlan(prompt)).toEqual([
      { index: 1, location: '走廊', goal: '交接', conflict: '没人应', outcome: '听见推车声', beats: [] },
    ]);
  });

  it('parses the scene block produced by the real generation-context builder', async () => {
    const outline = {
      order: 0, title: '第一夜', chapter_function: 'opening', target_words: 4100,
      content: '她从手心发现耳机，随后去值班室看登记簿。',
      scenes: JSON.stringify({
        scenes: [
          { location: '化妆间', goal: '净面', conflict: '手攥得死紧', outcome: '从手心发现耳机',
            beats: ['我→净面→手攥紧→发现耳机', '我→想上交→老周不在→决定留下'] },
          { location: '值班室', goal: '查登记簿', conflict: '老周回来', outcome: '记住三页签字',
            beats: ['我→送净面单→老周低头核对→看清签字', '我→记签字→老周抬头→没敢问'] },
        ],
        characterActions: [], conflicts: [], foreshadowing: [], foreshadowingRecover: [],
        responsibilityContract: { threads: ['耳机与三页签字'] },
      }),
    };
    const text = await controller().buildChapterOutlineGenerationContext(outline);
    expect(controller().firstPassScenePlan(text)).toEqual([
      { index: 1, location: '化妆间', goal: '净面', conflict: '手攥得死紧', outcome: '从手心发现耳机',
        beats: ['我→净面→手攥紧→发现耳机', '我→想上交→老周不在→决定留下'] },
      { index: 2, location: '值班室', goal: '查登记簿', conflict: '老周回来', outcome: '记住三页签字',
        beats: ['我→送净面单→老周低头核对→看清签字', '我→记签字→老周抬头→没敢问'] },
    ]);
  });

  it('builds a scene-coverage contract with every location and a per-scene floor', () => {
    const scenes = [
      { index: 1, location: '化妆间', goal: '净面', conflict: '手攥紧', outcome: '发现耳机', beats: ['我→净面→手攥紧→发现耳机'] },
      { index: 2, location: '值班室', goal: '查单', conflict: '老周回来', outcome: '记住三页', beats: ['我→查单→老周回来→记住三页'] },
      { index: 3, location: '走廊', goal: '交接', conflict: '没人应', outcome: '听见推车声', beats: ['我→交接→没人应→听见推车声'] },
    ];
    const text = controller().firstPassSceneCoverage(scenes, 4100, 3600);
    expect(text).toContain('本章共 3 场');
    for (const scene of scenes) expect(text).toContain(scene.location);
    expect(text).toContain('每场目标约 1367 字');
    expect(text).toContain('单场不得少于 1161 字');
    expect(text).toContain('少于 3 场或全文少于 3600 字均视为未完成');
    expect(text).toContain('节拍：我→净面→手攥紧→发现耳机');
    expect(text).toContain('每场至少一次人物反应、关系变化或处境变化');
  });

  it('rejects a language repair candidate that shrinks below the chapter floor', () => {
    const c = controller();
    c.generatedNarrativeWordCount = (content: string) => content.length;
    expect(c.isRepairCandidateLengthAcceptable('x'.repeat(3500), 4000)).toBe(true);
    expect(c.isRepairCandidateLengthAcceptable('x'.repeat(3499), 4000)).toBe(false);
    expect(c.isRepairCandidateLengthAcceptable('x'.repeat(2500), 3000)).toBe(true);
  });
});
