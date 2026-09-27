import { describe, it, expect } from 'vitest';
import {
  EMPTY_EXECUTION_STANDARDS,
  CUSTOM_PLATFORM_VALUE,
  GENERIC_PLATFORM_VALUE,
  PLATFORM_OPTIONS,
  missingExecutionStandards,
  isCustomPlatformNoteMissing,
  platformStandardProblem,
  platformLabel,
  toStandardsTags,
  parseCategory,
  joinCategory,
  categoryOptionId,
  matchCategoryOption,
  categoryDisplayValue,
  type CategoryOption,
  toExecutionStandardsPayload,
  targetWordsVerdict,
  type ExecutionStandardsValue,
} from './executionStandards';

const FULL: ExecutionStandardsValue = {
  targetPlatform: 'fanqie',
  customPlatformNote: '',
  category: '悬疑/推理',
  storyTone: ['克制'],
  writingStyle: ['细节白描'],
  webNovelGenre: ['悬疑追查'],
  submissionTags: ['悬疑'],
  plotTags: [],
  genreFitNote: '',
  pov: '第一人称',
  targetAudience: '女频',
  // 成稿单元：体量判据的适用前提（连载长篇的实测区间不能拿去对照短篇）。
  projectType: 'long_novel',
  targetWords: '1373345',
  // 分类体量取舍依据：落区间外时的唯一合规路径；空串 = 没有说明，不是「默认允许」。
  categoryWordScaleDeviation: '',
};

describe('PLATFORM_OPTIONS / platformLabel', () => {
  it('平台清单只有一份，且不含 generic（通用 = 没选平台，不能出现在选项里）', () => {
    expect(PLATFORM_OPTIONS.some((item) => item.value === GENERIC_PLATFORM_VALUE)).toBe(false);
    expect(PLATFORM_OPTIONS.some((item) => item.value === 'rules_horror')).toBe(false);
    expect(new Set(PLATFORM_OPTIONS.map((item) => item.value)).size).toBe(PLATFORM_OPTIONS.length);
  });

  it('每个平台都有显示名，未选平台返回空串', () => {
    for (const item of PLATFORM_OPTIONS) expect(platformLabel(item.value)).toBe(item.label);
    expect(platformLabel('')).toBe('');
    expect(platformLabel(undefined)).toBe('');
  });

  it('历史数据里的 generic 显示为「未设置」而不是空（否则卡片上会出现无法解释的空白）', () => {
    expect(platformLabel(GENERIC_PLATFORM_VALUE)).toContain('未设置');
  });

  it('未知值原样回显，不吞掉信息', () => {
    expect(platformLabel('some_new_platform')).toBe('some_new_platform');
  });
});

describe('platformStandardProblem', () => {
  it('没选平台 = unset，选了通用 = generic，自定义没说明 = custom_note_missing', () => {
    expect(platformStandardProblem({ targetPlatform: '', customPlatformNote: '' })).toBe('unset');
    expect(platformStandardProblem({ targetPlatform: '   ', customPlatformNote: '' })).toBe('unset');
    expect(platformStandardProblem({ targetPlatform: GENERIC_PLATFORM_VALUE, customPlatformNote: '' })).toBe('generic');
    expect(platformStandardProblem({ targetPlatform: CUSTOM_PLATFORM_VALUE, customPlatformNote: ' ' })).toBe('custom_note_missing');
  });

  it('已执行标准的平台一律返回 null', () => {
    expect(platformStandardProblem(FULL)).toBe(null);
    expect(platformStandardProblem({ targetPlatform: CUSTOM_PLATFORM_VALUE, customPlatformNote: '单章 800 字' })).toBe(null);
  });

  it('题材值和未知值不能冒充可投稿平台', () => {
    expect(platformStandardProblem({ targetPlatform: 'rules_horror', customPlatformNote: '' })).toBe('unsupported');
    expect(platformStandardProblem({ targetPlatform: 'not_a_platform', customPlatformNote: '' })).toBe('unsupported');
  });

  it('isCustomPlatformNoteMissing 是 platformStandardProblem 的专用视图，两者不会分叉', () => {
    const samples: Array<{ targetPlatform: string; customPlatformNote: string }> = [
      { targetPlatform: '', customPlatformNote: '' },
      { targetPlatform: GENERIC_PLATFORM_VALUE, customPlatformNote: 'x' },
      { targetPlatform: CUSTOM_PLATFORM_VALUE, customPlatformNote: '' },
      { targetPlatform: CUSTOM_PLATFORM_VALUE, customPlatformNote: 'y' },
      { targetPlatform: 'fanqie', customPlatformNote: '' },
    ];
    for (const sample of samples) {
      expect(isCustomPlatformNoteMissing(sample)).toBe(platformStandardProblem(sample) === 'custom_note_missing');
    }
  });
});

