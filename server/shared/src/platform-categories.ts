/**
 * 平台投稿分类树 —— 「按平台分类执行」的唯一事实源。
 *
 * 为什么单独建一层，而不是复用全局分类字典（story_dict.story_category）：
 *   全局分类（9 大类 / 54 子类）是系统内部的题材taxonomy，回答「这是什么题材」；
 *   平台投稿分类回答「这本书投到该平台的哪个分类」，两者不是一回事。
 *   番茄的都市分类下有「都市脑洞/都市高武/神豪」，晋江则按「言情/纯爱/百合/无CP」切，
 *   起点男频女频分栏，知乎盐选全是短篇向分类。用一份全局分类冒充所有平台分类，
 *   等于用户选了「番茄·都市高武」而系统只能理解成「都市·现实/都市」——执行标准落不了地。
 *
 * 两个树的关系是【映射】不是【重复】：
 *   每个平台大类都声明它对应哪个全局大类（globalCategory），用于跨平台核对、
 *   历史数据迁移与「用户填的是全局分类、要投的平台怎么归位」这类判断。
 *
 * 数据来源：各平台公开投稿页/作家专区的分类口径（2025-2026 行业公开信息）建模。
 * 平台会调整投稿分类，因此这里是【可编辑的单一份】：平台改分类只改这个文件，
 * 不在任何逻辑里硬编码第二份。核实状态见每个平台的 source/verified 字段。
 */

export interface PlatformCategoryGroup {
  /** 平台投稿页上的大类名（作者投稿时看到的第一层） */
  name: string;
  /** 频道归属：男频 / 女频 / 通用 等 */
  channel: string;
  /**
   * 该大类下作者可选的子分类。平台侧这一层就是叶子时等于大类名本身（见 flat），
   * 不是「自己包含自己」的占位，而是如实表示：作者能选的就是这一个名字。
   */
  children: string[];
  /** 对应的全局分类树大类；null = 平台独有，全局树没有对应项 */
  globalCategory: string | null;
  /**
   * 该平台在这一层就是投稿分类本身（平台分类是扁平的，没有第二层子分类）：
   * true 时 children 必然是 [name]，前端不得再让用户把同一个名字选第二遍。
   */
  flat?: boolean;
  /**
   * 该频道下「填的是全局分类、平台侧没有同名分类」时的优先归位项；
   * 每个全局分类在每个频道最多一个，避免靠数组顺序隐式决定归位结果。
   */
  globalDefault?: boolean;
}

export interface PlatformCategoryTree {
  platform: string;
  /** 数据来源说明：必须写明，禁止把行业建模当成平台官方口径 */
  source: string;
  /** 核实状态：'modeled' = 按公开投稿口径建模，待平台侧实测校正 */
  verified: 'modeled' | 'confirmed';
  groups: PlatformCategoryGroup[];
}

export const PLATFORM_CATEGORY_SOURCE_NOTE =
  '番茄的公开作品分类名与编号是 2026-09-22 官网榜单页实测（verified=confirmed，见该平台的 source）；该页不证明作者后台投稿选项完全相同；' +
  '其余平台仍是按公开投稿口径建模、未经实测校正（verified=modeled），执行标准里会如实写明未核实。' +
  '平台调整分类时只改这一份，任何逻辑里都不得再硬编码第二份分类清单。';

// 未实测平台的 source 统一追加这一句：它们的分类名只是模建，不得读成平台官方口径。
const MODELED = '（依据公开投稿口径建模，未实测核对）';

/**
 * 全局题材大类（9 项）的唯一名字清单。
 *
 * 为什么必须只有一份：story_dict.story_category 的种子与每个平台大类的 globalCategory
 * 指向的是同一套 9 个名字。此前两处各写一遍字面量，改一处不改另一处就会让
 * 「用户填的全局分类」与「平台归位用的全局分类」对不上，而且没有任何地方会报错。
 * 现在：字典种子由本清单派生（story-dict.service.ts），globalCategory 取值必须是本清单成员，
 * 由 platform-categories.spec 守卫 —— 改名只改这里，不会再出现第二份 9 大类。
 */
export const GLOBAL_STORY_CATEGORIES = [
  '玄幻·奇幻',
  '武侠·仙侠',
  '都市·现实',
  '历史·军事',
  '悬疑·灵异',
  '科幻·末世',
  '游戏·竞技',
  '言情·情感',
  '轻小说·二次元',
] as const;
export type GlobalStoryCategory = typeof GLOBAL_STORY_CATEGORIES[number];

