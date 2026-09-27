/**
 * 执行标准「操作定义」唯一来源守卫（文风 / 基调）。
 *
 * 为什么要有这道守卫：执行标准维度（平台/分类/基调/文风/流派/视角）里，只有【基调和文风】两维
 * 需要「标签 → 怎么落笔」的翻译层。历史上这层翻译被抄成多份（写作页文案一份、生成侧没有、
 * 硬线扫描器正则一份），结果是用户选了「白描/朴素」，生成侧只拿到一个词，质检也无从判定 ——
 * 「设置了不生效」。守卫把三处钉在同一份 key 上，任何一处新增/更名而漏改其余，测试直接红。
 *
 * 这里的断言只钉「一致性」与「非空」，不钉具体文案 —— 文案可继续打磨，
 * 但 key 集合必须与字典种子、共享常量完全一致，且不得出现点名作者/作品（去书籍污染口径）。
 */
import { describe, expect, it } from 'vitest';
import {
  dimensionGuide,
  dimensionGuidesText,
  STORY_TONE_SEED_LABELS,
  STYLE_GUIDES,
  STYLE_PUNCTUATION_RELAX_KEYWORDS,
  TONE_GUIDES,
  WRITING_STYLE_SEED_LABELS,
} from '../../../shared/src';
import { STORY_DICT_SEEDS } from '../story-dict/story-dict.service';

const dictLabels = (type: string) => STORY_DICT_SEEDS.filter((seed) => seed.type === type).map((seed) => seed.label);

describe('执行标准 · 操作定义唯一来源（文风/基调）', () => {
  it('文风：字典种子 = 共享常量 = 操作定义 key，三方逐值一致', () => {
    expect(dictLabels('writing_style')).toEqual([...WRITING_STYLE_SEED_LABELS]);
    expect(Object.keys(STYLE_GUIDES).sort()).toEqual([...WRITING_STYLE_SEED_LABELS].sort());
  });

  it('情绪氛围：新候选逐值有操作定义，旧项目的六项原基调仍能执行', () => {
    expect(dictLabels('tone_tag')).toEqual([...STORY_TONE_SEED_LABELS]);
    for (const label of STORY_TONE_SEED_LABELS) expect(TONE_GUIDES[label]).toBeTruthy();
    // 这里曾要求种子与 guide key 完全相等，后果是清理错位候选时会删掉旧书仍在执行的规则。
    const legacyOnly = Object.keys(TONE_GUIDES).filter(label => !STORY_TONE_SEED_LABELS.includes(label as any));
    expect(legacyOnly.sort()).toEqual(['爽文', '权谋', '无敌', '逆袭', '刀人', '女强'].sort());
  });

  it('每条操作定义都非空，且不点名具体作品或作者（去书籍污染）', () => {
    for (const [label, guide] of [...Object.entries(STYLE_GUIDES), ...Object.entries(TONE_GUIDES)]) {
      expect(guide.trim().length, label).toBeGreaterThan(8);
      expect(guide, label).not.toMatch(/参考|模仿|《|》/);
    }
  });

  it('标点宽松关键词表与执行标准同源，且覆盖克制型文风', () => {
    const pattern = new RegExp([...STYLE_PUNCTUATION_RELAX_KEYWORDS].join('|'));
    expect(pattern.test('白描/朴素')).toBe(true);
    expect(pattern.test('群像叙事')).toBe(true);
    expect(pattern.test('热血、系统流、第三人称限知')).toBe(false);
  });

  it('未收录的自建标签如实返回空定义：不编造，也不套用别的标签', () => {
    expect(dimensionGuide('style', '自建文风')).toBe('');
    expect(dimensionGuide('tone', '自建基调')).toBe('');
    expect(dimensionGuidesText('tone', ['自建基调'])).toBe('');
    expect(dimensionGuidesText('style', ['自建文风', '白描/朴素'])).toContain('白描/朴素：');
    expect(dimensionGuidesText('style', ['自建文风', '白描/朴素'])).not.toContain('自建文风：');
  });
});
