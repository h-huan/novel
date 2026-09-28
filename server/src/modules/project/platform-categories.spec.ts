import { describe, it, expect } from 'vitest';
import {
  updateConstitution,
  categoryPlacementProblem,
  categoryPlacementMessage,
  buildExecutionStandard,
} from './creative-constitution';
import {
  GLOBAL_STORY_CATEGORIES,
  PLATFORM_CATEGORY_TREES,
  PLATFORM_CATEGORY_METRICS,
  PLATFORM_DIMENSION_BASIS_LABELS,
  categoryOptionsForPlatform,
  categoryReferenceOptionsForProject,
  describeCategoryPlacement,
  platformCategoryBenchmarkNote,
  platformCategoryDimensionBinding,
  platformCategoryMetric,
  platformCategoryOptionId,
  platformCategoryTree,
  platformCategoryTreeVerification,
  resolvePlatformCategory,
  resolveSubmissionCategory,
} from '../../../shared/src';

function constitutionOf(partial: Record<string, unknown>) {
  return updateConstitution({ settings: '{}' }, { title: 't', type: 'long_novel', ...partial });
}

describe('platform category trees are single-sourced and honest about verification', () => {
  it('marks only fanqie as confirmed; every other platform stays modeled', () => {
    const entries = Object.entries(PLATFORM_CATEGORY_TREES);
    expect(entries.map(([key]) => key)).toContain('fanqie');
    expect(entries.map(([key]) => key)).not.toContain('rules_horror');
    for (const [key, tree] of entries) {
      expect(tree.platform).toBe(key);
      expect(tree.source.length).toBeGreaterThan(20);
      if (key === 'fanqie') expect(tree.verified).toBe('confirmed');
      else expect(tree.verified).toBe('modeled');
    }
  });

  it('番茄长篇榜单核验状态不得传给短故事投稿分类', () => {
    expect(platformCategoryTreeVerification('fanqie', 'long_novel')?.verified).toBe('confirmed');
    expect(platformCategoryTreeVerification('fanqie', 'short_story')?.verified).toBe('unit_unverified');
    expect(resolveSubmissionCategory('fanqie', '男频·都市日常', 'short_story')).toEqual({ status: 'no_tree' });
    expect(resolveSubmissionCategory('fanqie', '后台短故事分类', 'short_story')).toEqual({ status: 'no_tree' });
    const shortStory = constitutionOf({ type: 'short_story', targetPlatform: 'fanqie', category: '后台短故事分类' });
    expect(categoryPlacementProblem(shortStory)).toBeNull();
    expect(buildExecutionStandard(shortStory).dimensions.find((item) => item.dimension === 'category')?.requirement).toContain('未核验');
    const shortReferences = categoryReferenceOptionsForProject('fanqie', 'short_story');
    expect(shortReferences).toHaveLength(14);
    expect(shortReferences).toContain('女性成长');
    expect(shortReferences).not.toContain('男频·都市日常');
    expect(categoryReferenceOptionsForProject('qidian', 'long_novel').length).toBeGreaterThan(0);
  });

  it('fanqie is flat: 19 male + 18 female 投稿分类, each one its own leaf', () => {
    const tree = platformCategoryTree('fanqie')!;
    const male = tree.groups.filter(g => g.channel === '男频');
    const female = tree.groups.filter(g => g.channel === '女频');
    expect(male).toHaveLength(19);
    expect(female).toHaveLength(18);
    for (const g of tree.groups) {
      expect(g.flat).toBe(true);
      expect(g.children).toEqual([g.name]);
      expect(g.globalCategory).toBeTruthy();
    }
  });

  it('keeps at most one globalDefault per global category per channel', () => {
    const tree = platformCategoryTree('fanqie')!;
    const seen = new Set<string>();
    for (const g of tree.groups) {
      if (!g.globalDefault) continue;
      const key = g.channel + '|' + g.globalCategory;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  // 平台独有频道（globalCategory 为空）必须逐条登记，不允许悄悄留空：
  // 晋江按「情感向」而不是题材切栏，纯爱/百合/无CP/衍生是晋江的顶层频道，但它们本身不是题材
  // （各自下面仍然是古代/现代/幻想等题材），因此不能塞进 9 大题材类里冒充题材。
  // 任何新增的空归位都会让下面的测试失败 —— 空值等于执行标准没落地，必须被看见。
  const PLATFORM_ONLY_GROUPS = ['jinjiang·纯爱', 'jinjiang·百合', 'jinjiang·无CP', 'jinjiang·衍生'];

  it('execution standard: every non-null platform globalCategory comes from the 9 global story categories', () => {
    // 防再次分叉：平台分类树的归位目标、创作字典的 9 大类、项目执行标准必须只有一份事实源。
    // 任何平台新增/改名归类而忘了同步 GLOBAL_STORY_CATEGORIES（或反之）都会在这里直接炸掉。
    expect(GLOBAL_STORY_CATEGORIES.length).toBe(9);
    expect(new Set(GLOBAL_STORY_CATEGORIES).size).toBe(GLOBAL_STORY_CATEGORIES.length);
    const allowed = new Set<string>(GLOBAL_STORY_CATEGORIES);
    const unknown: string[] = [];
    for (const [platform, tree] of Object.entries(PLATFORM_CATEGORY_TREES)) {
      for (const g of tree.groups) {
        if (g.globalCategory === null) continue;
        if (!allowed.has(g.globalCategory)) unknown.push(platform + ':' + g.name + '->' + g.globalCategory);
      }
    }
    expect(unknown).toEqual([]);
  });

  it('execution standard: unmapped platform groups are an explicit, frozen list (no silent holes)', () => {
    const unmapped: string[] = [];
    for (const [platform, tree] of Object.entries(PLATFORM_CATEGORY_TREES)) {
      for (const g of tree.groups) {
        if (g.globalCategory === null) unmapped.push(platform + '·' + g.name);
      }
    }
    expect(unmapped.sort()).toEqual([...PLATFORM_ONLY_GROUPS].sort());
  });

  it('execution standard: no global story category is unreachable from every platform', () => {
    const used = new Set<string>();
    for (const tree of Object.values(PLATFORM_CATEGORY_TREES)) {
      for (const g of tree.groups) if (g.globalCategory !== null) used.add(g.globalCategory);
    }
    const orphan = GLOBAL_STORY_CATEGORIES.filter(c => !used.has(c));
    expect(orphan).toEqual([]);
  });


  it('every category metric only references categories that exist in the tree', () => {
    const tree = platformCategoryTree('fanqie')!;
    const valid = new Set(tree.groups.map(g => g.channel + '\u00b7' + g.name));
    for (const key of Object.keys(PLATFORM_CATEGORY_METRICS.fanqie.byCategory)) {
      expect(valid.has(key)).toBe(true);
    }
    expect(PLATFORM_CATEGORY_METRICS.fanqie.capturedAt).toBe('2026-09-22');
  });
});

describe('resolvePlatformCategory lands the 投稿分类 and never fakes precision', () => {
  it('a flat platform name is an exact hit on the first layer', () => {
    const r = resolvePlatformCategory('fanqie', '都市高武');
    expect(r.status).toBe('resolved');
    if (r.status !== 'resolved') return;
    expect(r.value.channel).toBe('男频');
    expect(r.value.platformGroup).toBe('都市高武');
    expect(r.value.platformLeaf).toBe('都市高武');
    expect(r.value.leafExact).toBe(true);
    expect(r.value.globalCategory).toBe('都市\u00b7现实');
  });

  it('lands a legacy global value onto the platform globalDefault, without faking the leaf', () => {
    const r = resolvePlatformCategory('fanqie', '都市\u00b7现实/都市', '男频');
    expect(r.status).toBe('resolved');
    if (r.status !== 'resolved') return;
    expect(r.value.platformGroup).toBe('都市日常');
    expect(r.value.matched).toBe('global');
    expect(r.value.leafExact).toBe(false);
  });

  it('uses the audience channel hint to disambiguate a name that exists in both channels', () => {
    const male = resolvePlatformCategory('fanqie', '悬疑脑洞', '男频');
    const female = resolvePlatformCategory('fanqie', '悬疑脑洞', '女频');
    expect(male.status).toBe('resolved');
    expect(female.status).toBe('resolved');
    if (male.status !== 'resolved' || female.status !== 'resolved') return;
    expect(male.value.channel).toBe('男频');
    expect(female.value.channel).toBe('女频');
    expect(male.value.leafExact).toBe(true);
    expect(female.value.leafExact).toBe(true);
  });

  it('rejects a category that is not in the platform 投稿分类', () => {
    const r = resolvePlatformCategory('fanqie', '不存在的投稿分类XYZ');
    expect(r.status).toBe('unmapped');
    if (r.status !== 'unmapped') return;
    expect(r.availableGroups.length).toBeGreaterThan(0);
  });

  it('returns no_tree for a platform without its own tree instead of borrowing another platform', () => {
    expect(resolvePlatformCategory('custom', '都市高武').status).toBe('no_tree');
  });

  it('exposes the flat flag to the frontend so it cannot ask for a second layer', () => {
    const options = categoryOptionsForPlatform('fanqie');
    expect(options.length).toBe(37);
    expect(options.every(o => o.flat === true)).toBe(true);
    const qidian = categoryOptionsForPlatform('qidian');
    expect(qidian.every(o => o.flat === false)).toBe(true);
  });
});

describe('placement and benchmark 口径 are shared by backend and frontend', () => {
  it('describes an exact flat hit as the 投稿分类 itself', () => {
    const r = resolvePlatformCategory('fanqie', '都市高武');
    if (r.status !== 'resolved') throw new Error('expected resolved');
    const text = describeCategoryPlacement('番茄小说', r.value);
    expect(text).toContain('番茄小说');
    expect(text).toContain('男频');
    expect(text).toContain('都市高武');
    expect(text).toContain('投稿分类本身');
  });

  it('describes a non-exact placement as a landing without faking the leaf', () => {
    const r = resolvePlatformCategory('fanqie', '都市\u00b7现实/都市', '男频');
    if (r.status !== 'resolved') throw new Error('expected resolved');
    const text = describeCategoryPlacement('番茄小说', r.value);
    expect(text).toContain('都市日常');
    expect(text).toContain('不得假装子分类也对上了');
  });

  it('returns measured numbers only where they were actually captured', () => {
    const hit = resolvePlatformCategory('fanqie', '都市高武');
    if (hit.status !== 'resolved') throw new Error('expected resolved');
    const note = platformCategoryBenchmarkNote('fanqie', hit.value);
    expect(note).toContain('样本');
    expect(note).toContain('万');
    const modeled = resolvePlatformCategory('qidian', '玄幻');
    if (modeled.status === 'resolved') {
      expect(platformCategoryBenchmarkNote('qidian', modeled.value)).toBe('');
    }
    expect(platformCategoryMetric('fanqie', '男频', '都市高武')).not.toBeNull();
    expect(platformCategoryMetric('qidian', '男频', '都市高武')).toBeNull();
  });
});

describe('execution standard executes the platform 投稿分类', () => {
  it('does not block the existing project whose category is a legacy global value', () => {
    const c = constitutionOf({
      targetPlatform: 'fanqie',
      category: '都市\u00b7现实/都市',
      targetAudience: '男频',
    });
    expect(categoryPlacementProblem(c)).toBeNull();
  });

  it('blocks a category that cannot be landed on the platform', () => {
    const c = constitutionOf({ targetPlatform: 'fanqie', category: '不存在的投稿分类XYZ' });
    const problem = categoryPlacementProblem(c);
    expect(problem).not.toBeNull();
    if (!problem) return;
    const message = categoryPlacementMessage(c, problem, '番茄小说');
    expect(message).toContain('未在');
    expect(message).toContain('必须改选该平台的投稿分类');
  });

  it('writes the platform landing plus the measured benchmark into the directive', () => {
    const c = constitutionOf({
      targetPlatform: 'fanqie',
      category: '都市高武',
      targetAudience: '男频',
      storyTone: ['热血'],
      writingStyle: ['白描/朴素'],
      webNovelGenre: ['系统流'],
      submissionTags: ['系统流'],
      pov: '第三人称限知',
    });
    const standard = buildExecutionStandard(c);
    const category = standard.dimensions.find(d => d.dimension === 'category');
    expect(category).toBeTruthy();
    if (!category) return;
    expect(category.requirement).toContain('都市高武');
    expect(category.requirement).toContain('男频');
    expect(category.requirement).toContain('样本');
    expect(category.requirement).toContain('万');
  });

  it('states 未核实 instead of inventing numbers when the platform has no measured data', () => {
    const c = constitutionOf({
      targetPlatform: 'qidian',
      category: '玄幻',
      targetAudience: '男频',
      storyTone: ['热血'],
      writingStyle: ['白描/朴素'],
      webNovelGenre: ['系统流'],
      pov: '第三人称限知',
    });
    const standard = buildExecutionStandard(c);
    const category = standard.dimensions.find(d => d.dimension === 'category');
    expect(category).toBeTruthy();
    if (!category) return;
    expect(category.requirement).toContain('不得编造数字');
  });
});

describe('按平台分类执行：基调/文风/流派/视角各自回到平台分类口径上验收', () => {
  it('流派命中该分类头部的平台官方标签时，判据是平台实测数据且没有落差', () => {
    const r = resolvePlatformCategory('fanqie', '玄幻脑洞', '男频');
    if (r.status !== 'resolved') throw new Error('expected resolved');
    const b = platformCategoryDimensionBinding('fanqie', r.value, 'genre', '系统流');
    expect(b.basis).toBe('measured');
    expect(b.gap).toBe('');
    expect(b.evidence).toContain('系统');
    expect(b.requirement).toContain('绑定系统后获得金手指');
  });

  it('流派未命中该分类头部官方标签时必须报出落差，不得默认通过（真实取数：男频·都市日常）', () => {
    const r = resolvePlatformCategory('fanqie', '都市·现实/都市', '男频');
    if (r.status !== 'resolved') throw new Error('expected resolved');
    expect(r.value.platformGroup).toBe('都市日常');
    const b = platformCategoryDimensionBinding('fanqie', r.value, 'genre', '系统流');
    expect(b.basis).toBe('measured');
    expect(b.gap).toContain('系统流');
    expect(b.gap).toContain('不在');
    expect(b.gap).toContain('都市日常');
    expect(b.requirement).toContain('不得默认通过');
  });

  it('基调按平台官方定义判相悖，文风与视角判据是作者设定但同样必须执行', () => {
    const r = resolvePlatformCategory('fanqie', '都市高武', '男频');
    if (r.status !== 'resolved') throw new Error('expected resolved');
    const tone = platformCategoryDimensionBinding('fanqie', r.value, 'tone', '热血');
    const style = platformCategoryDimensionBinding('fanqie', r.value, 'style', '白描/朴素');
    const pov = platformCategoryDimensionBinding('fanqie', r.value, 'pov', '第三人称限知');
    expect(tone.basis).toBe('definition');
    expect(style.basis).toBe('author_only');
    expect(pov.basis).toBe('author_only');
    // 判据来源不同 -> 四维不得共用同一句验收口径
    expect(new Set([tone.requirement, style.requirement, pov.requirement]).size).toBe(3);
    // author_only 是「平台不公开该维口径」，不是「不必执行」
    expect(style.requirement).not.toContain('不适用');
    expect(pov.requirement).not.toContain('不适用');
    for (const b of [tone, style, pov]) expect(b.requirement).toContain('按平台分类执行');
    expect(tone.requirement).toContain('相悖即判未执行');
  });

  it('未采集到该分类口径的平台如实返回 author_only 与空证据，不编造平台口径', () => {
    const r = resolvePlatformCategory('qidian', '玄幻', '男频');
    if (r.status !== 'resolved') throw new Error('expected resolved');
    const b = platformCategoryDimensionBinding('qidian', r.value, 'genre', '系统流');
    expect(b.basis).toBe('author_only');
    expect(b.evidence).toBe('');
    expect(b.gap).toBe('');
    expect(b.requirement).toContain('未核验');
    expect(b.requirement).toContain('不得编造平台口径');
  });

  it('长篇榜单的官方标签不得作为短篇的分类标签和质量依据', () => {
    const r = resolvePlatformCategory('fanqie', '都市日常', '男频');
    if (r.status !== 'resolved') throw new Error('expected resolved');
    const long = platformCategoryDimensionBinding('fanqie', r.value, 'genre', '穿越', 'long_novel');
    const short = platformCategoryDimensionBinding('fanqie', r.value, 'genre', '穿越', 'short_story');
    expect(long.basis).toBe('measured');
    expect(short.basis).toBe('author_only');
    expect(short.evidence).toBe('');
    expect(short.gap).toBe('');
    expect(platformCategoryBenchmarkNote('fanqie', r.value, 'short_story')).toBe('');
    expect(platformCategoryBenchmarkNote('fanqie', r.value, 'long_novel')).toContain('头部实测');
  });

  it('判据来源显示名一份三值、互不重复，前端与 prompt 共用', () => {
    const labels = Object.values(PLATFORM_DIMENSION_BASIS_LABELS);
    expect(labels).toHaveLength(3);
    expect(new Set(labels).size).toBe(3);
    expect(labels.join()).toContain('平台实测数据');
    expect(labels.join()).toContain('平台官方定义原文');
    expect(labels.join()).toContain('作者设定');
  });
});

describe('execution standard 四维不再共用一句判据，且不因平台给判据而丢掉该维自身规则', () => {
  it('四维各自的 requirement 互不相同，流派维带出真实落差且同时保留该维通用规则', () => {
    const c = constitutionOf({
      targetPlatform: 'fanqie',
      category: '都市·现实/都市',
      targetAudience: '男频',
      storyTone: ['热血'],
      writingStyle: ['白描/朴素'],
      webNovelGenre: ['系统流'],
      submissionTags: ['系统流'],
      pov: '第三人称限知',
    });
    const standard = buildExecutionStandard(c);
    const find = (key: string) => {
      const d = standard.dimensions.find(item => item.dimension === key);
      if (!d) throw new Error('missing dimension ' + key);
      return d.requirement;
    };
    const reqs = ['tone', 'style', 'genre', 'pov'].map(find);
    expect(new Set(reqs).size).toBe(4);

    const genre = find('genre');
    expect(genre).toContain('系统流');
    expect(genre).toContain('落差');
    expect(genre).toContain('必答项');
    expect(genre).toContain('该流派读者的核心预期必须在本章被兑现');
    // 基调维：平台定义判据 + 该维自身情绪规则都必须保留
    const tone = find('tone');
    expect(tone).toContain('按平台分类执行');
    expect(tone).toContain('不得中途改调性');
    expect(find('style')).toContain('句式、比喻密度、描写分寸与信息给法都以该风格为准');
    expect(find('pov')).toContain('全篇保持一致');
  });

  it('平台无该分类口径时四维仍逐维给出口径，并写明未核验', () => {
    const c = constitutionOf({
      targetPlatform: 'qidian',
      category: '玄幻',
      targetAudience: '男频',
      storyTone: ['热血'],
      writingStyle: ['白描/朴素'],
      webNovelGenre: ['系统流'],
      pov: '第三人称限知',
    });
    const standard = buildExecutionStandard(c);
    const genre = standard.dimensions.find(item => item.dimension === 'genre');
    expect(genre).toBeTruthy();
    if (!genre) return;
    expect(genre.requirement).toContain('未核验');
    expect(genre.requirement).toContain('该流派读者的核心预期必须在本章被兑现');
  });
});

describe('跨频道同名分类：靠「频道·分类名」选项身份归位，缺依据时阻断而不是替用户猜频道', () => {
  it('番茄确有 3 个分类名同时存在于男频与女频（本组用例的根因）', () => {
    const tree = platformCategoryTree('fanqie')!;
    const channelsOf = (name: string) => tree.groups.filter(g => g.name === name).map(g => g.channel).sort();
    for (const name of ['科幻末世', '悬疑脑洞', '游戏体育']) {
      expect(channelsOf(name)).toEqual(['女频', '男频'].sort());
    }
  });

  it('选项身份把同名分类分别归位到各自的频道', () => {
    const male = resolvePlatformCategory('fanqie', platformCategoryOptionId('男频', '悬疑脑洞'));
    const female = resolvePlatformCategory('fanqie', platformCategoryOptionId('女频', '悬疑脑洞'));
    expect(male.status).toBe('resolved');
    expect(female.status).toBe('resolved');
    if (male.status !== 'resolved' || female.status !== 'resolved') return;
    expect(male.value.channel).toBe('男频');
    expect(female.value.channel).toBe('女频');
    expect(male.value.platformLeaf).toBe('悬疑脑洞');
    expect(female.value.platformLeaf).toBe('悬疑脑洞');
    expect(male.value.leafExact).toBe(true);
    expect(female.value.leafExact).toBe(true);
  });

  it('选项身份优先于目标读者提示：两处不一致时不按提示静默换频道', () => {
    const r = resolvePlatformCategory('fanqie', '男频·悬疑脑洞', '女频');
    expect(r.status).toBe('resolved');
    if (r.status !== 'resolved') return;
    expect(r.value.channel).toBe('男频');
  });

  it('只写分类名且没有任何频道依据时判 unmapped，并指引改选带频道的投稿分类', () => {
    const r = resolvePlatformCategory('fanqie', '悬疑脑洞');
    expect(r.status).toBe('unmapped');
    if (r.status !== 'unmapped') return;
    expect(r.reason).toContain('同时是');
    expect(r.reason).toContain('男频');
    expect(r.reason).toContain('女频');
    expect(r.reason).toContain('请改选带频道的投稿分类');
    expect(r.availableGroups).toHaveLength(37);
  });

  it('只写分类名但有目标读者时照常归位（阻断只针对真的没有依据的情况）', () => {
    const male = resolvePlatformCategory('fanqie', '悬疑脑洞', '男频');
    const female = resolvePlatformCategory('fanqie', '悬疑脑洞', '女频');
    expect(male.status).toBe('resolved');
    expect(female.status).toBe('resolved');
    if (male.status !== 'resolved' || female.status !== 'resolved') return;
    expect(male.value.channel).toBe('男频');
    expect(female.value.channel).toBe('女频');
  });

  it('平台侧唯一命名的分类不带频道也照常归位，不会被跨频道阻断误伤', () => {
    const r = resolvePlatformCategory('fanqie', '都市高武');
    expect(r.status).toBe('resolved');
    if (r.status !== 'resolved') return;
    expect(r.value.channel).toBe('男频');
    expect(r.value.leafExact).toBe(true);
  });

  it('分类名本身含「·」（都市·现实）时不被当成频道前缀拆坏', () => {
    const legacy = resolvePlatformCategory('fanqie', '都市·现实/都市');
    expect(legacy.status).toBe('resolved');
    if (legacy.status !== 'resolved') return;
    expect(legacy.value.matched).toBe('global');
    expect(legacy.value.platformGroup).toBe('都市日常');
    expect(legacy.value.globalCategory).toBe('都市·现实');
    expect(legacy.value.leafExact).toBe(false);

    const prefixed = resolvePlatformCategory('fanqie', '男频·都市·现实/都市');
    expect(prefixed.status).toBe('resolved');
    if (prefixed.status !== 'resolved') return;
    expect(prefixed.value.channel).toBe('男频');
    expect(prefixed.value.platformGroup).toBe('都市日常');
  });

  it('阻断时给出的可用大类自带频道，用户能直接照着改选', () => {
    const r = resolvePlatformCategory('fanqie', '悬疑脑洞');
    if (r.status !== 'unmapped') throw new Error('expected unmapped');
    expect(r.availableGroups).toHaveLength(37);
    expect(r.availableGroups.every(g => g.includes('·'))).toBe(true);
    expect(r.availableGroups).toContain('男频·悬疑脑洞');
    expect(r.availableGroups).toContain('女频·悬疑脑洞');
  });

  it('categoryOptionsForPlatform 的 37 个 id 互不相同：下拉 key 与落库身份不会互相覆盖', () => {
    const options = categoryOptionsForPlatform('fanqie');
    expect(options).toHaveLength(37);
    expect(new Set(options.map(o => o.id)).size).toBe(37);
    for (const o of options) expect(o.id).toBe(platformCategoryOptionId(o.channel, o.name));
  });
});