export const PLATFORM_CATEGORY_TREES: Record<string, PlatformCategoryTree> = {
  fanqie: {
    platform: 'fanqie',
    source:
      '番茄小说官网榜单页 fanqienovel.com/rank 内嵌的公开作品分类（不是作者后台投稿表单）：2026-09-22 实测抓取，' +
      '路由形如 /rank/{gender}_{mold}_{catId}，分类名与官方编号一一对应；男频 19 类、女频 18 类，' +
      '均为扁平结构（平台侧该层就是叶子，下面没有第二层子分类）。',
    verified: 'confirmed',
    // flat: true  —— 平台侧到这一层就是投稿分类本身，作者投稿时选的名字就是它；前端不得再让用户把
    //                同一个名字选第二遍（那是把平台的扁平分类假装成两级）。
    // globalDefault —— 用户填的是全局分类、平台侧没有同名分类时，该频道下优先归位到它；每个全局
    //                分类在每个频道最多一个，避免靠数组顺序隐式决定归位结果（隐式顺序没人能核对）。
    groups: [
      // ===== 男频（gender=1）19 类，编号为官方分类 ID =====
      { name: '西方奇幻', channel: '男频', flat: true, globalCategory: '玄幻·奇幻', children: ['西方奇幻'] }, // 1141
      { name: '东方仙侠', channel: '男频', flat: true, globalCategory: '武侠·仙侠', children: ['东方仙侠'] }, // 1140
      { name: '科幻末世', channel: '男频', flat: true, globalCategory: '科幻·末世', children: ['科幻末世'] }, // 8
      { name: '都市日常', channel: '男频', flat: true, globalCategory: '都市·现实', globalDefault: true, children: ['都市日常'] }, // 261
      { name: '都市修真', channel: '男频', flat: true, globalCategory: '都市·现实', children: ['都市修真'] }, // 124
      { name: '都市高武', channel: '男频', flat: true, globalCategory: '都市·现实', children: ['都市高武'] }, // 1014
      { name: '历史古代', channel: '男频', flat: true, globalCategory: '历史·军事', globalDefault: true, children: ['历史古代'] }, // 273
      { name: '战神赘婿', channel: '男频', flat: true, globalCategory: '都市·现实', children: ['战神赘婿'] }, // 27
      { name: '都市种田', channel: '男频', flat: true, globalCategory: '都市·现实', children: ['都市种田'] }, // 263
      { name: '传统玄幻', channel: '男频', flat: true, globalCategory: '玄幻·奇幻', globalDefault: true, children: ['传统玄幻'] }, // 258
      { name: '历史脑洞', channel: '男频', flat: true, globalCategory: '历史·军事', children: ['历史脑洞'] }, // 272
      { name: '悬疑脑洞', channel: '男频', flat: true, globalCategory: '悬疑·灵异', children: ['悬疑脑洞'] }, // 539
      { name: '都市脑洞', channel: '男频', flat: true, globalCategory: '都市·现实', children: ['都市脑洞'] }, // 262
      { name: '玄幻脑洞', channel: '男频', flat: true, globalCategory: '玄幻·奇幻', children: ['玄幻脑洞'] }, // 257
      { name: '悬疑灵异', channel: '男频', flat: true, globalCategory: '悬疑·灵异', globalDefault: true, children: ['悬疑灵异'] }, // 751
      { name: '抗战谍战', channel: '男频', flat: true, globalCategory: '历史·军事', children: ['抗战谍战'] }, // 504
      { name: '游戏体育', channel: '男频', flat: true, globalCategory: '游戏·竞技', globalDefault: true, children: ['游戏体育'] }, // 746
      { name: '动漫衍生', channel: '男频', flat: true, globalCategory: '轻小说·二次元', globalDefault: true, children: ['动漫衍生'] }, // 718
      { name: '男频衍生', channel: '男频', flat: true, globalCategory: '轻小说·二次元', children: ['男频衍生'] }, // 1016
      // ===== 女频（gender=0）18 类，编号为官方分类 ID =====
      { name: '古风世情', channel: '女频', flat: true, globalCategory: '言情·情感', globalDefault: true, children: ['古风世情'] }, // 1139
      { name: '科幻末世', channel: '女频', flat: true, globalCategory: '科幻·末世', globalDefault: true, children: ['科幻末世'] }, // 8
      { name: '游戏体育', channel: '女频', flat: true, globalCategory: '游戏·竞技', children: ['游戏体育'] }, // 746
      { name: '女频衍生', channel: '女频', flat: true, globalCategory: '轻小说·二次元', globalDefault: true, children: ['女频衍生'] }, // 1015
      { name: '玄幻言情', channel: '女频', flat: true, globalCategory: '言情·情感', children: ['玄幻言情'] }, // 248
      { name: '种田', channel: '女频', flat: true, globalCategory: '言情·情感', children: ['种田'] }, // 23
      { name: '年代', channel: '女频', flat: true, globalCategory: '言情·情感', children: ['年代'] }, // 79
      { name: '现言脑洞', channel: '女频', flat: true, globalCategory: '言情·情感', children: ['现言脑洞'] }, // 267
      { name: '宫斗宅斗', channel: '女频', flat: true, globalCategory: '言情·情感', children: ['宫斗宅斗'] }, // 246
      { name: '悬疑脑洞', channel: '女频', flat: true, globalCategory: '悬疑·灵异', children: ['悬疑脑洞'] }, // 539
      { name: '古言脑洞', channel: '女频', flat: true, globalCategory: '言情·情感', children: ['古言脑洞'] }, // 253
      { name: '快穿', channel: '女频', flat: true, globalCategory: '言情·情感', children: ['快穿'] }, // 24
      { name: '青春甜宠', channel: '女频', flat: true, globalCategory: '言情·情感', children: ['青春甜宠'] }, // 749
      { name: '星光璀璨', channel: '女频', flat: true, globalCategory: '言情·情感', children: ['星光璀璨'] }, // 745
      { name: '女频悬疑', channel: '女频', flat: true, globalCategory: '悬疑·灵异', globalDefault: true, children: ['女频悬疑'] }, // 747
      { name: '职场婚恋', channel: '女频', flat: true, globalCategory: '言情·情感', children: ['职场婚恋'] }, // 750
      { name: '豪门总裁', channel: '女频', flat: true, globalCategory: '言情·情感', children: ['豪门总裁'] }, // 748
      { name: '民国言情', channel: '女频', flat: true, globalCategory: '言情·情感', children: ['民国言情'] }, // 1017
    ],
  },

  qidian: {
    platform: 'qidian',
    source: '起点中文网作家专区投稿分类口径（男频/女频分栏）' + MODELED,
    verified: 'modeled',
    groups: [
      { name: '玄幻', channel: '男频', globalCategory: '玄幻·奇幻', children: ['东方玄幻', '异世大陆', '王朝争霸', '高武世界', '玄幻脑洞'] },
      { name: '奇幻', channel: '男频', globalCategory: '玄幻·奇幻', children: ['剑与魔法', '史诗奇幻', '现代魔法', '奇幻脑洞'] },
      { name: '武侠', channel: '男频', globalCategory: '武侠·仙侠', children: ['传统武侠', '武侠幻想', '国术无双'] },
      { name: '仙侠', channel: '男频', globalCategory: '武侠·仙侠', children: ['修真文明', '幻想仙侠', '神话仙侠', '现代修真'] },
      { name: '都市', channel: '男频', globalCategory: '都市·现实', children: ['都市生活', '都市异能', '都市高武', '异术超能', '青春校园'] },
      { name: '现实', channel: '男频', globalCategory: '都市·现实', children: ['人间百态', '社会现实', '行业人生'] },
      { name: '历史', channel: '男频', globalCategory: '历史·军事', children: ['两宋元明', '秦汉三国', '上古先秦', '架空历史', '外国历史'] },
      { name: '军事', channel: '男频', globalCategory: '历史·军事', children: ['战争幻想', '抗战烽火', '军旅生涯', '谍战特工'] },
      { name: '游戏', channel: '男频', globalCategory: '游戏·竞技', children: ['电子竞技', '虚拟网游', '游戏异界', '游戏系统'] },
      { name: '体育', channel: '男频', globalCategory: '游戏·竞技', children: ['足球运动', '篮球运动', '体育竞技'] },
      { name: '科幻', channel: '男频', globalCategory: '科幻·末世', children: ['星际文明', '时空穿梭', '末世危机', '未来世界', '进化变异'] },
      { name: '悬疑', channel: '男频', globalCategory: '悬疑·灵异', children: ['侦探推理', '诡秘悬疑', '民俗恐怖', '规则怪谈'] },
      { name: '诸天无限', channel: '男频', globalCategory: '玄幻·奇幻', children: ['诸天万界', '无限流', '综漫同人'] },
      { name: '轻小说', channel: '男频', globalCategory: '轻小说·二次元', children: ['二次元', '同人衍生', '轻松日常'] },
      { name: '古代言情', channel: '女频', globalCategory: '言情·情感', children: ['古典架空', '宫闱宅斗', '穿越奇情'] },
      { name: '现代言情', channel: '女频', globalCategory: '言情·情感', children: ['都市生活', '豪门世家', '娱乐明星', '婚恋情缘'] },
      { name: '浪漫青春', channel: '女频', globalCategory: '言情·情感', children: ['青春校园', '爱情理想'] },
      { name: '幻想言情', channel: '女频', globalCategory: '言情·情感', children: ['玄幻言情', '仙侠奇缘', '现代魔法'] },
      { name: '悬疑推理', channel: '女频', globalCategory: '悬疑·灵异', children: ['现代悬疑', '古代悬疑', '悬疑推理'] },
      { name: '科幻空间', channel: '女频', globalCategory: '科幻·末世', children: ['星际恋歌', '末世危机', '时空穿梭'] },
      { name: '二次元', channel: '女频', globalCategory: '轻小说·二次元', children: ['二次元', '同人衍生', '轻小说'] },
    ],
  },

  qimao: {
    platform: 'qimao',
    source: '七猫免费小说作者专区投稿分类口径（男频/女频分栏）' + MODELED,
    verified: 'modeled',
    groups: [
      { name: '都市', channel: '男频', globalCategory: '都市·现实', children: ['都市', '都市脑洞', '都市高武', '赘婿逆袭', '战神归来', '神豪'] },
      { name: '玄幻', channel: '男频', globalCategory: '玄幻·奇幻', children: ['玄幻', '东方玄幻', '异世大陆', '无敌流', '领主种田'] },
      { name: '仙侠', channel: '男频', globalCategory: '武侠·仙侠', children: ['仙侠', '修真', '凡人流'] },
      { name: '武侠', channel: '男频', globalCategory: '武侠·仙侠', children: ['武侠', '传统武侠'] },
      { name: '历史', channel: '男频', globalCategory: '历史·军事', children: ['历史', '架空历史', '秦汉三国', '民国'] },
      { name: '军事', channel: '男频', globalCategory: '历史·军事', children: ['军事', '抗战烽火'] },
      { name: '科幻', channel: '男频', globalCategory: '科幻·末世', children: ['科幻', '末世', '星际'] },
      { name: '悬疑', channel: '男频', globalCategory: '悬疑·灵异', children: ['悬疑', '灵异', '规则怪谈', '民俗志怪'] },
      { name: '游戏', channel: '男频', globalCategory: '游戏·竞技', children: ['游戏', '电子竞技'] },
      { name: '体育', channel: '男频', globalCategory: '游戏·竞技', children: ['体育', '足球', '篮球'] },
      { name: '现代言情', channel: '女频', globalCategory: '言情·情感', children: ['现代言情', '总裁', '甜宠', '虐恋', '豪门'] },
      { name: '古代言情', channel: '女频', globalCategory: '言情·情感', children: ['古代言情', '宫斗', '宅斗', '穿越', '重生'] },
      { name: '幻想言情', channel: '女频', globalCategory: '言情·情感', children: ['幻想言情', '玄幻言情', '仙侠奇缘'] },
      { name: '浪漫青春', channel: '女频', globalCategory: '言情·情感', children: ['浪漫青春', '校园'] },
      { name: '悬疑推理', channel: '女频', globalCategory: '悬疑·灵异', children: ['悬疑推理', '现代悬疑'] },
      { name: '科幻空间', channel: '女频', globalCategory: '科幻·末世', children: ['科幻空间', '末世言情'] },
    ],
  },

  jinjiang: {
    platform: 'jinjiang',
    source: '晋江文学城投稿分类口径（按情感向而非男频女频切）' + MODELED,
    verified: 'modeled',
    groups: [
      { name: '古代言情', channel: '言情', globalCategory: '言情·情感', children: ['古代言情', '宫廷侯爵', '宅斗宫斗', '古典架空', '穿越重生'] },
      { name: '现代言情', channel: '言情', globalCategory: '言情·情感', children: ['现代言情', '都市情缘', '豪门总裁', '婚恋', '娱乐圈'] },
      { name: '幻想言情', channel: '言情', globalCategory: '言情·情感', children: ['玄幻言情', '仙侠奇缘', '奇幻言情', '末世言情'] },
      { name: '浪漫青春', channel: '言情', globalCategory: '言情·情感', children: ['青春校园', '爱情理想', '成长'] },
      { name: '悬疑推理', channel: '言情', globalCategory: '悬疑·灵异', children: ['现代悬疑', '古代悬疑', '悬疑推理'] },
      { name: '科幻空间', channel: '言情', globalCategory: '科幻·末世', children: ['星际恋歌', '时空穿梭', '未来世界'] },
      { name: '纯爱', channel: '纯爱', globalCategory: null, children: ['古代纯爱', '现代纯爱', '幻想纯爱', '娱乐圈纯爱'] },
      { name: '百合', channel: '百合', globalCategory: null, children: ['现代百合', '古代百合', '幻想百合'] },
      { name: '无CP', channel: '无CP', globalCategory: null, children: ['无CP剧情', '无CP悬疑', '无CP奇幻'] },
      { name: '衍生', channel: '衍生', globalCategory: null, children: ['同人衍生', '综漫', '影视同人'] },
    ],
  },

  zhihu: {
    platform: 'zhihu',
    source: '知乎盐选故事投稿分类口径（短篇向）' + MODELED,
    verified: 'modeled',
    groups: [
      { name: '现实故事', channel: '通用', globalCategory: '都市·现实', children: ['现实故事', '职场故事', '行业故事', '社会话题'] },
      { name: '悬疑推理', channel: '通用', globalCategory: '悬疑·灵异', children: ['悬疑推理', '犯罪故事', '脑洞悬疑', '规则怪谈'] },
      { name: '情感故事', channel: '通用', globalCategory: '言情·情感', children: ['情感故事', '婚姻家庭', '青春故事'] },
      { name: '脑洞故事', channel: '通用', globalCategory: '科幻·末世', children: ['脑洞故事', '科幻故事', '设定系'] },
      { name: '古风故事', channel: '通用', globalCategory: '历史·军事', children: ['古风故事', '古代权谋', '江湖武侠'] },
      { name: '奇幻故事', channel: '通用', globalCategory: '玄幻·奇幻', children: ['奇幻故事', '玄幻故事', '怪谈志异'] },
    ],
  },

  douyin: {
    platform: 'douyin',
    source: '抖音故事投稿分类口径（短视频向超短篇）' + MODELED,
    verified: 'modeled',
    groups: [
      { name: '都市情感', channel: '通用', globalCategory: '言情·情感', children: ['都市情感', '婚姻家庭', '情感反转'] },
      { name: '家庭伦理', channel: '通用', globalCategory: '都市·现实', children: ['家庭伦理', '婆媳关系', '亲情故事'] },
      { name: '悬疑反转', channel: '通用', globalCategory: '悬疑·灵异', children: ['悬疑反转', '犯罪故事', '规则怪谈'] },
      { name: '古风虐恋', channel: '通用', globalCategory: '言情·情感', children: ['古风虐恋', '宫廷故事', '江湖情仇'] },
      { name: '战神逆袭', channel: '通用', globalCategory: '都市·现实', children: ['战神逆袭', '赘婿逆袭', '强者归来'] },
      { name: '爽文甜宠', channel: '通用', globalCategory: '言情·情感', children: ['甜宠', '先婚后爱', '豪门'] },
    ],
  },

  xiaohongshu: {
    platform: 'xiaohongshu',
    source: '小红书故事投稿分类口径（女性向短篇）' + MODELED,
    verified: 'modeled',
    groups: [
      { name: '情感故事', channel: '女性向', globalCategory: '言情·情感', children: ['情感故事', '恋爱故事', '婚姻故事'] },
      { name: '成长故事', channel: '女性向', globalCategory: '都市·现实', children: ['成长故事', '女性成长', '青春故事'] },
      { name: '职场故事', channel: '女性向', globalCategory: '都市·现实', children: ['职场故事', '职场成长', '行业故事'] },
      { name: '生活故事', channel: '女性向', globalCategory: '都市·现实', children: ['生活故事', '家庭故事', '治愈故事'] },
    ],
  },

  // 这里曾有「规则怪谈」的第二份伪平台分类树，后果是把题材标签误当成投稿平台的分类；
  // 已删除。选择真实平台后再按该平台的分类与标签执行。
};

/**
 * 平台分类实测体量 —— 「按平台分类执行」里可核验的那一半。
 *
 * 为什么不并进 platform-benchmarks.ts：那里是【平台级】基准（该平台整体怎么写、单章多少字、
 * 爽点密度，来源是平台公开规则与行业基准）；这里是【分类级】实测（该平台这一个投稿分类的头部
 * 作品体量分布，来源是可复现的榜单采集）。层级不同、来源不同，合并会把「平台硬规则」和
 * 「某次采集的分布」混成一份，谁也说不清哪条是必须遵守的、哪条只是观察值。
 *
 * 采集口径（可复现；禁止凭印象填）：番茄官网榜单页 fanqienovel.com/rank 的每个分类榜单，
 * 取榜单当页前 10 部的正文字数，记 min / 中位数 / max。样本是「榜单头部」而不是随机抽样，
 * 所以这里只说「头部区间」，不声称「全平台分布」。
 * 未采集的平台/分类一律没有条目——缺失就是缺失，不许用别的平台、别的分类的数字顶上。
 */