describe('missingExecutionStandards', () => {
  it('六维齐备时没有任何缺项', () => {
    expect(missingExecutionStandards(FULL)).toEqual([]);
  });

  it('空项目要求六维创作前提', () => {
    expect(missingExecutionStandards(EMPTY_EXECUTION_STANDARDS)).toEqual([
      '平台', '故事分类', '基调', '文风', '流派', '视角',
    ]);
  });

  it('generic 平台等于没选平台，必须判为未执行标准（不得当成有效值放行）', () => {
    const value = { ...FULL, targetPlatform: 'generic' };
    expect(missingExecutionStandards(value)).toEqual(['平台']);
  });

  it('自定义平台没有说明 = 平台这一维没有执行值，必须判未执行标准', () => {
    const value = { ...FULL, targetPlatform: CUSTOM_PLATFORM_VALUE, customPlatformNote: '' };
    expect(missingExecutionStandards(value)).toEqual(['平台']);
    expect(isCustomPlatformNoteMissing(value)).toBe(true);
  });

  it('自定义平台说明只有空格同样判未执行标准', () => {
    const value = { ...FULL, targetPlatform: CUSTOM_PLATFORM_VALUE, customPlatformNote: '   ' };
    expect(missingExecutionStandards(value)).toEqual(['平台']);
  });

  it('自定义平台写明说明后即视为已执行标准（说明就是这一维的执行值）', () => {
    const value = {
      ...FULL,
      targetPlatform: CUSTOM_PLATFORM_VALUE,
      customPlatformNote: '本平台读者只看前三行的钩子，单章 800 字内必须有一次反转。',
    };
    expect(missingExecutionStandards(value)).toEqual([]);
    expect(isCustomPlatformNoteMissing(value)).toBe(false);
  });

  it('非自定义平台时，说明为空不影响判据', () => {
    expect(isCustomPlatformNoteMissing(FULL)).toBe(false);
  });

  it('分类只填空格不算已设置', () => {
    expect(missingExecutionStandards({ ...FULL, category: '   ' })).toEqual(['分类']);
  });

  it('番茄长篇已核实标签的分类要求作品标签', () => {
    const value = { ...FULL, category: '男频·都市日常', targetAudience: '男频', submissionTags: [] };
    expect(missingExecutionStandards(value)).toEqual(['作品标签']);
  });

  it('番茄短篇保留六维创作前提但不套用长篇投稿标签名', () => {
    expect(missingExecutionStandards({ ...FULL, projectType: 'short_story', category: '男频·都市日常', storyTone: [], writingStyle: [], webNovelGenre: [], pov: '' })).toEqual(['基调', '文风', '流派', '视角']);
  });

  it('未核实平台仍要求创作六维，但不把它们叫成投稿字段', () => {
    expect(missingExecutionStandards({ ...FULL, targetPlatform: 'zhihu', projectType: 'short_story', storyTone: [], writingStyle: [], webNovelGenre: [], pov: '' })).toEqual(['基调', '文风', '流派', '视角']);
  });
});

describe('toStandardsTags', () => {
  it('数组逐项归一化并去空', () => {
    expect(toStandardsTags(['a', '', 'b'])).toEqual(['a', 'b']);
  });
  it('单个字符串归一化为单元素数组', () => {
    expect(toStandardsTags(' 细节白描 ')).toEqual(['细节白描']);
  });
  it('空值返回空数组而不是 [""]', () => {
    expect(toStandardsTags('')).toEqual([]);
    expect(toStandardsTags(null)).toEqual([]);
    expect(toStandardsTags(undefined)).toEqual([]);
  });
});

