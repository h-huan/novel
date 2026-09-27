/**
 * 分类体量判据（category-word-scale）守卫。
 *
 * 这份判据前后端只有这一份：前端 targetWordsBlockingReason、创建入口、生成入口、质量 Gate 都调它。
 * 它最怕两件事：
 *  1) 「口径不适用」被当成「不达标」—— 番茄实测来自【连载长篇】榜单，套到短篇上会让每一本合规短篇
 *     在生成末尾被判未达标准；而分类体量是项目卡片级问题，正文精修永远改不动它，每章白烧一次 LLM 调用；
 *  2) 「口径不适用」被静默放行 —— 不产出判据可以，但必须如实写明原因。
 * 本文件把这两条钉死，并钉住「成稿单元漏传即从严」这条防漏传口径。
 */
import { describe, it, expect } from 'vitest';
import {
  CATEGORY_WORD_SCALE_DEVIATION_MIN_CHARS,
  categoryWordScaleBlocked,
  categoryWordScaleLine,
  categoryWordScaleStanding,
  platformCategoryMetric,
  platformCategoryMetricTable,
} from '../../../shared/src';

// 真实取数：番茄「男频·都市日常」。用例一律对着这份数据算，不把 min/median/max 抄成常量 ——
// 采集刷新时不该因为数字变了而失败，该失败的是「规则变了」。
const fanqieLongNovel = platformCategoryMetric('fanqie', '男频', '都市日常');

function input(partial: Record<string, unknown>) {
  return { targetPlatform: 'fanqie', category: '都市日常', targetAudience: '男频', ...partial };
}

describe('categoryWordScaleStanding：先确认口径适不适用于本项目的成稿单元', () => {
  it('番茄那份实测的口径是连载长篇（本组用例的根因）', () => {
    expect(fanqieLongNovel).not.toBeNull();
    expect(platformCategoryMetricTable('fanqie')?.measureUnit).toBe('long_novel');
    expect(platformCategoryMetricTable('qidian')).toBeNull();
  });

  it('短篇：口径不符就不产出判据，并如实写明原因，绝不拿长篇区间当短篇标准', () => {
    const standing = categoryWordScaleStanding(input({ projectType: 'short_story', targetWords: 20000 }));

    expect(standing.status).toBe('no_metric');
    expect(standing.measureUnit).toBe('long_novel');
    expect(standing.metric).toBeNull();
    expect(standing.unitMismatch).toContain('短篇');
    expect(standing.unitMismatch).toContain('连载长篇');
    // 放行：短篇合规与否不由这份长篇口径判定。
    expect(categoryWordScaleBlocked(standing)).toBe(false);
  });

  it('短篇即便写着长篇量级的字数，也不得被长篇口径判为未达标', () => {
    const standing = categoryWordScaleStanding(input({ projectType: 'short_story', targetWords: 1200000 }));
    expect(standing.status).toBe('no_metric');
    expect(categoryWordScaleBlocked(standing)).toBe(false);
  });

  it('口径不符的原因必须出现在执行标准说明书里，不许静默', () => {
    const standing = categoryWordScaleStanding(input({ projectType: 'short_story', targetWords: 20000 }));
    const line = categoryWordScaleLine(standing);
    expect(line.startsWith('；')).toBe(true);
    expect(line).toContain('不得拿连载长篇的区间当短篇的标准');
  });

  it('长篇：字数低于实测区间 -> out_of_range 且阻断（真实未达标准，不是误判）', () => {
    const standing = categoryWordScaleStanding(input({ projectType: 'long_novel', targetWords: 120000 }));

    expect(standing.metric).not.toBeNull();
    expect(120000).toBeLessThan(standing.metric!.min);
    expect(standing.status).toBe('out_of_range');
    expect(standing.unitMismatch).toBeNull();
    expect(standing.measureUnit).toBe('long_novel');
    expect(standing.resolved?.channel).toBe('男频');
    expect(standing.resolved?.platformGroup).toBe('都市日常');
    expect(categoryWordScaleBlocked(standing)).toBe(true);
  });

  it('长篇：字数落在实测区间内 -> within，不阻断', () => {
    const standing = categoryWordScaleStanding(input({ projectType: 'long_novel', targetWords: fanqieLongNovel!.median }));
    expect(standing.status).toBe('within');
    expect(categoryWordScaleBlocked(standing)).toBe(false);
  });

  it('长篇：未设定目标总字数 -> unset 且阻断（空值不是「不适用」）', () => {
    for (const targetWords of ['', 0, null]) {
      const standing = categoryWordScaleStanding(input({ projectType: 'long_novel', targetWords }));
      expect(standing.status).toBe('unset');
      expect(categoryWordScaleBlocked(standing)).toBe(true);
    }
  });

  it('成稿单元漏传时按「未知即从严」：继续用本表口径判定，不静默通过', () => {
    const standing = categoryWordScaleStanding(input({ targetWords: 120000 }));
    expect(standing.status).toBe('out_of_range');
    expect(categoryWordScaleBlocked(standing)).toBe(true);
  });

  it('取舍依据不够长就不算说明：差一个字仍是 out_of_range', () => {
    const tooShort = '一二三四五六七八九';
    expect(tooShort.length).toBe(CATEGORY_WORD_SCALE_DEVIATION_MIN_CHARS - 1);

    const standing = categoryWordScaleStanding(input({
      projectType: 'long_novel',
      targetWords: 120000,
      categoryWordScaleDeviation: tooShort,
    }));
    expect(standing.status).toBe('out_of_range');
    expect(categoryWordScaleBlocked(standing)).toBe(true);
  });

  it('取舍依据达到阈值即 deviation_declared：执行标准自己给出的合规路径必须被认', () => {
    const deviation = '本项目刻意写 12 万字，按短平快节奏取舍，不与头部体量对齐';
    const standing = categoryWordScaleStanding(input({
      projectType: 'long_novel',
      targetWords: 120000,
      categoryWordScaleDeviation: deviation,
    }));

    expect(standing.status).toBe('deviation_declared');
    expect(categoryWordScaleBlocked(standing)).toBe(false);
    expect(standing.deviation).toBe(deviation);
  });

  it('未采集口径的平台/分类：不产出判据也不阻断，更不得借别的分类顶上', () => {
    const otherPlatform = categoryWordScaleStanding(input({
      targetPlatform: 'qidian',
      category: '都市日常',
      projectType: 'long_novel',
      targetWords: 120000,
    }));
    expect(otherPlatform.status).toBe('no_metric');
    expect(otherPlatform.metric).toBeNull();
    expect(otherPlatform.unitMismatch).toBeNull();
    expect(otherPlatform.measureUnit).toBeNull();
    expect(categoryWordScaleBlocked(otherPlatform)).toBe(false);
    expect(categoryWordScaleLine(otherPlatform)).toBe('');

    const noCategory = categoryWordScaleStanding(input({ category: '', projectType: 'long_novel', targetWords: 120000 }));
    expect(noCategory.status).toBe('no_metric');
    expect(categoryWordScaleBlocked(noCategory)).toBe(false);
  });
});