export interface PlatformCategoryMetric {
  /** 样本数（榜单当页抓到的条数） */
  samples: number;
  /** 样本最小正文（字） */
  min: number;
  /** 样本中位正文（字） */
  median: number;
  /** 样本最大正文（字） */
  max: number;
}

export interface PlatformCategoryMetricTable {
  /** 采集来源与口径，必须写明 */
  source: string;
  /** 采集日期（YYYY-MM-DD） */
  capturedAt: string;
  /** key = 频道·平台分类名（与 availableGroups 同一写法；含频道是因为同名分类跨频道存在） */
  byCategory: Record<string, PlatformCategoryMetric>;
  /**
   * 本表实测的是哪种成稿单元 —— 这是事实声明，不是分类标签：番茄榜单是【连载长篇】榜，
   * 短篇（短故事）是另一条产品线，其分类体量尚未采集。执行标准的分类体量判据必须据此判断
   * 「本次实测适不适用于本项目」，不得把长篇区间套到短篇头上（那属于「拿别的口径顶上」）。
   */
  measureUnit: PlatformCategoryMetricUnit;
}

/** 实测口径对应的成稿单元。新增单元之前必须先有真实采集，不得先占位后补数。 */
export type PlatformCategoryMetricUnit = 'long_novel' | 'short_story';

export const PLATFORM_CATEGORY_METRICS: Record<string, PlatformCategoryMetricTable> = {
  fanqie: {
    source: '番茄小说官网榜单页 fanqienovel.com/rank：各分类榜单当页前 10 部的正文字数（榜单为连载长篇，短篇/短故事不在本表口径内）',
    capturedAt: '2026-09-22',
    measureUnit: 'long_novel',
    byCategory: {
      '男频·西方奇幻': { samples: 10, min: 301791, median: 721098, max: 3952799 },
      '男频·东方仙侠': { samples: 10, min: 553132, median: 1305399, max: 8323357 },
      '男频·科幻末世': { samples: 10, min: 458694, median: 750887, max: 7043392 },
      '男频·都市日常': { samples: 10, min: 461658, median: 1373345, max: 7189662 },
      '男频·都市修真': { samples: 10, min: 374504, median: 964390, max: 6091140 },
      '男频·都市高武': { samples: 10, min: 352949, median: 3687843, max: 4263654 },
      '男频·历史古代': { samples: 10, min: 514338, median: 1491895, max: 6530321 },
      '男频·战神赘婿': { samples: 10, min: 598743, median: 3042077, max: 4457675 },
      '男频·都市种田': { samples: 10, min: 495569, median: 942064, max: 4054363 },
      '男频·传统玄幻': { samples: 10, min: 1879524, median: 6166972, max: 9719558 },
      '男频·历史脑洞': { samples: 10, min: 429769, median: 1186282, max: 3079531 },
      '男频·悬疑脑洞': { samples: 10, min: 507154, median: 1171083, max: 5021420 },
      '男频·都市脑洞': { samples: 10, min: 352642, median: 592825, max: 1222128 },
      '男频·玄幻脑洞': { samples: 10, min: 349474, median: 1338849, max: 6080642 },
      '男频·悬疑灵异': { samples: 10, min: 694482, median: 3832780, max: 9935201 },
      '男频·抗战谍战': { samples: 10, min: 344402, median: 703494, max: 2604763 },
      '男频·游戏体育': { samples: 10, min: 345775, median: 2595175, max: 5043800 },
      '男频·动漫衍生': { samples: 10, min: 370919, median: 614633, max: 3220154 },
      '男频·男频衍生': { samples: 10, min: 320277, median: 673437, max: 1130171 },
      '女频·古风世情': { samples: 10, min: 313965, median: 666473, max: 2683646 },
      '女频·科幻末世': { samples: 10, min: 317036, median: 920083, max: 1595624 },
      '女频·游戏体育': { samples: 10, min: 369298, median: 1063303, max: 3131287 },
      '女频·女频衍生': { samples: 10, min: 326888, median: 574125, max: 1039493 },
      '女频·玄幻言情': { samples: 10, min: 383328, median: 1899187, max: 3542601 },
      '女频·种田': { samples: 10, min: 341850, median: 1167916, max: 5238162 },
      '女频·年代': { samples: 10, min: 397282, median: 1081976, max: 1758910 },
      '女频·现言脑洞': { samples: 10, min: 301910, median: 1063406, max: 2454404 },
      '女频·宫斗宅斗': { samples: 10, min: 436525, median: 1003791, max: 1293301 },
      '女频·悬疑脑洞': { samples: 10, min: 495613, median: 1022841, max: 2068339 },
      '女频·古言脑洞': { samples: 10, min: 357659, median: 741030, max: 1309817 },
      '女频·快穿': { samples: 10, min: 364281, median: 729421, max: 1060090 },
      '女频·青春甜宠': { samples: 10, min: 302267, median: 392207, max: 979563 },
      '女频·星光璀璨': { samples: 10, min: 304165, median: 592392, max: 1318128 },
      '女频·女频悬疑': { samples: 10, min: 313821, median: 768146, max: 1371168 },
      '女频·职场婚恋': { samples: 10, min: 317051, median: 760548, max: 1379820 },
      '女频·豪门总裁': { samples: 10, min: 358685, median: 536722, max: 1598156 },
      '女频·民国言情': { samples: 10, min: 302207, median: 691795, max: 1029281 },
    },
  },
};

/**
 * 平台分类写作口径 —— 执行标准中「基调/文风/流派/视角」各维「按平台分类执行」时共用的唯一事实源。
 *
 * 为什么必须单独一张表，而不是并进 PLATFORM_CATEGORY_TREES 或 platform-benchmarks：
 *   TREES 回答「这本书投到该平台的哪个投稿分类」（硬结构，平台会改）；METRICS 只回答该分类的
 *   字数体量；platform-benchmarks 是平台级写作规则。三者都不含「这个分类的读者到底吃哪一套
 *   题材机制」。用户把基调/文风/流派/视角填成通用套话时，模型没有任何可执行依据——真正能当
 *   依据的，是平台自己给这个分类写的官方定义，以及这个分类头部作品实际挂的平台官方标签。
 *
 * 采集口径（可复现；禁止凭印象填）：番茄官网榜单页 fanqienovel.com/rank 每个分类榜单当页前 10 部，
 *   逐部读 fanqienovel.com/page/{bookId} 里平台下发的 categoryV2：
 *     - MainCategory:true 的那一项 = 该书所处的投稿分类，其 ExternalDesc = 平台官方分类定义；
 *     - 其余项 = 平台官方标签，其 ExternalDesc = 平台官方标签定义。
 *   topTags = 该分类头部样本里出现 >=2 次的平台官方标签，按出现次数降序；样本是「榜单头部」
 *   而不是随机抽样，所以这里说的是「头部口径」，不声称「全平台分布」。
 * 未采集的平台/分类一律没有条目——缺失就是缺失，不许用别的平台、别的分类的口径顶上。
 */
export interface PlatformCategoryTagSample {
  /** 平台官方标签名 */
  name: string;
  /** 该分类头部样本里挂这个标签的作品数 */
  samples: number;
  /** 平台官方对该标签的定义原文（categoryV2 的 ExternalDesc） */
  desc: string;
}

export interface PlatformCategoryWritingProfile {
  /** 该分类头部样本数 */
  samples: number;
  /** 平台官方对该投稿分类的定义原文（categoryV2 中 MainCategory:true 项的 ExternalDesc） */
  officialDesc: string;
  /** 该分类头部实际使用的平台官方标签（出现 >=2 次），按出现次数降序 */
  topTags: PlatformCategoryTagSample[];
}

export interface PlatformCategoryWritingProfileTable {
  /** 采集来源与口径，必须写明 */
  source: string;
  /** 采集日期（YYYY-MM-DD） */
  capturedAt: string;
  /** 榜单样本对应的成稿单元；这里曾把长篇榜单标签当成短篇标签，导致短篇选材与验收套用错误口径。 */
  measureUnit: PlatformCategoryMetricUnit;
  /** key = 频道·平台分类名（与 PLATFORM_CATEGORY_METRICS 同一写法；含频道是因为同名分类跨频道存在） */
  byCategory: Record<string, PlatformCategoryWritingProfile>;
}