describe('parseCategory / joinCategory', () => {
  const categories = [{ name: '悬疑', children: ['推理', '惊悚'] }];

  it('往返解析保持「大类/子类」原值', () => {
    const parsed = parseCategory('悬疑/推理', categories);
    expect(parsed).toEqual({ major: '悬疑', minor: '推理' });
    expect(joinCategory(parsed.major, parsed.minor)).toBe('悬疑/推理');
  });

  it('只给了子类时反查大类，不改写原值', () => {
    const parsed = parseCategory('推理', categories);
    expect(parsed).toEqual({ major: '悬疑', minor: '推理' });
    expect(joinCategory(parsed.major, parsed.minor)).toBe('悬疑/推理');
  });

  it('空分类解析为空，不会凭空产生大类', () => {
    expect(parseCategory('', categories)).toEqual({ major: '', minor: '' });
  });

  it('只选大类不选子类时落库为纯大类', () => {
    expect(joinCategory('悬疑', '')).toBe('悬疑');
  });

  // 番茄等平台的投稿分类是扁平的：平台侧到这一层就是投稿分类本身。
  // 前端必须把它当单层处理，否则用户会把同一个名字选两遍，落库成「都市高武/都市高武」。
  const flatCategories = [{ name: '都市高武', children: ['都市高武'], flat: true }];

  it('扁平分类：单层值解析成大类，子类必须留空（不得让用户选第二遍）', () => {
    expect(parseCategory('都市高武', flatCategories)).toEqual({ major: '都市高武', minor: '' });
  });

  it('扁平分类：历史脏数据「X/X」还原成单层，不当成有效的两级落位', () => {
    expect(parseCategory('都市高武/都市高武', flatCategories)).toEqual({ major: '都市高武', minor: '' });
  });

  it('扁平分类：拼接时不会写成「X/X」', () => {
    expect(joinCategory('都市高武', '')).toBe('都市高武');
    expect(joinCategory('都市高武', '都市高武')).toBe('都市高武');
  });
});

describe('toExecutionStandardsPayload', () => {
  it('把六维原样转成提交载荷，去掉首尾空格', () => {
    const payload = toExecutionStandardsPayload({ ...FULL, category: ' 悬疑/推理 ', pov: ' 第一人称 ' });
    expect(payload).toEqual({
      targetPlatform: 'fanqie',
      customPlatformNote: '',
      category: '悬疑/推理',
      storyTone: ['克制'],
      writingStyle: ['细节白描'],
      webNovelGenre: ['悬疑追查'],
      submissionTags: ['悬疑'],
      plotTags: [],
      genreFitNote: '',
      pov: '第一人称',
      targetAudience: '女频',
      targetWords: 1373345,
      categoryWordScaleDeviation: '',
    });
  });

  it('自定义平台把说明带进载荷，说明是这一维的执行值', () => {
    const payload = toExecutionStandardsPayload({
      ...FULL,
      targetPlatform: CUSTOM_PLATFORM_VALUE,
      customPlatformNote: '  单章 800 字，章尾必须留钩。  ',
    });
    expect(payload.customPlatformNote).toBe('单章 800 字，章尾必须留钩。');
  });

  it('非自定义平台不带说明（避免写入一段会被后端当成平台基准的文本）', () => {
    const payload = toExecutionStandardsPayload({ ...FULL, customPlatformNote: '残留文本' });
    expect(payload.customPlatformNote).toBe('');
  });
});

// 番茄的 37 个投稿分类里有 3 个名字同时存在于男频与女频（科幻末世 / 悬疑脑洞 / 游戏体育）。
// 只按分类名做选项身份时，下拉 key 重复、频道映射被后写覆盖；这批用例锁定「选项自带频道」这一份身份。
const CROSS_CHANNEL: CategoryOption[] = [
  { id: '男频·悬疑脑洞', channel: '男频', name: '悬疑脑洞', children: ['悬疑脑洞'], globalCategory: '悬疑·灵异', flat: true },
  { id: '女频·悬疑脑洞', channel: '女频', name: '悬疑脑洞', children: ['悬疑脑洞'], globalCategory: '悬疑·灵异', flat: true },
  { id: '男频·都市高武', channel: '男频', name: '都市高武', children: ['都市高武'], globalCategory: '都市·现实', flat: true },
  { id: '男频·玄幻', channel: '男频', name: '玄幻', children: ['东方玄幻', '异世大陆'], globalCategory: '玄幻·奇幻' },
];

