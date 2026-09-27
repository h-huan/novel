import { describe, it, expect } from 'vitest';
import {
  STORY_DICT_SEEDS,
  STORY_DICT_SEED_VERSION,
  storyDictKey,
  findDuplicateSeedLabels,
} from './story-dict.service';
import { GLOBAL_STORY_CATEGORIES, NARRATIVE_POV_SEED_LABELS, PLOT_TAG_SEED_LABELS } from '../../../shared/src';

/**
 * 有意保留的「基调词 = 题材子类同名」冻结清单。
 *
 * 平台本身就在两处都用同一个词：悬疑（题材栏 / 情绪栏）、甜宠·虐恋（言情子类 / 情绪基调）。
 * 这是有意为之，不是重复定义。冻结成显式清单后，任何新增同名都会让本测试失败，
 * 从而把「无声漂移」逼成必须显式登记的决策。
 */
const SHARED_SUBCATEGORY_TONE_LABELS = ['悬疑', '甜宠', '虐恋'];

const povs = STORY_DICT_SEEDS.filter(s => s.type === 'narrative_pov');
const subcategories = STORY_DICT_SEEDS.filter(s => s.type === 'story_subcategory');
const categories = STORY_DICT_SEEDS.filter(s => s.type === 'story_category');
const genres = STORY_DICT_SEEDS.filter(s => s.type === 'web_novel_genre');
const tones = STORY_DICT_SEEDS.filter(s => s.type === 'tone_tag');
const plots = STORY_DICT_SEEDS.filter(s => s.type === 'plot_tag');

describe('执行标准种子（story_dict）不变量', () => {
  it('情节取向候选由共享定义进入可管理字典', () => {
    expect(plots.map(item => item.label)).toEqual([...PLOT_TAG_SEED_LABELS]);
  });

  it('情绪氛围不再混入逆袭、权谋等情节取向', () => {
    const toneLabels = new Set(tones.map(item => item.label));
    for (const label of ['逆袭', '权谋', '无敌', '女强', '刀人', '爽文']) {
      expect(toneLabels.has(label)).toBe(false);
    }
    expect(plots.map(item => item.label)).toContain('逆袭');
    expect(plots.map(item => item.label)).toContain('权谋');
  });
  it('种子版本号是正整数：改 seed 必须递增，便于在 _migrations 里核对同步真的跑过', () => {
    expect(Number.isInteger(STORY_DICT_SEED_VERSION)).toBe(true);
    expect(STORY_DICT_SEED_VERSION).toBeGreaterThan(0);
  });

  it('同一维度内 label 不重复（重复会让 upsert 静默改挂父级：娱乐圈 事故）', () => {
    expect(findDuplicateSeedLabels(STORY_DICT_SEEDS)).toEqual([]);
    const keys = STORY_DICT_SEEDS.map(s => storyDictKey(s.type, s.label));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('story_category 恰好等于共享的 9 大全局题材（不允许第二份清单）', () => {
    expect(categories.map(c => c.label)).toEqual([...GLOBAL_STORY_CATEGORIES]);
  });

  it('narrative_pov 恰好等于共享的视角清单（视角曾经有 3 份副本：种子 + 前端 2 处内联）', () => {
    expect(povs.map(p => p.label)).toEqual([...NARRATIVE_POV_SEED_LABELS]);
  });

  it('每个 story_subcategory 的父级都是真实存在的全局题材', () => {
    const known = new Set<string>([...GLOBAL_STORY_CATEGORIES]);
    const orphans = subcategories
      .filter(s => !s.parent || !known.has(s.parent))
      .map(s => String(s.parent) + ' / ' + s.label);
    expect(orphans).toEqual([]);
  });

  it('每个维度的 sort_order 从 1 起连续无空洞（空位 = 曾有项被静默改挂）', () => {
    const groups = new Map<string, number[]>();
    for (const item of STORY_DICT_SEEDS) {
      const key = item.type + '|' + (item.parent ?? '');
      const bucket = groups.get(key);
      if (bucket) bucket.push(item.order);
      else groups.set(key, [item.order]);
    }
    const broken: string[] = [];
    for (const [key, orders] of groups) {
      const sorted = [...orders].sort((a, b) => a - b);
      const expected = sorted.map((_, i) => i + 1);
      if (JSON.stringify(sorted) !== JSON.stringify(expected)) {
        broken.push(key + ' -> [' + sorted.join(',') + ']');
      }
    }
    expect(broken).toEqual([]);
  });

  it('流派词一律不得再当题材子类（机制词误当题材：无敌流/凡人流/重生/穿越）', () => {
    const genreLabels = new Set(genres.map(g => g.label));
    const overlap = subcategories.filter(s => genreLabels.has(s.label)).map(s => s.label);
    expect(overlap).toEqual([]);
  });

  it('基调词与题材子类同名只允许冻结清单内的项（新增同名必须显式登记）', () => {
    const toneLabels = new Set(tones.map(t => t.label));
    const actual = subcategories
      .filter(s => toneLabels.has(s.label))
      .map(s => s.label)
      .sort();
    expect(actual).toEqual([...SHARED_SUBCATEGORY_TONE_LABELS].sort());
  });
});