export const PLATFORM_CATEGORY_WRITING_PROFILES: Record<string, PlatformCategoryWritingProfileTable> = {
  fanqie: {
    source:
      '番茄小说官网榜单页 fanqienovel.com/rank 各分类榜单前 10 部 → 书籍详情页 fanqienovel.com/page/{bookId} ' +
      '平台下发的 categoryV2（官方投稿分类定义 + 官方标签定义）',
    capturedAt: '2026-09-22',
    measureUnit: 'long_novel',
    byCategory: {
      '男频·科幻末世': {
        samples: 10,
        officialDesc: '在科学的基础上，人类真的很敢想',
        topTags: [
          { name: '末世', samples: 7, desc: '末日来临的极端世界' },
          { name: '求生', samples: 7, desc: '为了生存能做些什么？' },
          { name: '穿越', samples: 4, desc: '平行世界，爱能穿越' },
          { name: '开局', samples: 4, desc: '叮！您的大礼包已经到账' },
          { name: '末日求生', samples: 4, desc: '在恶劣环境中奋力崛起' },
          { name: '多女主', samples: 3, desc: '浪漫迭起的旅途' },
        ],
      },
      '男频·战神赘婿': {
        samples: 10,
        officialDesc: '让一让，无敌战神来了！',
        topTags: [
          { name: '都市', samples: 7, desc: '都市里还发生哪些神奇故事？' },
          { name: '打脸', samples: 6, desc: '看完整个心情都舒畅了' },
          { name: '单女主', samples: 3, desc: '拒绝后宫，女主只有一个' },
          { name: '无敌', samples: 3, desc: '过五关斩六将的无敌爽文' },
          { name: '赘婿', samples: 3, desc: '上门女婿大展宏图' },
          { name: '多女主', samples: 2, desc: '浪漫迭起的旅途' },
        ],
      },
      '男频·都市修真': {
        samples: 10,
        officialDesc: '我在都市学修仙',
        topTags: [
          { name: '都市', samples: 4, desc: '都市里还发生哪些神奇故事？' },
          { name: '穿越', samples: 3, desc: '平行世界，爱能穿越' },
          { name: '多女主', samples: 3, desc: '浪漫迭起的旅途' },
          { name: '神医', samples: 3, desc: '悬壶济世，妙手回春' },
          { name: '无敌', samples: 3, desc: '过五关斩六将的无敌爽文' },
          { name: '乡村', samples: 3, desc: '田园风光里的酸甜苦辣' },
        ],
      },
      '男频·玄幻脑洞': {
        samples: 10,
        officialDesc: '神通广大的主角们',
        topTags: [
          { name: '穿越', samples: 7, desc: '平行世界，爱能穿越' },
          { name: '架空', samples: 6, desc: '架空世界看我为所欲为' },
          { name: '东方玄幻', samples: 5, desc: '融合东方经典传统文化' },
          { name: '玄幻', samples: 5, desc: '一起进入奇幻世界' },
          { name: '无敌', samples: 3, desc: '过五关斩六将的无敌爽文' },
          { name: '系统', samples: 3, desc: '绑定系统后获得金手指' },
        ],
      },
      '男频·传统玄幻': {
        samples: 10,
        officialDesc: '入坑玄幻的经典小说',
        topTags: [
          { name: '架空', samples: 9, desc: '架空世界看我为所欲为' },
          { name: '东方玄幻', samples: 8, desc: '融合东方经典传统文化' },
          { name: '玄幻', samples: 7, desc: '一起进入奇幻世界' },
          { name: '穿越', samples: 6, desc: '平行世界，爱能穿越' },
          { name: '无敌', samples: 4, desc: '过五关斩六将的无敌爽文' },
          { name: '开局', samples: 2, desc: '叮！您的大礼包已经到账' },
        ],
      },
      '男频·都市日常': {
        samples: 10,
        officialDesc: '轻松愉快的都市二三事',
        topTags: [
          { name: '多女主', samples: 5, desc: '浪漫迭起的旅途' },
          { name: '穿越', samples: 4, desc: '平行世界，爱能穿越' },
          { name: '都市', samples: 4, desc: '都市里还发生哪些神奇故事？' },
          { name: '魂穿', samples: 4, desc: '熟悉的灵魂和我的新身体' },
          { name: '穿书', samples: 2, desc: '穿书之后，怎么不按套路出牌？' },
          { name: '单女主', samples: 2, desc: '拒绝后宫，女主只有一个' },
        ],
      },
      '男频·都市脑洞': {
        samples: 10,
        officialDesc: '脑洞大开的都市离奇故事',
        topTags: [
          { name: '系统', samples: 6, desc: '绑定系统后获得金手指' },
          { name: '都市', samples: 5, desc: '都市里还发生哪些神奇故事？' },
          { name: '多女主', samples: 5, desc: '浪漫迭起的旅途' },
          { name: '重生', samples: 4, desc: '看主角重生后改变命途' },
          { name: '穿越', samples: 2, desc: '平行世界，爱能穿越' },
          { name: '魂穿', samples: 2, desc: '熟悉的灵魂和我的新身体' },
        ],
      },
      '男频·都市种田': {
        samples: 10,
        officialDesc: '苦心经营终成世界首富',
        topTags: [
          { name: '都市', samples: 7, desc: '都市里还发生哪些神奇故事？' },
          { name: '系统', samples: 5, desc: '绑定系统后获得金手指' },
          { name: '乡村', samples: 5, desc: '田园风光里的酸甜苦辣' },
          { name: '重生', samples: 5, desc: '看主角重生后改变命途' },
          { name: '发家致富', samples: 4, desc: '拼搏百天，终成一代传奇' },
          { name: '钓鱼', samples: 3, desc: '体验悠闲的海边生活' },
        ],
      },
      '男频·历史脑洞': {
        samples: 10,
        officialDesc: '穿越到古代有金手指',
        topTags: [
          { name: '穿越', samples: 6, desc: '平行世界，爱能穿越' },
          { name: '历史', samples: 5, desc: '以史为镜，可以知兴替' },
          { name: '大唐', samples: 4, desc: '繁华世间，绝美大唐' },
          { name: '系统', samples: 4, desc: '绑定系统后获得金手指' },
          { name: '魂穿', samples: 3, desc: '熟悉的灵魂和我的新身体' },
          { name: '明朝', samples: 3, desc: '明朝那些故事' },
        ],
      },
      '男频·历史古代': {
        samples: 10,
        officialDesc: '立足历史大框架',
        topTags: [
          { name: '穿越', samples: 10, desc: '平行世界，爱能穿越' },
          { name: '历史', samples: 7, desc: '以史为镜，可以知兴替' },
          { name: '魂穿', samples: 6, desc: '熟悉的灵魂和我的新身体' },
          { name: '架空', samples: 3, desc: '架空世界看我为所欲为' },
          { name: '三国', samples: 3, desc: '三国之乱，烽火连天不休' },
          { name: '争霸', samples: 3, desc: '天下风云，任君搅动' },
        ],
      },
      '男频·抗战谍战': {
        samples: 10,
        officialDesc: '用密电与胆识编织的秘密棋局',
        topTags: [
          { name: '穿越', samples: 8, desc: '平行世界，爱能穿越' },
          { name: '系统', samples: 6, desc: '绑定系统后获得金手指' },
          { name: '都市', samples: 5, desc: '都市里还发生哪些神奇故事？' },
          { name: '魂穿', samples: 3, desc: '熟悉的灵魂和我的新身体' },
          { name: '重生', samples: 2, desc: '看主角重生后改变命途' },
        ],
      },
      '男频·悬疑脑洞': {
        samples: 10,
        officialDesc: '环环相扣挑战心理极限',
        topTags: [
          { name: '灵异', samples: 9, desc: '前方高能！肾上腺素飙升' },
          { name: '穿越', samples: 6, desc: '平行世界，爱能穿越' },
          { name: '系统', samples: 5, desc: '绑定系统后获得金手指' },
          { name: '悬疑', samples: 5, desc: '烧脑推理强力来袭' },
          { name: '风水秘术', samples: 3, desc: '蕴含民俗、风水、道术、旁门之类神秘秘术元素的小说' },
          { name: '副本', samples: 3, desc: '叮！您的副本任务已开启' },
        ],
      },
      '男频·动漫衍生': {
        samples: 10,
        officialDesc: '游戏动漫同人文',
        topTags: [
          { name: '穿越', samples: 10, desc: '平行世界，爱能穿越' },
          { name: '衍生', samples: 10, desc: '衍生作品' },
          { name: '二次元', samples: 7, desc: '欢迎来到二次元的世界' },
          { name: '多女主', samples: 3, desc: '浪漫迭起的旅途' },
          { name: '火影', samples: 3, desc: '为成为最强而努力' },
          { name: '搞笑轻松', samples: 2, desc: '搞笑沙雕文风，让你轻松一刻' },
        ],
      },
      '男频·游戏体育': {
        samples: 10,
        officialDesc: '竞技战场欢迎所有人',
        topTags: [
          { name: '穿越', samples: 7, desc: '平行世界，爱能穿越' },
          { name: '体育', samples: 4, desc: '热血竞技无处不在' },
          { name: '开局', samples: 3, desc: '叮！您的大礼包已经到账' },
          { name: '求生', samples: 3, desc: '为了生存能做些什么？' },
          { name: '天才', samples: 3, desc: '天赋异禀主角的不凡人生' },
          { name: '网游', samples: 3, desc: '我在游戏里叱咤风云的日子' },
        ],
      },
      '男频·悬疑灵异': {
        samples: 10,
        officialDesc: '世上总藏着那些诡异事',
        topTags: [
          { name: '悬疑', samples: 7, desc: '烧脑推理强力来袭' },
          { name: '灵异', samples: 6, desc: '前方高能！肾上腺素飙升' },
          { name: '风水秘术', samples: 4, desc: '蕴含民俗、风水、道术、旁门之类神秘秘术元素的小说' },
          { name: '衍生', samples: 4, desc: '衍生作品' },
          { name: '穿越', samples: 3, desc: '平行世界，爱能穿越' },
          { name: '盗墓', samples: 3, desc: '共度地下寻宝之旅' },
        ],
      },
      '男频·都市高武': {
        samples: 10,
        officialDesc: '现代都市中，世界观中有灵气复苏、御兽、异能、修炼等各种超凡元素的非正常都市背景。',
        topTags: [
          { name: '穿越', samples: 9, desc: '平行世界，爱能穿越' },
          { name: '都市', samples: 7, desc: '都市里还发生哪些神奇故事？' },
          { name: '都市异能', samples: 3, desc: '都市传说之我有超能力' },
          { name: '灵气复苏', samples: 3, desc: '看天地异变能量崛起' },
          { name: '无敌', samples: 3, desc: '过五关斩六将的无敌爽文' },
          { name: '搞笑轻松', samples: 2, desc: '搞笑沙雕文风，让你轻松一刻' },
        ],
      },
      '男频·男频衍生': {
        samples: 10,
        officialDesc: '影视剧男频同人小说',
        topTags: [
          { name: '衍生', samples: 10, desc: '衍生作品' },
          { name: '穿越', samples: 8, desc: '平行世界，爱能穿越' },
          { name: '同人', samples: 5, desc: '他们的另一种可能由你书写' },
          { name: '仕途', samples: 2, desc: '燕雀安知鸿鹄之志' },
          { name: '斩神衍生', samples: 2, desc: '大夏境内，神明禁行' },
          { name: '综影视', samples: 2, desc: '3个及以上影视剧的同人文' },
        ],
      },
      '男频·东方仙侠': {
        samples: 10,
        officialDesc: '不走寻常路的仙侠传奇',
        topTags: [
          { name: '穿越', samples: 8, desc: '平行世界，爱能穿越' },
          { name: '东方玄幻', samples: 7, desc: '融合东方经典传统文化' },
          { name: '架空', samples: 6, desc: '架空世界看我为所欲为' },
          { name: '洪荒', samples: 4, desc: '来自上古神话的爱恨情仇' },
          { name: '奇幻仙侠', samples: 4, desc: '在幻想的世界里，修仙问道，学奥术魔法' },
          { name: '仙侠', samples: 4, desc: '不走寻常路的仙侠传奇' },
        ],
      },
      '男频·西方奇幻': {
        samples: 10,
        officialDesc: '在西方世界施展奥术与魔法',
        topTags: [
          { name: '穿越', samples: 10, desc: '平行世界，爱能穿越' },
          { name: '异世大陆', samples: 8, desc: '幻想世界的神奇大陆' },
          { name: '奇幻仙侠', samples: 7, desc: '在幻想的世界里，修仙问道，学奥术魔法' },
          { name: '玄幻', samples: 7, desc: '一起进入奇幻世界' },
          { name: '争霸', samples: 4, desc: '天下风云，任君搅动' },
          { name: '魂穿', samples: 3, desc: '熟悉的灵魂和我的新身体' },
        ],
      },
      '女频·科幻末世': {
        samples: 10,
        officialDesc: '在科学的基础上，人类真的很敢想',
        topTags: [
          { name: '穿越', samples: 5, desc: '平行世界，爱能穿越' },
          { name: '末世', samples: 5, desc: '末日来临的极端世界' },
          { name: '星际', samples: 4, desc: '星际穿越，见证奇迹' },
          { name: '重生', samples: 4, desc: '看主角重生后改变命途' },
          { name: '空间', samples: 3, desc: '主角携带随身空间' },
          { name: '甜宠', samples: 3, desc: '我看完已经傻笑三个小时了' },
        ],
      },
      '女频·种田': {
        samples: 10,
        officialDesc: '朴实生活，在田间打造金山银山',
        topTags: [
          { name: '古代言情', samples: 10, desc: '独行此世间，幸得一心人' },
          { name: '穿越', samples: 8, desc: '平行世界，爱能穿越' },
          { name: '乡村', samples: 5, desc: '田园风光里的酸甜苦辣' },
          { name: '魂穿', samples: 2, desc: '熟悉的灵魂和我的新身体' },
          { name: '今穿古', samples: 2, desc: '在古代我疯狂输出' },
          { name: '空间', samples: 2, desc: '主角携带随身空间' },
        ],
      },
      '女频·快穿': {
        samples: 10,
        officialDesc: '在不同世界左右横跳真爽',
        topTags: [
          { name: '幻想言情', samples: 6, desc: '超越时空种族与你相拥' },
          { name: '系统', samples: 6, desc: '绑定系统后获得金手指' },
          { name: '无CP', samples: 4, desc: '恋爱不是生活的全部' },
          { name: '甜宠', samples: 3, desc: '我看完已经傻笑三个小时了' },
          { name: '一见钟情', samples: 3, desc: '只是在人群中多看了你一眼' },
          { name: '1v1', samples: 2, desc: '我的世界，从来只有你一个' },
        ],
      },
      '女频·年代': {
        samples: 10,
        officialDesc: '穿越到旧年代创造新财富',
        topTags: [
          { name: '现代言情', samples: 10, desc: '爱你是我做过最正确的事' },
          { name: '空间', samples: 4, desc: '主角携带随身空间' },
          { name: '乡村', samples: 4, desc: '田园风光里的酸甜苦辣' },
          { name: '家长里短', samples: 2, desc: '叽叽喳喳的幸福日常' },
          { name: '年龄差', samples: 2, desc: '年龄是/不是问题？' },
          { name: '甜宠', samples: 2, desc: '我看完已经傻笑三个小时了' },
        ],
      },
      '女频·宫斗宅斗': {
        samples: 10,
        officialDesc: '霸气女主的生存之道',
        topTags: [
          { name: '古代言情', samples: 10, desc: '独行此世间，幸得一心人' },
          { name: '穿越', samples: 3, desc: '平行世界，爱能穿越' },
          { name: '打脸', samples: 2, desc: '看完整个心情都舒畅了' },
          { name: '独宠', samples: 2, desc: '弱水三千 只取一瓢饮' },
          { name: '古色古香', samples: 2, desc: '今月也曾照古人' },
          { name: '空间', samples: 2, desc: '主角携带随身空间' },
        ],
      },
      '女频·玄幻言情': {
        samples: 10,
        officialDesc: '八荒六合，为爱俯身',
        topTags: [
          { name: '穿越', samples: 6, desc: '平行世界，爱能穿越' },
          { name: '幻想言情', samples: 6, desc: '超越时空种族与你相拥' },
          { name: '今穿古', samples: 3, desc: '在古代我疯狂输出' },
          { name: '系统', samples: 3, desc: '绑定系统后获得金手指' },
          { name: '1v1', samples: 2, desc: '我的世界，从来只有你一个' },
          { name: '魂穿', samples: 2, desc: '熟悉的灵魂和我的新身体' },
        ],
      },
      '女频·古言脑洞': {
        samples: 10,
        officialDesc: '穿越后拿个金手指再谈恋爱',
        topTags: [
          { name: '古代言情', samples: 10, desc: '独行此世间，幸得一心人' },
          { name: '系统', samples: 7, desc: '绑定系统后获得金手指' },
          { name: '穿书', samples: 3, desc: '穿书之后，怎么不按套路出牌？' },
          { name: '穿越', samples: 3, desc: '平行世界，爱能穿越' },
          { name: '反派', samples: 3, desc: '可爱炫酷又迷人的反派主角' },
          { name: '幻想言情', samples: 2, desc: '超越时空种族与你相拥' },
        ],
      },
      '女频·现言脑洞': {
        samples: 10,
        officialDesc: '恋爱，但不走寻常路',
        topTags: [
          { name: '现代言情', samples: 10, desc: '爱你是我做过最正确的事' },
          { name: '系统', samples: 7, desc: '绑定系统后获得金手指' },
          { name: '甜宠', samples: 3, desc: '我看完已经傻笑三个小时了' },
          { name: '重生', samples: 3, desc: '看主角重生后改变命途' },
          { name: '1v1', samples: 2, desc: '我的世界，从来只有你一个' },
          { name: '穿书', samples: 2, desc: '穿书之后，怎么不按套路出牌？' },
        ],
      },
      '女频·悬疑脑洞': {
        samples: 10,
        officialDesc: '环环相扣挑战心理极限',
        topTags: [
          { name: '灵异', samples: 9, desc: '前方高能！肾上腺素飙升' },
          { name: '悬疑', samples: 8, desc: '烧脑推理强力来袭' },
          { name: '穿越', samples: 7, desc: '平行世界，爱能穿越' },
          { name: '系统', samples: 7, desc: '绑定系统后获得金手指' },
          { name: '衍生', samples: 4, desc: '衍生作品' },
          { name: '盗墓', samples: 3, desc: '共度地下寻宝之旅' },
        ],
      },
      '女频·星光璀璨': {
        samples: 10,
        officialDesc: '千金总裁的极限拉扯',
        topTags: [
          { name: '现代言情', samples: 10, desc: '爱你是我做过最正确的事' },
          { name: '娱乐圈', samples: 6, desc: '感受一下娱乐圈的灯红酒绿' },
          { name: '明星', samples: 4, desc: '娱乐圈恋爱指南' },
          { name: '直播', samples: 4, desc: '围观主播的日常生活' },
          { name: '穿越', samples: 2, desc: '平行世界，爱能穿越' },
          { name: '打脸', samples: 2, desc: '看完整个心情都舒畅了' },
        ],
      },
      '女频·游戏体育': {
        samples: 10,
        officialDesc: '竞技战场欢迎所有人',
        topTags: [
          { name: '穿越', samples: 3, desc: '平行世界，爱能穿越' },
          { name: '惊悚游戏', samples: 2, desc: '莫名进入惊悚游戏，还好我是主角' },
          { name: '无限流', samples: 2, desc: '无限闯关，下个任务是什么？' },
          { name: '无CP', samples: 2, desc: '恋爱不是生活的全部' },
          { name: '系统', samples: 2, desc: '绑定系统后获得金手指' },
          { name: '重生', samples: 2, desc: '看主角重生后改变命途' },
        ],
      },
      '女频·女频悬疑': {
        samples: 10,
        officialDesc: '迷雾未散 步步向你',
        topTags: [
          { name: '灵异', samples: 8, desc: '前方高能！肾上腺素飙升' },
          { name: '悬疑', samples: 8, desc: '烧脑推理强力来袭' },
          { name: '悬疑恋爱', samples: 8, desc: '迷雾未散步步向你' },
          { name: '衍生', samples: 6, desc: '衍生作品' },
          { name: '盗墓', samples: 4, desc: '共度地下寻宝之旅' },
          { name: '风水秘术', samples: 4, desc: '蕴含民俗、风水、道术、旁门之类神秘秘术元素的小说' },
        ],
      },
      '女频·豪门总裁': {
        samples: 10,
        officialDesc: '集团大boss偏偏爱上我',
        topTags: [
          { name: '现代言情', samples: 9, desc: '爱你是我做过最正确的事' },
          { name: '双洁', samples: 6, desc: '一生一世一双人' },
          { name: '位尊权重', samples: 6, desc: '男主人设出身京圈，本身背景雄厚，拥有强大势力、财富，地位举足轻重，多设定与女主身份差距悬殊，但是为爱俯身低头' },
          { name: '豪门世家', samples: 5, desc: '总裁，夫人她竟然......' },
          { name: '1v1', samples: 2, desc: '我的世界，从来只有你一个' },
          { name: '大佬', samples: 2, desc: '能力超群 权势滔天' },
        ],
      },
      '女频·青春甜宠': {
        samples: 10,
        officialDesc: '青春甜宠',
        topTags: [
          { name: '现代言情', samples: 10, desc: '爱你是我做过最正确的事' },
          { name: '双洁', samples: 5, desc: '一生一世一双人' },
          { name: '校园', samples: 5, desc: '校园里没说完的青春' },
          { name: '青梅竹马', samples: 3, desc: '上天欠我一个青梅竹马' },
          { name: '暗恋', samples: 2, desc: '一直默默站在你身后' },
          { name: '豪门世家', samples: 2, desc: '总裁，夫人她竟然......' },
        ],
      },
      '女频·职场婚恋': {
        samples: 10,
        officialDesc: '工作第二 恋爱要紧',
        topTags: [
          { name: '现代言情', samples: 10, desc: '爱你是我做过最正确的事' },
          { name: '甜宠', samples: 4, desc: '我看完已经傻笑三个小时了' },
          { name: '家长里短', samples: 3, desc: '叽叽喳喳的幸福日常' },
          { name: '年龄差', samples: 3, desc: '年龄是/不是问题？' },
          { name: '双洁', samples: 3, desc: '一生一世一双人' },
          { name: '天作之合', samples: 2, desc: '全天下你俩最配' },
        ],
      },
      '女频·女频衍生': {
        samples: 10,
        officialDesc: '影视剧或古籍女频同人小说',
        topTags: [
          { name: '衍生', samples: 9, desc: '衍生作品' },
          { name: '穿越', samples: 7, desc: '平行世界，爱能穿越' },
          { name: '幻想言情', samples: 2, desc: '超越时空种族与你相拥' },
          { name: '天才', samples: 2, desc: '天赋异禀主角的不凡人生' },
          { name: '同人', samples: 2, desc: '他们的另一种可能由你书写' },
          { name: '系统', samples: 2, desc: '绑定系统后获得金手指' },
        ],
      },
      '女频·民国言情': {
        samples: 10,
        officialDesc: '民国背景的女频作品',
        topTags: [
          { name: '民国', samples: 10, desc: '回到那个风华绝代的时期' },
          { name: '现代言情', samples: 9, desc: '爱你是我做过最正确的事' },
          { name: '穿越', samples: 6, desc: '平行世界，爱能穿越' },
          { name: '同人', samples: 4, desc: '他们的另一种可能由你书写' },
          { name: '1v1', samples: 2, desc: '我的世界，从来只有你一个' },
          { name: '风水秘术', samples: 2, desc: '蕴含民俗、风水、道术、旁门之类神秘秘术元素的小说' },
        ],
      },
      '女频·古风世情': {
        samples: 10,
        officialDesc: '古代女子的谋略与风华',
        topTags: [
          { name: '古代言情', samples: 10, desc: '独行此世间，幸得一心人' },
          { name: '古言权谋', samples: 10, desc: '古代女子的谋略与风华' },
          { name: '穿越', samples: 3, desc: '平行世界，爱能穿越' },
          { name: '魂穿', samples: 3, desc: '熟悉的灵魂和我的新身体' },
          { name: '1v1', samples: 2, desc: '我的世界，从来只有你一个' },
          { name: '今穿古', samples: 2, desc: '在古代我疯狂输出' },
        ],
      },
    },
  },
};

