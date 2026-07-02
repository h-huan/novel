/**
 * 平台风格枚举
 * 支持多种内容平台的风格适配
 */

export const PlatformStyle = {
  /** 知乎盐选 */
  ZHIHU: 'zhihu',
  /** 番茄小说 */
  FANQIE: 'fanqie',
  /** 起点中文网 */
  QIDIAN: 'qidian',
  /** 抖音故事 */
  DOUYIN: 'douyin',
  /** 规则怪谈 */
  RULES_HORROR: 'rules_horror',
  /** 晋江文学城 */
  JINJIANG: 'jinjiang',
  /** 通用/无特定平台 */
  GENERIC: 'generic',
} as const;

export type PlatformStyleType = (typeof PlatformStyle)[keyof typeof PlatformStyle];

/** 平台风格中文标签 */
export const PlatformStyleLabels: Record<PlatformStyleType, string> = {
  zhihu: '知乎盐选',
  fanqie: '番茄小说',
  qidian: '起点中文网',
  douyin: '抖音故事',
  rules_horror: '规则怪谈',
  jinjiang: '晋江文学城',
  generic: '通用',
};

/** 平台风格特征描述 */
export const PlatformStyleProfiles: Record<PlatformStyleType, {
  userProfile: string;
  lengthRange: { min: number; max: number };
  keyFeatures: string[];
  taboos: string[];
}> = {
  zhihu: {
    userProfile: '25-40岁知识群体，偏好深度内容和反转',
    lengthRange: { min: 3000, max: 30000 },
    keyFeatures: ['强反转', '逻辑严密', '第一人称', '现实题材', '社会话题'],
    taboos: ['过于狗血', '玛丽苏', '逻辑漏洞', '注水拖沓'],
  },
  fanqie: {
    userProfile: '18-35岁移动端用户，偏好快节奏爽文',
    lengthRange: { min: 50000, max: 2000000 },
    keyFeatures: ['快节奏', '爽点密集', '系统/穿越', '黄金三章', '强冲突'],
    taboos: ['节奏慢', '铺垫过多', '文青病', '悲剧结局'],
  },
  qidian: {
    userProfile: '20-40岁男性为主，偏好长篇升级流',
    lengthRange: { min: 200000, max: 5000000 },
    keyFeatures: ['长篇升级', '世界观宏大', '数据流', '强者重生', '多女主/无女主'],
    taboos: ['圣母男主', '节奏过慢', '战力崩溃'],
  },
  douyin: {
    userProfile: '18-30岁短视频用户，偏好短平快内容',
    lengthRange: { min: 500, max: 5000 },
    keyFeatures: ['超短篇', '高能开场', '句句爆点', '悬疑钩子', '情绪共鸣'],
    taboos: ['长段落', '复杂设定', '慢热'],
  },
  rules_horror: {
    userProfile: '18-30岁悬疑爱好者，偏好细思极恐',
    lengthRange: { min: 5000, max: 100000 },
    keyFeatures: ['规则设定', '细思极恐', '非人感', '规则违反→代价', '多反转'],
    taboos: ['规则矛盾', '解释过度', '鬼怪直接出场'],
  },
  jinjiang: {
    userProfile: '18-35岁女性为主，偏好情感向内容',
    lengthRange: { min: 100000, max: 2000000 },
    keyFeatures: ['感情线为主', '角色塑造细腻', '慢热', '甜宠/虐恋', '时代背景'],
    taboos: ['男主渣化', '感情线混乱', '三观不正'],
  },
  generic: {
    userProfile: '通用，无特定平台倾向',
    lengthRange: { min: 0, max: Infinity },
    keyFeatures: ['通用写作'],
    taboos: [],
  },
};