describe('跨频道同名分类：选项身份自带频道，多义时返回 undefined 而不是猜', () => {
  it('categoryOptionId 有 id 用 id，没有（全局题材字典）退回分类名', () => {
    expect(categoryOptionId(CROSS_CHANNEL[0])).toBe('男频·悬疑脑洞');
    expect(categoryOptionId({ name: '悬疑', children: [] })).toBe('悬疑');
    expect(categoryOptionId({ id: '', name: '悬疑', children: [] })).toBe('悬疑');
  });

  it('同名两项的 id 互不相同，前端可以用它做 key', () => {
    const ids = CROSS_CHANNEL.filter((o) => o.name === '悬疑脑洞').map(categoryOptionId);
    expect(ids).toEqual(['男频·悬疑脑洞', '女频·悬疑脑洞']);
    expect(new Set(ids).size).toBe(2);
  });

  it('按选项身份匹配永远唯一，不受频道提示影响', () => {
    expect(categoryOptionId(matchCategoryOption(CROSS_CHANNEL, '女频·悬疑脑洞')!)).toBe('女频·悬疑脑洞');
    expect(categoryOptionId(matchCategoryOption(CROSS_CHANNEL, '男频·悬疑脑洞', '女频')!)).toBe('男频·悬疑脑洞');
  });

  it('只给裸分类名且跨频道时返回 undefined（不按展示顺序挑一个）', () => {
    expect(matchCategoryOption(CROSS_CHANNEL, '悬疑脑洞')).toBeUndefined();
  });

  it('只给裸分类名但有频道提示时按提示收窄到唯一一项', () => {
    expect(categoryOptionId(matchCategoryOption(CROSS_CHANNEL, '悬疑脑洞', '男频')!)).toBe('男频·悬疑脑洞');
    expect(categoryOptionId(matchCategoryOption(CROSS_CHANNEL, '悬疑脑洞', '女频')!)).toBe('女频·悬疑脑洞');
  });

  it('唯一命名的分类（都市高武）不需要频道提示也能匹配上', () => {
    expect(categoryOptionId(matchCategoryOption(CROSS_CHANNEL, '都市高武')!)).toBe('男频·都市高武');
  });

  it('全局大类名按 globalCategory 匹配，同样支持频道提示消歧', () => {
    expect(categoryOptionId(matchCategoryOption(CROSS_CHANNEL, '都市·现实')!)).toBe('男频·都市高武');
    expect(categoryOptionId(matchCategoryOption(CROSS_CHANNEL, '悬疑·灵异', '女频')!)).toBe('女频·悬疑脑洞');
  });

  it('扁平平台的选项身份带频道，往返解析不写成「X/X」', () => {
    expect(parseCategory('女频·悬疑脑洞', CROSS_CHANNEL)).toEqual({ major: '女频·悬疑脑洞', minor: '' });
    expect(parseCategory('女频·悬疑脑洞/女频·悬疑脑洞', CROSS_CHANNEL)).toEqual({ major: '女频·悬疑脑洞', minor: '' });
    expect(joinCategory('女频·悬疑脑洞', '')).toBe('女频·悬疑脑洞');
  });

  it('非扁平平台：major 是选项身份，minor 是裸子类名（频道不写进子类）', () => {
    expect(parseCategory('男频·玄幻/东方玄幻', CROSS_CHANNEL)).toEqual({ major: '男频·玄幻', minor: '东方玄幻' });
    expect(joinCategory('男频·玄幻', '东方玄幻')).toBe('男频·玄幻/东方玄幻');
  });

  it('历史裸名回显：跨频道且无频道依据时不得凭空归位到某一项', () => {
    expect(parseCategory('悬疑脑洞', CROSS_CHANNEL)).toEqual({ major: '', minor: '悬疑脑洞' });
    expect(parseCategory('悬疑脑洞', CROSS_CHANNEL, '女频')).toEqual({ major: '女频·悬疑脑洞', minor: '' });
  });
});