/** 取某平台某投稿分类的写作口径；没采集过返回 null（调用方必须如实写「未核实」，不得拿别的口径顶）。 */
export function platformCategoryWritingProfile(
  platform: string | null | undefined,
  channel: string | null | undefined,
  name: string | null | undefined,
  projectType?: string | null,
): PlatformCategoryWritingProfile | null {
  const table = PLATFORM_CATEGORY_WRITING_PROFILES[String(platform ?? '').trim()];
  if (!table) return null;
  if (projectType && table.measureUnit !== projectType) return null;
  return table.byCategory[String(channel ?? '').trim() + '·' + String(name ?? '').trim()] || null;
}

/**
 * 分类级写作口径的一句话证据（完整版）—— 执行标准「分类」维度用它，其余各维按平台分类执行时也复用它。
 * 没有实测数据时返回空串：调用方据此如实写「未核实」，绝不许编造或用别的分类的口径顶上。
 */
export function platformCategoryWritingNote(
  platform: string | null | undefined,
  v: ResolvedPlatformCategory,
  projectType?: string | null,
): string {
  const table = PLATFORM_CATEGORY_WRITING_PROFILES[String(platform ?? '').trim()];
  if (!table || (projectType && table.measureUnit !== projectType)) return '';
  const profile = platformCategoryWritingProfile(platform, v.channel, v.platformGroup, projectType);
  if (!profile) return '';
  const tags = profile.topTags
    .map(t => t.name + ' ' + t.samples + '/' + profile.samples + '（' + t.desc + '）')
    .join('、');
  return '该平台分类「' + v.channel + '·' + v.platformGroup + '」的平台官方定义：' + profile.officialDesc
    + '；该分类头部实测（采集于 ' + table.capturedAt + '，样本 ' + profile.samples + ' 部）头部作品挂的平台官方标签：'
    + (tags || '（无）');
}

