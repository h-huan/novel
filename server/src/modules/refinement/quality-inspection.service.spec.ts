/**
 * QualityInspectionService unit tests.
 *
 * Important boundary: deterministic AI fingerprints are heuristic risk signals only.
 * They must never be promoted into fabricated semantic quality scores.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { QualityInspectionService } from './quality-inspection.service';

describe('QualityInspectionService', () => {
  let service: QualityInspectionService;

  beforeEach(() => {
    service = new QualityInspectionService();
  });

  describe('semantic evidence boundary', () => {
    it('does not invent timeline, causality, character or foreshadowing conclusions without semantic evidence', () => {
      expect(service.checkLogic('三天后，他回到了家。第二天，他又出发了。')).toEqual([]);
      expect(service.checkCharacterDrift(
        '他二话不说就冲上去打人了。',
        { characters: [{ name: '陆川', traits: ['冷静', '理性'] }] },
      )).toEqual([]);
      expect(service.checkForeshadowing(
        '剧情继续发展。',
        { foreshadowingClues: ['房间里有一把刀'] },
      )).toEqual([]);
    });

    it('keeps semantic dimensions and overall score unevaluated', () => {
      const result = service.inspect('这是一段不足以支撑语义质量结论的章节内容。');
      expect(result.overallScore).toBeNull();
      expect(result.evaluation.status).toBe('not_evaluated');
      expect(result.dimensions.openingHook).toBeNull();
      expect(result.dimensions.characterMotivation).toBeNull();
      expect(result.dimensions.aiTraceIndex).toBeNull();
    });
  });

  describe('deterministic AI fingerprint regression', () => {
    const lowTemplateSample = `
凌晨四点十七分，值班室电话响了两声就断。周诚把登记簿合上，先看门，再看墙上的监控钟。走廊尽头那盏灯没亮，昨晚换过的灯泡还在纸箱里。

“谁打的？”小杜从折叠床上坐起来。

“分机七码。”周诚翻到昨天的维修单，“这层只有六个分机。”

小杜披上外套，鞋带系到一半又停住。门外传来拖车轮子的摩擦声，慢，断一下，再慢。两人没有出声。周诚抽出抽屉里的备用钥匙，把七码写在便签背面，又把便签压进登记簿。

门缝下先出现一条窄影，随后是一张折过三次的报修单。纸上没有姓名，只写着机房温度过高，落款处盖了旧章。那个章上个月已经作废。

“我去机房，你守电话。”周诚说。

小杜抓住他的袖口：“旧章在档案柜，昨晚是你锁的。”

周诚低头看了一眼那张报修单，没有回答。他把备用钥匙放回抽屉，改拿档案柜钥匙。走廊里的拖车声停在门外，电话第三次响起，这次没有断。
`.trim();

    const highTemplateSample = `
夜色仿佛凝固了，黑暗仿佛张开大嘴吞噬一切。林川的心跳漏了一拍，喉咙发紧，手心冒汗，一股寒意顺着脊背往上爬。这一刻，他突然意识到，眼前的一切不像梦。

与此同时，他感到一种难以言喻的情绪涌上心头。空气似乎凝固，时间仿佛停止，世界好像静止。那一瞬间，他的眼里闪过一丝复杂的情绪，内心深处不禁油然而生一种强烈的感觉。

然而，事情并没有结束。因此，他觉得自己必须继续前进。不仅为了自己，而且为了所有人。与此同时，远处的声音仿佛被黑暗吞没，冷风贴着皮肤向上爬，白光在眼前炸开。

这一刻，他终于明白了生命的意义，也意识到真正重要的东西。总而言之，这不仅是一场选择，而且是一场成长。综上所述，所有经历都让他明白：只有勇敢面对，才能走向真正的未来。
`.trim();

    it('separates template-heavy prose from a concrete scene by a meaningful margin', () => {
      const low = service.detectAiFingerprints(lowTemplateSample);
      const high = service.detectAiFingerprints(highTemplateSample);

      expect(low.overallScore).not.toBeNull();
      expect(high.overallScore).not.toBeNull();
      expect(high.overallScore!).toBeGreaterThan(low.overallScore! + 15);
      expect(high.aiWordDensity.count).toBeGreaterThanOrEqual(10);
      expect(high.clicheExpression.count).toBeGreaterThanOrEqual(4);
      expect(high.aiWordDensity.count).toBeGreaterThan(low.aiWordDensity.count);
      expect(high.clicheExpression.count).toBeGreaterThan(low.clicheExpression.count);
    });

    it('exposes the fingerprint only as heuristic evidence, never as semantic overallScore', () => {
      const result = service.inspect(highTemplateSample);
      expect(result.overallScore).toBeNull();
      expect(result.evaluation.status).toBe('partial');
      expect(result.dimensions.aiTraceIndex).toBeGreaterThan(0);
      expect(result.dimensionEvidence.aiTraceIndex.status).toBe('heuristic');
      expect(result.dimensions.openingHook).toBeNull();
      expect(result.dimensionEvidence.openingHook.status).toBe('not_evaluated');
    });

    it('does not score tiny snippets as AI evidence', () => {
      const result = service.detectAiFingerprints('仿佛什么都没有发生。');
      expect(result.overallScore).toBeNull();
      const inspected = service.inspect('仿佛什么都没有发生。');
      expect(inspected.dimensions.aiTraceIndex).toBeNull();
      expect(inspected.evaluation.status).toBe('not_evaluated');
    });
  });

  describe('dimension contract', () => {
    it('returns all declared dimensions and numeric AI risk only when enough text exists', () => {
      const shortDimensions = service.scoreDimensions('测试内容');
      expect(shortDimensions).toHaveProperty('openingHook');
      expect(shortDimensions).toHaveProperty('passion');
      expect(shortDimensions).toHaveProperty('aiTraceIndex');
      expect(shortDimensions.aiTraceIndex).toBeNull();

      const longText = '门外有人敲了三下。'.repeat(40);
      const longDimensions = service.scoreDimensions(longText);
      expect(typeof longDimensions.aiTraceIndex).toBe('number');
      expect(longDimensions.aiTraceIndex!).toBeGreaterThanOrEqual(0);
      expect(longDimensions.aiTraceIndex!).toBeLessThanOrEqual(100);
    });
  });
});