describe('categoryDisplayValue：下拉回显必须与执行标准同一份判据', () => {
  type Resolved = Parameters<typeof categoryDisplayValue>[1];
  const OPTIONS: CategoryOption[] = [
    { id: '男频·都市日常', channel: '男频', name: '都市日常', children: ['都市日常'], globalCategory: '都市·现实', flat: true },
    { id: '男频·都市修真', channel: '男频', name: '都市修真', children: ['都市修真'], globalCategory: '都市·现实', flat: true },
    { id: '男频·悬疑脑洞', channel: '男频', name: '悬疑脑洞', children: ['悬疑脑洞'], globalCategory: '悬疑·灵异', flat: true },
    { id: '女频·悬疑脑洞', channel: '女频', name: '悬疑脑洞', children: ['悬疑脑洞'], globalCategory: '悬疑·灵异', flat: true },
    { id: '男频·玄幻', channel: '男频', name: '玄幻', children: ['东方玄幻'], globalCategory: '玄幻·奇幻' },
  ];
  const placed = (
    channel: string, platformGroup: string, platformLeaf: string, leafExact: boolean,
  ): NonNullable<Resolved> => ({
    matched: 'global', channel, platformGroup, platformLeaf, leafExact, globalCategory: '都市·现实',
  });

  it('解析得出选项身份时原样显示，归位不得覆盖用户的明确选择', () => {
    const parsed = parseCategory('男频·悬疑脑洞', OPTIONS);
    expect(parsed).toEqual({ major: '男频·悬疑脑洞', minor: '' });
    expect(categoryDisplayValue(parsed, placed('女频', '悬疑脑洞', '悬疑脑洞', true)))
      .toEqual({ major: '男频·悬疑脑洞', minor: '' });
  });

  it('历史「全局大类/子类」在平台侧多义时：显示归位后的选项身份，而不是留空', () => {
    const parsed = parseCategory('都市·现实/都市', OPTIONS, '男频');
    expect(parsed).toEqual({ major: '', minor: '都市·现实/都市' });
    expect(categoryDisplayValue(parsed, placed('男频', '都市日常', '都市日常', false)))
      .toEqual({ major: '男频·都市日常', minor: '' });
  });

  it('归位到平台大类且子类不精确时不得回显子类（leafExact=false）', () => {
    const parsed = parseCategory('玄幻·奇幻', OPTIONS);
    expect(parsed.major).toBe('男频·玄幻');
    expect(categoryDisplayValue(parsed, placed('男频', '玄幻', '玄幻', false)))
      .toEqual({ major: '男频·玄幻', minor: '' });
  });

  it('归位精确到平台子类时子类一并回显（leafExact=true）', () => {
    const parsed = { major: '', minor: '' };
    expect(categoryDisplayValue(parsed, placed('男频', '玄幻', '东方玄幻', true)))
      .toEqual({ major: '男频·玄幻', minor: '东方玄幻' });
  });

  it('既没解析出、也没归位：留空让用户重选，不猜一个分类', () => {
    const parsed = parseCategory('悬疑脑洞', OPTIONS);
    expect(parsed).toEqual({ major: '', minor: '悬疑脑洞' });
    expect(categoryDisplayValue(parsed, null)).toEqual({ major: '', minor: '' });
    expect(categoryDisplayValue(parsed, undefined)).toEqual({ major: '', minor: '' });
  });

  it('跨频道同名有频道依据时本来就归位，不触发兜底', () => {
    expect(parseCategory('悬疑脑洞', OPTIONS, '女频')).toEqual({ major: '女频·悬疑脑洞', minor: '' });
    expect(categoryDisplayValue(parseCategory('悬疑脑洞', OPTIONS, '女频'), placed('男频', '悬疑脑洞', '悬疑脑洞', true)))
      .toEqual({ major: '女频·悬疑脑洞', minor: '' });
  });
});