/** 各维「按平台分类执行」用的紧凑版证据：官方定义 + 头部前 3 个官方标签，避免每维重复整段。 */
export function platformCategoryWritingBrief(
  platform: string | null | undefined,
  v: ResolvedPlatformCategory,
  projectType?: string | null,
): string {
  const table = PLATFORM_CATEGORY_WRITING_PROFILES[String(platform ?? '').trim()];
  if (!table || (projectType && table.measureUnit !== projectType)) return '';
  const profile = platformCategoryWritingProfile(platform, v.channel, v.platformGroup, projectType);
  if (!profile) return '';
  const top = profile.topTags.slice(0, 3)
    .map(t => t.name + ' ' + t.samples + '/' + profile.samples)
    .join('、');
  return '平台分类「' + v.channel + '·' + v.platformGroup + '」官方定义：' + profile.officialDesc
    + '；该分类头部前 3 官方标签：' + (top || '（无）');
}

/**
 * 取某平台的分类体量口径表；未采集返回 null。
 * 表里带 measureUnit，调用方据此判断「这份实测适不适用于本项目的成稿单元」——
 * 判断只在这一份数据里，不许在别处再写一遍「短篇不适用」的规则。
 */
export function platformCategoryMetricTable(
  platform: string | null | undefined,
): PlatformCategoryMetricTable | null {
  const key = String(platform ?? '').trim();
  if (!key) return null;
  return PLATFORM_CATEGORY_METRICS[key] || null;
}

/** 取某平台某投稿分类的实测体量；没采集过返回 null（调用方必须如实写「未核实」，不得拿别的数字顶）。 */
export function platformCategoryMetric(
  platform: string | null | undefined,
  channel: string | null | undefined,
  name: string | null | undefined,
): PlatformCategoryMetric | null {
  const table = platformCategoryMetricTable(platform);
  if (!table) return null;
  return table.byCategory[String(channel ?? '').trim() + '·' + String(name ?? '').trim()] || null;
}

/** 字数折算成「万字」，保留 1 位小数；展示口径全系统一份。 */
function toWan(chars: number): string {
  return (chars / 10000).toFixed(1) + ' 万';
}

export function formatCategoryWordScale(m: PlatformCategoryMetric): string {
  return toWan(m.min) + '–' + toWan(m.max) + ' 字（中位 ' + toWan(m.median) + ' 字）';
}

/**
 * 同一全局分类在平台侧可能拆成多个分类，同名分类还会跨频道出现（番茄「悬疑脑洞」男频女频各一个），
 * 所以归位候选按两级优先挑选，而不是取数组里第一个——数组顺序是平台展示顺序，不是归位规则，
 * 靠顺序隐式决定归位结果没人能核对：
 *   1) 频道一致：项目目标读者是男频/女频时，不该被归位到另一个频道的同名分类；
 *   2) globalDefault：该平台自己声明「这个全局分类在这个频道下最贴它」的那一个。
 * 两级都不命中时按平台展示顺序取第一个，并且仍然只是「归位到平台分类」，leafExact 保持 false。
 */
function pickCategoryCandidate(
  candidates: PlatformCategoryGroup[],
  channelHint: string | null | undefined,
): PlatformCategoryGroup | undefined {
  if (candidates.length === 0) return undefined;
  const hint = String(channelHint ?? '').trim();
  const inChannel = hint ? candidates.filter(g => g.channel === hint) : [];
  const pool = inChannel.length > 0 ? inChannel : candidates;
  return pool.find(g => g.globalDefault === true) || pool[0];
}

export interface ResolvedPlatformCategory {
  /** platform = 命中平台自身的投稿分类；global = 用户填的是全局分类，已归位到该平台大类 */
  matched: 'platform' | 'global';
  /** 归属频道（男频/女频/通用…） */
  channel: string;
  /** 平台投稿大类 */
  platformGroup: string;
  /** 平台投稿子分类（作者投稿时实际要选的那一项） */
  platformLeaf: string;
  /**
   * 子分类是否精确命中该平台的投稿子分类。
   * false = 平台侧没有同名子分类，只归位到大类——此时【不得】假装子分类也对上了。
   */
  leafExact: boolean;
  /** 对应全局大类；null = 平台独有 */
  globalCategory: string | null;
}

export type PlatformCategoryResolution =
  | { status: 'resolved'; value: ResolvedPlatformCategory }
  | { status: 'no_tree' }
  | { status: 'unmapped'; reason: string; availableGroups: string[] };

/** 取某平台的投稿分类树；未建模的平台返回 null（调用方必须显式处理，不得静默套用别家分类）。 */
export function platformCategoryTree(platform: string | null | undefined): PlatformCategoryTree | null {
  const key = String(platform ?? '').trim();
  if (!key) return null;
  return PLATFORM_CATEGORY_TREES[key] || null;
}

/**
 * 某平台投稿分类树里真实使用的频道清单（去重、保持平台展示顺序）。
 *
 * 为什么必须从平台树派生：频道取值是按平台而定的 —— 番茄只有 男频/女频，起点、晋江等平台还有
 * 纯爱/百合/无CP/女性向/言情/衍生/通用。前端「目标读者」下拉若手写一份清单，必然出现
 * 「列出的频道该平台没有、该平台有的频道列不出来」，用户选中一个该平台不存在的频道后
 * 分类归位一定失败（resolvePlatformCategory 的 channelHint 解不出来），而界面看起来又是填好的。
 *
 * 未建模分类树的平台返回空数组：该平台没有频道概念，调用方必须显式处理成「不限定」，
 * 不得回退到别家平台的频道，也不得凭分类名猜频道。
 */
export function platformCategoryChannels(platform: string | null | undefined): string[] {
  const tree = platformCategoryTree(platform);
  if (!tree) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const group of tree.groups) {
    const channel = String(group.channel ?? '').trim();
    if (!channel || seen.has(channel)) continue;
    seen.add(channel);
    out.push(channel);
  }
  return out;
}

/**
 * 该平台投稿分类树的核实状态 —— 执行标准与前端展示共用同一句。
 *
 * 为什么必须暴露：7 个已建模发布平台里只有番茄是官网榜单页实测（verified='confirmed'），
 * 其余 6 个是按公开投稿口径建模（verified='modeled'）。只写「平台落位：起点 · 玄幻」
 * 会让作者以为这就是平台后台的投稿分类，而分类名与归类都可能对不上 —— 这是假精确，
 * 投错分类的代价由作者承担。所以落位必须带核实状态，未建模的平台返回 null
 * （调用方按 no_tree 处理，不得编造核实状态）。
 */
export function platformCategoryTreeVerification(
  platform: string | null | undefined,
  projectType?: string | null,
): { verified: 'modeled' | 'confirmed' | 'unit_unverified'; note: string } | null {
  const tree = platformCategoryTree(platform);
  if (!tree) return null;
  // 番茄分类名来自同一长篇榜单；这里曾将其 confirmed 状态不分长短篇展示，短篇会误以为投稿分类已核验。
  const sampleUnit = PLATFORM_CATEGORY_METRICS[String(platform ?? '').trim()]?.measureUnit;
  if (projectType && sampleUnit && sampleUnit !== projectType) {
    return {
      verified: 'unit_unverified',
      note: '当前分类名单采自该平台的连载长篇榜单；短篇/短故事投稿分类尚未单独核验，不能把这份名单当作短篇投稿后台的官方选项。',
    };
  }
  return {
    verified: tree.verified,
    note: tree.verified === 'confirmed'
      ? '该平台公开作品分类名与归类为官网榜单实测；作者后台投稿选项未直接核验（verified=confirmed 仅指公开分类名；' + tree.source + '）'
      : '该平台分类树为公开投稿口径建模、未经平台侧实测校正（verified=modeled）：分类名与归类可能与平台后台的投稿选项有出入，不得当成平台官方口径（' + tree.source + '）',
  };
}

/**
 * 创建界面的字段叫法只随已核验的来源变化。这里曾把第二份“平台投稿字段”名称直接写在两个前端表单里，
 * 后果是建模分类和作者自选流派也被展示成平台官方字段。新平台拿到后台证据后，只在此处增加映射。
 */
export function platformCreationFieldNames(
  platform: string | null | undefined,
  projectType: string | null | undefined,
  hasVerifiedTags: boolean,
): { category: string; genre: string | null } {
  const categoryStatus = platformCategoryTreeVerification(platform, projectType)?.verified;
  return {
    category: !platform || platform === 'generic' ? '故事分类'
      : platform === 'jinjiang' ? '文章类型'
      : categoryStatus === 'confirmed' ? '分类' : '投稿分类',
    genre: platform === 'fanqie' && projectType === 'long_novel' && hasVerifiedTags ? '作品标签' : null,
  };
}

/**
 * 创建时需要作者填写的已核实平台字段。这里曾把第二份通用六维表单当成各平台投稿表单，
 * 后果是番茄出现并不存在于其公开作品信息中的“基调/文风/叙事视角”，晋江“作品视角”又被
 * 错认成第一/第三人称。未取得后台字段证据的维度不冒充投稿项；已有项目中明确设置的
 * 创作约束仍由质量门执行，不能因为本表没有这个投稿字段就丢弃。
 */
export function platformSubmissionDimensions(
  platform: string | null | undefined,
  projectType: string | null | undefined,
  category: string | null | undefined,
  targetAudience?: string | null,
): Array<'platform' | 'category' | 'genre'> {
  const dimensions: Array<'platform' | 'category' | 'genre'> = ['platform', 'category'];
  if (platform === 'fanqie' && projectType === 'long_novel') {
    const resolved = resolvePlatformCategory(platform, category, targetAudience);
    if (resolved.status === 'resolved' && platformCategoryWritingProfile(
      platform, resolved.value.channel, resolved.value.platformGroup, projectType,
    )) dimensions.push('genre');
  }
  return dimensions;
}

/**
 * 投稿分类只在已核实的作品单元上按分类树归位。这里曾把番茄长篇榜单及其它平台的
 * 建模树直接用于短故事投稿校验，后果是用户填了后台真实分类仍被另一套假选项拦截。
 * 未核实的分类保留作者原值进入生成与质量检查，不冒称已通过后台选项校验。
 */
export function resolveSubmissionCategory(
  platform: string | null | undefined,
  category: string | null | undefined,
  projectType: string | null | undefined,
  channelHint?: string | null,
): PlatformCategoryResolution {
  if (platformCategoryTreeVerification(platform, projectType)?.verified !== 'confirmed') return { status: 'no_tree' };
  return resolvePlatformCategory(platform, category, channelHint);
}

/**
 * 分类选项的唯一身份：`频道·平台分类名`。
 *
 * 为什么需要它：番茄的 37 个投稿分类里有 3 个名字同时存在于男频与女频（科幻末世 / 悬疑脑洞 / 游戏体育）。
 * 只写分类名时前端拿不到「用户点的是哪一个」：下拉的 React key 会重复，按名字建的频道映射会被后写覆盖
 * （男频那一项显示成女频）；落库后也只能靠目标读者猜频道，而目标读者是可选项，没填就退化成平台展示顺序里的
 * 第一个 —— 等于在用户没有表达时静默换了频道。所以选项身份必须自带频道，且 resolver 必须能解析这个前缀。
 *
 * 同一份身份由三处共用：前端下拉选项、resolvePlatformCategory 的输入、以及 unmapped 时的可用大类清单。
 */
export function platformCategoryOptionId(channel: string, name: string): string {
  const c = String(channel ?? '').trim();
  const n = String(name ?? '').trim();
  return c ? c + '·' + n : n;
}

/**
 * 解析可选的「频道·」前缀。
 * 只有【该平台自己的频道名】才算前缀：分类名本身可能含「·」（「都市·现实」这种全局写法），
 * 硬按第一个「·」拆会把分类名拆坏；按平台的频道集合判定既不会误拆，也不需要一个写死的频道清单。
 */
function splitCategoryChannelPrefix(
  tree: PlatformCategoryTree,
  raw: string,
): { channel: string; body: string } {
  const dot = raw.indexOf('·');
  if (dot <= 0) return { channel: '', body: raw };
  const head = raw.slice(0, dot);
  if (!tree.groups.some(g => g.channel === head)) return { channel: '', body: raw };
  return { channel: head, body: raw.slice(dot + 1).trim() };
}

/**
 * 把用户填写的分类归位到「该平台的投稿分类」。
 *
 * 输入 category 支持两种写法（历史数据两种都存在）：
 *   「平台分类」  例如 都市高武
 *   「全局大类/子类」例如 都市·现实/都市
 * 两种都要能归位；都不属于该平台时返回 unmapped 并给出该平台可用大类，
 * 绝不静默接受一个不属于该平台的分类（那正是「按平台分类执行」落空的原因）。
 */
export function resolvePlatformCategory(
  platform: string | null | undefined,
  category: string | null | undefined,
  channelHint?: string | null,
): PlatformCategoryResolution {
  const tree = platformCategoryTree(platform);
  if (!tree) return { status: 'no_tree' };
  const raw = String(category ?? '').trim();
  const availableGroups = tree.groups.map(g => platformCategoryOptionId(g.channel, g.name));
  if (!raw) return { status: 'unmapped', reason: '分类为空', availableGroups };

  // 0) 可选的「频道·」前缀（选项身份就是它）。显式前缀优先于目标读者提示：
  //    目标读者是可选项，用没填的可选项去猜频道 = 在用户没表达时替用户选频道；前缀是用户在下拉里点的那一项，无歧义。
  const prefixed = splitCategoryChannelPrefix(tree, raw);
  const body = prefixed.body;
  const hint = prefixed.channel || String(channelHint ?? '').trim() || null;

  // 0b) 跨频道同名、且没有任何频道依据时，绝不按平台展示顺序挑一个频道：
  //     番茄的「悬疑脑洞」在男频与女频各有一项，挑错等于把作品放到另一个频道的分类标准下，
  //     而且此前没有任何地方会报出来（目标读者是可选项，没填时这一步就静默换了频道）。
  //     这里是阻断而不是警告：分类归属不明 = 分类这一维的执行标准没有落地。
  if (!prefixed.channel) {
    const spans = tree.groups.filter(g => g.name === body || g.children.includes(body) || g.globalCategory === body);
    const channels = Array.from(new Set(spans.map(g => g.channel)));
    if (channels.length > 1 && !(hint && channels.includes(hint))) {
      return {
        status: 'unmapped',
        reason: '「' + body + '」同时是 ' + channels.join(' 与 ') + ' 的投稿分类，只写分类名无法确定归属'
          + (hint ? '（频道提示「' + hint + '」下没有这个分类）' : '')
          + '：请改选带频道的投稿分类，或先指定目标读者',
        availableGroups,
      };
    }
  }

  if (!body) {
    return { status: 'unmapped', reason: '分类为空（只写了频道「' + prefixed.channel + '」）', availableGroups };
  }

  const slash = body.indexOf('/');
  const parentRaw = slash >= 0 ? body.slice(0, slash).trim() : '';
  const leafRaw = slash >= 0 ? body.slice(slash + 1).trim() : body;

  // 1) 平台写法「平台大类/平台子类」：父级就是该平台投稿大类名，直接锁定该大类。
  //    必须排在全局写法之前：同一个子分类名可能跨大类出现（「规则怪谈」既是番茄悬疑下的子类、
  //    也是垂类平台自己的一级分类），只有平台大类能消歧；锁不到就成了另一回事。
  //    子类填错时返回 unmapped 并指出它其实属于哪个大类，绝不静默换成别的子类。
  if (parentRaw) {
    const group = pickCategoryCandidate(tree.groups.filter(g => g.name === parentRaw), hint);
    if (group) {
      if (!leafRaw) {
        return {
          status: 'resolved',
          value: { matched: 'platform', channel: group.channel, platformGroup: group.name, platformLeaf: group.name, leafExact: false, globalCategory: group.globalCategory },
        };
      }
      if (group.children.includes(leafRaw)) {
        return {
          status: 'resolved',
          value: { matched: 'platform', channel: group.channel, platformGroup: group.name, platformLeaf: leafRaw, leafExact: true, globalCategory: group.globalCategory },
        };
      }
      const elsewhere = tree.groups.find(g => g.children.includes(leafRaw));
      return {
        status: 'unmapped',
        reason: elsewhere
          ? '「' + leafRaw + '」不属于' + parentRaw + '，它属于' + elsewhere.channel + '·' + elsewhere.name
          : '「' + leafRaw + '」不是' + parentRaw + '下的投稿子分类',
        availableGroups,
      };
    }
  }

  // 2) 全局写法「全局大类/子类」：按 globalCategory 归位到该平台大类。
  //    全局大类带着明确归属，比裸子类名精确（同一个子类名可能同时出现在两个大类下）。
  if (parentRaw) {
    const candidates = tree.groups.filter(g => g.globalCategory === parentRaw);
    const exact = pickCategoryCandidate(candidates.filter(g => g.children.includes(leafRaw)), hint);
    if (exact) {
      return {
        status: 'resolved',
        value: { matched: 'global', channel: exact.channel, platformGroup: exact.name, platformLeaf: leafRaw, leafExact: true, globalCategory: exact.globalCategory },
      };
    }
    const group = pickCategoryCandidate(candidates, hint);
    if (group) {
      // 平台侧没有同名子分类：只归位到大类，并如实标记 leafExact=false（不假装子分类也对上了）。
      return {
        status: 'resolved',
        value: { matched: 'global', channel: group.channel, platformGroup: group.name, platformLeaf: group.name, leafExact: false, globalCategory: group.globalCategory },
      };
    }
  }

  // 2b) 只写了全局大类名（没有子类）：按 globalCategory 归位到该平台大类，如实标记 leafExact=false。
  //     同一个全局大类在平台侧可能拆成多个大类（「都市·现实」在番茄拆成「都市」与「现实」），
  //     取平台投稿顺序里的第一个，并且仍然 leafExact=false——只承诺归位到大类，不假装精确。
  //     （历史数据与全局字典回退路径大量是这种写法，不能因为「没写子类」就判成不属于该平台。）
  if (slash < 0) {
    const candidates = tree.groups.filter(g => g.globalCategory === body);
    const group = pickCategoryCandidate(candidates, hint);
    if (group) {
      return {
        status: 'resolved',
        value: { matched: 'global', channel: group.channel, platformGroup: group.name, platformLeaf: group.name, leafExact: false, globalCategory: group.globalCategory },
      };
    }
  }

  // 3) 直接命中平台投稿分类名（用户只填了分类名；扁平平台走的就是这条）
  const leafHit = pickCategoryCandidate(
    tree.groups.filter(g => g.children.includes(leafRaw)),
    hint,
  );
  if (leafHit) {
    return {
      status: 'resolved',
      value: { matched: 'platform', channel: leafHit.channel, platformGroup: leafHit.name, platformLeaf: leafRaw, leafExact: true, globalCategory: leafHit.globalCategory },
    };
  }
  // 4) 命中的是平台投稿分类名本身（用户只选了一层）：非扁平平台上这一层确实比子分类粗，
  //    扁平平台上这一层就是投稿分类，leafExact 按 flat 如实取值，不能一律写成不精确。
  const namedHit = pickCategoryCandidate(
    tree.groups.filter(g => g.name === leafRaw || g.name === body),
    hint,
  );
  if (namedHit) {
    return {
      status: 'resolved',
      value: { matched: 'platform', channel: namedHit.channel, platformGroup: namedHit.name, platformLeaf: namedHit.name, leafExact: namedHit.flat === true, globalCategory: namedHit.globalCategory },
    };
  }
  return {
    status: 'unmapped',
    reason: `「${raw}」不在 ${platform} 的投稿分类内`,
    availableGroups,
  };
}

/** 供前端/看板展示：某平台可选的分类（含全局分类回填，保证历史数据也能显示）。 */
export interface PlatformCategoryOption {
  /** 选项唯一身份：`频道·平台分类名`（platformCategoryOptionId）。跨频道同名分类靠它区分。 */
  id: string;
  channel: string;
  name: string;
  children: string[];
  globalCategory: string | null;
  /** 平台侧到这一层就是投稿分类，前端不得再让用户选第二遍 */
  flat: boolean;
}

export function categoryOptionsForPlatform(platform: string | null | undefined): PlatformCategoryOption[] {
  const tree = platformCategoryTree(platform);
  if (!tree) return [];
  return tree.groups.map(g => ({
    id: platformCategoryOptionId(g.channel, g.name),
    channel: g.channel,
    name: g.name,
    children: [...g.children],
    globalCategory: g.globalCategory,
    flat: g.flat === true,
  }));
}