// 「分类」维的目标总字数判据（与后端 platform-quality-rules 同源同一份数据）：
// 已归位但没有实测体量的分类不给判据（未核验 != 不达标）；有实测体量时未设定/落区间外都是硬判定，不是提示。
// 成稿单元（projectType）是这条判据的适用前提：平台的实测体量按成稿单元采集，番茄那份来自【连载长篇】榜单，
// 拿它对照短篇，就是把长篇区间套到短篇上 —— 每一本合规短篇都会在生成末尾被判未达标准（项目卡片级问题，正文精修改不动）。
describe('targetWordsVerdict：分类级体量是确定性判据，不是提示', () => {
  // 番茄·男频·都市日常：官网榜单实测 46.2 万 – 719.0 万字（中位 137.3 万）。
  const placed: ExecutionStandardsValue = {
    ...FULL,
    targetPlatform: 'fanqie',
    category: '男频·都市日常',
    targetAudience: '男频',
    projectType: 'long_novel',
    targetWords: '1373345',
  };

  it('落在该分类头部实测区间内 -> 不阻断，并回显区间口径', () => {
    const verdict = targetWordsVerdict(placed);
    expect(verdict.status).toBe('within');
    expect(verdict.metric).not.toBeNull();
    expect(verdict.metric!.min).toBe(461658);
    expect(verdict.metric!.max).toBe(7189662);
    expect(verdict.error).toBe(false);
    expect(verdict.deviationRequired).toBe(false);
    expect(verdict.note).toContain('体量判据已满足');
  });

  it('已归位分类但目标总字数未设定 -> 硬判定未执行（空值不等于 0，也不等于不适用）', () => {
    const verdict = targetWordsVerdict({ ...placed, targetWords: '' });
    expect(verdict.status).toBe('unset');
    expect(verdict.error).toBe(true);
    expect(verdict.note).toContain('未设定');
  });

  it('低于分类实测下限同样判未执行，并说明低于哪一段', () => {
    const verdict = targetWordsVerdict({ ...placed, targetWords: '400000' });
    expect(verdict.status).toBe('out_of_range');
    expect(verdict.error).toBe(true);
    expect(verdict.deviationRequired).toBe(true);
    expect(verdict.note).toContain('低于');
  });

  it('高于分类实测上限同样判未执行', () => {
    const verdict = targetWordsVerdict({ ...placed, targetWords: '8000000' });
    expect(verdict.status).toBe('out_of_range');
    expect(verdict.error).toBe(true);
    expect(verdict.note).toContain('高于');
  });

  it('落区间外但项目卡片写明了取舍依据 -> 按「已声明偏离」放行（执行标准自己给的合规路径）', () => {
    const verdict = targetWordsVerdict({
      ...placed,
      targetWords: '400000',
      categoryWordScaleDeviation: '本书走快节奏短打，按该分类下限之下起步，靠更新频率换取早期曝光。',
    });
    expect(verdict.status).toBe('deviation_declared');
    expect(verdict.error).toBe(false);
    expect(verdict.deviationRequired).toBe(false);
    expect(verdict.note).toContain('已声明偏离');
  });

  it('短篇不受连载长篇区间约束：成稿单元不符 -> 不阻断，并如实说明基准尚未采集', () => {
    const verdict = targetWordsVerdict({ ...placed, projectType: 'short_story', targetWords: '20000' });
    expect(verdict.status).toBe('no_metric');
    expect(verdict.error).toBe(false);
    expect(verdict.note).toContain('分类体量基准尚未采集');
  });

  it('自定义平台的体量口径来自自定义说明，系统不编造区间', () => {
    const verdict = targetWordsVerdict({
      ...placed,
      targetPlatform: CUSTOM_PLATFORM_VALUE,
      targetWords: '',
    });
    expect(verdict.metric).toBeNull();
    expect(verdict.error).toBe(false);
  });

  it('分类未在该平台归位时不给判据（未核验 != 不达标），但不再沉默放行', () => {
    const verdict = targetWordsVerdict({ ...placed, category: '99不存在的分类' });
    expect(verdict.status).toBe('no_metric');
    expect(verdict.metric).toBeNull();
    expect(verdict.error).toBe(false);
    expect(verdict.note).toContain('未核验');
  });
});