/**
 * 未取得作者后台完整分类表时，给可编辑下拉提供平台自身的创作参考。
 * 这里曾把番茄长篇榜单的 37 类当成短故事下拉，后果是短篇误选长篇分类。
 * 以下 14 项来自番茄作家专区 2026-06-21 至 09-30 的短故事活动热门品类，
 * 不是投稿后台的完整选项；前端必须允许直接输入其它后台分类。
 * 来源：https://fanqienovel.com/writer/zone/solicit-activity
 */
const FANQIE_SHORT_STORY_REFERENCE_CATEGORIES = [
  '男频脑洞', '女频脑洞', '悬疑惊悚', '玄幻仙侠', '青春虐恋', '古言虐恋', '历史古代',
  '都市日常', '宫斗宅斗', '现言甜宠', '古言甜宠', '民国旧影', '年代', '女性成长',
] as const;

export function categoryReferenceOptionsForProject(platform: string | null | undefined, projectType: string | null | undefined): string[] {
  if (platform === 'fanqie' && projectType === 'short_story') return [...FANQIE_SHORT_STORY_REFERENCE_CATEGORIES];
  if (platformCategoryTreeVerification(platform, projectType)?.verified === 'modeled') {
    return categoryOptionsForPlatform(platform).map(option => option.id);
  }
  return [];
}

/**
 * 分类落位的统一展示口径 —— 后端执行标准与两个前端页面共用这一句。
 * 三处各写一遍必然分叉：用户在页面上看到的落位，和 prompt 里写的落位，说的不是一件事。
 */
export function describeCategoryPlacement(platformLabel: string, v: ResolvedPlatformCategory): string {
  const head = platformLabel + ' · ' + v.channel + ' · ' + v.platformGroup;
  if (v.leafExact) {
    return v.platformLeaf === v.platformGroup
      ? head + '（该平台的投稿分类本身）'
      : head + ' · ' + v.platformLeaf;
  }
  return head + '（平台侧没有与填写内容同名的分类，只归位到该平台投稿分类「' + v.platformGroup + '」，不得假装子分类也对上了）';
}

/**
 * 分类级实测体量的一句话口径 —— 展示与执行标准共用同一句。
 * 没有实测数据时返回空串：调用方据此如实写「未核实」，绝不许编造数字或用别的分类的数字顶上。
 */
/* ============================================================================
 * 「按平台分类执行」的四维判据绑定（基调/文风/流派/视角）—— 唯一实现。
 *
 * 用户在项目卡片上选的 平台 / 分类 / 基调 / 文风 / 流派 / 视角 六维里，
 * 【平台】【分类】两维本来就有平台侧实测数据（platform-benchmarks、本文件的分类树与实测表）。
 * 另外四维（基调/文风/流派/视角）此前是同一个问题：代码把同一段「该分类官方定义 + 头部标签」
 * 无差别贴到四个维度后面，看起来每一维都「按平台分类执行」了，实际上平台对这四维的约束强度
 * 完全不同 —— 流派能对上平台官方标签（真能核对），基调只有官方定义这一个情绪锚点（可判相悖），
 * 文风与视角平台根本不公开口径（判据只能是作者设定）。把四种强度写成同一句话 = 假严谨：
 * 作者看到「必须按平台分类执行」，模型却拿到一段跟该维无关的平台分类说明，
 * 于是「选了流派却和平台分类头部标签对不上」这件事从来没人报出来。
 *
 * 所以这里对每一维分别给出【判据来源】+【该维验收口径】+【已核出的落差】，不再一律套同一段。
 * 不降级语义：basis=author_only 不等于「这一维不用执行」——它表示平台侧没有该维数据，
 * 判据来自作者设定，仍然必须被框架层与正文层执行；落差为空也不等于默认通过。
 * ========================================================================== */

export type PlatformBoundDimension = 'tone' | 'style' | 'genre' | 'pov';

/** 判据来源的显示名（前端与 prompt 共用一份，不得各写一遍）。 */
export const PLATFORM_DIMENSION_BASIS_LABELS: Record<'measured' | 'definition' | 'author_only', string> = {
  measured: '平台实测数据（该分类头部官方标签）',
  definition: '平台官方定义原文（该分类的情绪锚点）',
  author_only: '作者设定（平台未公开该维口径）',
};

export interface PlatformCategoryDimensionBinding {
  dimension: PlatformBoundDimension;
  /**
   * 判据来源：measured=平台实测数据可逐值核对；definition=平台官方定义可判相悖；
   * author_only=平台不公开该维口径，判据是作者设定（仍必须执行，不是不适用）。
   */
  basis: 'measured' | 'definition' | 'author_only';
  /** 平台侧对照物（供展示与审计；无数据时必须为空串，调用方不得编造）。 */
  evidence: string;
  /** 直接注入 prompt 的该维验收口径（不含重复的证据段，「分类」维已给全）。 */
  requirement: string;
  /** 已核出的落差；空串 = 未发现落差，不等于默认通过。 */
  gap: string;
}

/** 流派取值与平台官方标签做词面核对时的去尾：系统流 / 系统类 / 系统文 都指向同一个平台标签「系统」。 */
const GENRE_TAG_SUFFIX = /(流|类|派|文|系|题材|向)$/;

function genreTagCore(raw: string): string {
  let core = String(raw ?? '').replace(/\s+/g, '');
  for (let round = 0; round < 3; round += 1) {
    const next = core.replace(GENRE_TAG_SUFFIX, '');
    if (next === core) break;
    core = next;
  }
  return core;
}

/**
 * 取值是否命中该分类头部的平台官方标签。
 * 只做词面核对：标签名、去尾后的核心词，以及平台给该标签的官方定义原文包含核心词。
 * 命中 = 平台侧确实在用这个题材机制；未命中不得当成「不适用」，调用方必须把它写成落差。
 */
function matchGenreTag(profile: PlatformCategoryWritingProfile, raw: string): PlatformCategoryTagSample | null {
  const value = String(raw ?? '').replace(/\s+/g, '');
  const core = genreTagCore(value);
  if (core.length < 2) return null;
  for (const tag of profile.topTags) {
    const name = tag.name.replace(/\s+/g, '');
    if (name === value || name === core || genreTagCore(tag.name) === core) return tag;
  }
  for (const tag of profile.topTags) {
    if (tag.desc.replace(/\s+/g, '').includes(core)) return tag;
  }
  return null;
}

/**
 * 取某一维的「按平台分类执行」绑定。
 * 没采集到该分类口径时返回 basis=author_only 且 evidence 为空 —— 调用方必须如实写「未核验」。
 */
export function platformCategoryDimensionBinding(
  platform: string | null | undefined,
  v: ResolvedPlatformCategory,
  dimension: PlatformBoundDimension,
  value: string,
  projectType?: string | null,
): PlatformCategoryDimensionBinding {
  const label = '平台分类「' + v.channel + '·' + v.platformGroup + '」';
  const table = PLATFORM_CATEGORY_WRITING_PROFILES[String(platform ?? '').trim()];
  const profile = table ? platformCategoryWritingProfile(platform, v.channel, v.platformGroup, projectType) : null;
  if (!table || !profile) {
    return {
      dimension, basis: 'author_only', evidence: '',
      requirement: '该分类在' + String(platform ?? '') + '的写作口径未核验（系统尚未采集该平台该分类的官方分类定义与头部官方标签）：不得编造平台口径，也不得套用其他分类的口径；本维按作者设定执行',
      gap: '',
    };
  }
  const tags = profile.topTags.map(t => t.name);
  const tagList = tags.join('、') || '（无）';
  const evidence = label + '官方定义原文：' + profile.officialDesc
    + '；该分类头部实测（采集于 ' + table.capturedAt + '，样本 ' + profile.samples + ' 部）头部作品实际挂的平台官方标签：'
    + (profile.topTags.map(t => t.name + ' ' + t.samples + '/' + profile.samples).join('、') || '（无）');
  const values = String(value ?? '').split(/[、,，/]/).map(item => item.trim()).filter(Boolean);

  if (dimension === 'genre') {
    const matched: string[] = [];
    const missed: string[] = [];
    for (const item of values) {
      const tag = matchGenreTag(profile, item);
      if (tag) matched.push(item + '→平台标签「' + tag.name + '」（平台官方定义：' + tag.desc + '）');
      else missed.push(item);
    }
    return {
      dimension, basis: 'measured', evidence,
      requirement: '流派按平台分类执行：取值必须符合「分类」维给出的官方定义；头部官方标签是采样证据，不是后台标签全集；'
        + '命中头部官方标签的取值按该标签的平台官方定义执行'
        + (matched.length ? '（' + matched.join('；') + '）' : '')
        + '；未命中的取值必须写明它如何兑现该分类的核心预期，否则本维判未执行（不得默认通过）',
      gap: missed.length
        ? '所选流派「' + missed.join('、') + '」不在' + label + '头部官方标签里（该分类头部在用：' + tagList
          + '）——平台侧没有为它提供口径，不得默认通过：必须写明它如何兑现该分类官方定义「' + profile.officialDesc + '」的核心预期'
        : '',
    };
  }

  if (dimension === 'tone') {
    return {
      dimension, basis: 'definition', evidence,
      requirement: '基调按平台分类执行：取值必须与该分类官方定义（见「分类」维）所示的情绪指向同向；'
        + '相悖即判未执行 —— 要么改基调，要么写出两者共存的明确依据（依据只能来自该分类头部官方标签 ' + tagList + ' 所示的具体机制），不得默认通过',
      gap: '',
    };
  }

  if (dimension === 'style') {
    return {
      dimension, basis: 'author_only', evidence,
      requirement: '文风按平台分类执行：平台未公开该分类的文风口径（平台侧不提供文风维度数据），文风取值本身由作者设定；'
        + '受该分类官方定义（见「分类」维）所示的题材场景与阅读节奏约束 —— 文风必须服务它，不得使用与该分类不匹配的文体',
      gap: '',
    };
  }

  return {
    dimension: 'pov', basis: 'author_only', evidence,
    requirement: '视角按平台分类执行：平台未公开该分类的视角口径（平台侧不提供视角维度数据），视角取值本身由作者设定；'
      + '受该分类官方定义（见「分类」维）所示的叙事场景约束 —— 视角必须适配它，不得与该分类读者预期相抵触',
    gap: '',
  };
}

export function platformCategoryBenchmarkNote(
  platform: string | null | undefined,
  v: ResolvedPlatformCategory,
  projectType?: string | null,
): string {
  const table = PLATFORM_CATEGORY_METRICS[String(platform ?? '').trim()];
  // 这里曾把长篇榜单字数区间写进短篇分类标准，后果是短篇被要求对照数十万字的错误体量。
  if (!table || (projectType && table.measureUnit !== projectType)) return '';
  const metric = platformCategoryMetric(platform, v.channel, v.platformGroup);
  if (!metric) return '';
  return '该平台分类的头部实测（' + table.source + '，采集于 ' + table.capturedAt + '，样本 ' + metric.samples
    + ' 部）：正文 ' + formatCategoryWordScale(metric)
    + '；本书的目标字数与节奏必须与这个头部区间对照后明确取舍，不得无视该平台分类的实际体量分布';
}
