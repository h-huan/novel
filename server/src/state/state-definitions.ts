/**
 * 24维角色状态定义
 *
 * 分类：
 * - 身体状态 (Physical): 1-4
 * - 社会关系 (Social): 5-10
 * - 心理状态 (Mental): 11-15
 * - 能力状态 (Ability): 16-19
 * - 剧情状态 (Plot): 20-24
 */

/** 状态维度ID */
export const STATE_DIMENSIONS = {
  // ═══ 身体状态 (Physical) ═══
  HP_INJURY: 'hp_injury',
  PHYSICAL_CONDITION: 'physical_cond',
  APPEARANCE: 'appearance',
  EQUIPMENT: 'equipment',

  // ═══ 社会关系 (Social) ═══
  FACTION: 'faction',
  REPUTATION: 'reputation',
  DEBT_OBLIGATION: 'debt',
  RELATIONSHIP: 'relationship',
  SOCIAL_RANK: 'social_rank',
  WEALTH: 'wealth',

  // ═══ 心理状态 (Mental) ═══
  MENTAL_STATE: 'mental_state',
  MOTIVATION: 'motivation',
  KNOWLEDGE: 'knowledge',
  SECRET: 'secret',
  PERSONALITY_SHIFT: 'personality',

  // ═══ 能力状态 (Ability) ═══
  SKILL_LEVEL: 'skill_level',
  POWER_UP: 'power_up',
  RESOURCE: 'resource',
  LIMITATION: 'limitation',

  // ═══ 剧情状态 (Plot) ═══
  LOCATION: 'location',
  ALLIANCE_STATE: 'alliance',
  PLOT_FLAG: 'plot_flag',
  FORESHADOW_TAG: 'foreshadow_tag',
  ARC_POSITION: 'arc_position',
} as const;

export type StateDimensionId = (typeof STATE_DIMENSIONS)[keyof typeof STATE_DIMENSIONS];

/** 维度分类 */
export const DIMENSION_CATEGORIES = {
  PHYSICAL: ['hp_injury', 'physical_cond', 'appearance', 'equipment'] as const,
  SOCIAL: ['faction', 'reputation', 'debt', 'relationship', 'social_rank', 'wealth'] as const,
  MENTAL: ['mental_state', 'motivation', 'knowledge', 'secret', 'personality'] as const,
  ABILITY: ['skill_level', 'power_up', 'resource', 'limitation'] as const,
  PLOT: ['location', 'alliance', 'plot_flag', 'foreshadow_tag', 'arc_position'] as const,
} as const;

/** 维度元数据 */
export interface DimensionMeta {
  id: string;
  name: string;
  category: string;
  type: 'numeric' | 'numeric_delta' | 'enum' | 'list' | 'map' | 'computed';
  description: string;
}

/** 24维完整元数据 */
export const DIMENSION_METADATA: Record<string, DimensionMeta> = {
  hp_injury:     { id: 'hp_injury',     name: '伤势/健康',   category: 'physical', type: 'numeric',       description: '健康状态 0(濒死)-100(满血)' },
  physical_cond: { id: 'physical_cond', name: '体能状况',     category: 'physical', type: 'enum',          description: 'exhausted/tired/normal/energized/peaked' },
  appearance:    { id: 'appearance',    name: '外貌变化',     category: 'physical', type: 'list',          description: '伤疤/残疾/变装/衰老等标记' },
  equipment:     { id: 'equipment',     name: '装备/物品',    category: 'physical', type: 'list',          description: '当前持有物品列表' },
  faction:       { id: 'faction',       name: '阵营归属',     category: 'social',   type: 'map',           description: '势力名称+忠诚度(0-100)' },
  reputation:    { id: 'reputation',    name: '声望值',       category: 'social',   type: 'map',           description: '在不同势力中的声望值' },
  debt:          { id: 'debt',          name: '欠债/承诺',    category: 'social',   type: 'list',          description: '[{to, what, deadline}]' },
  relationship:  { id: 'relationship',  name: '人际关系网',   category: 'social',   type: 'map',           description: '{角色ID: 好感度(-100到100)}' },
  social_rank:   { id: 'social_rank',   name: '社会地位',     category: 'social',   type: 'enum',          description: '官职/爵位/职级/称号' },
  wealth:        { id: 'wealth',        name: '财富',         category: 'social',   type: 'map',           description: '{currency_type: amount}' },
  mental_state:  { id: 'mental_state',  name: '心理状态',     category: 'mental',   type: 'enum',          description: 'stable/anxious/depressed/enraged/fearful' },
  motivation:    { id: 'motivation',    name: '当前动机',     category: 'mental',   type: 'map',           description: '短期目标+长期目标' },
  knowledge:     { id: 'knowledge',     name: '已知信息',     category: 'mental',   type: 'list',          description: '角色已知的关键信息列表' },
  secret:        { id: 'secret',        name: '持有秘密',     category: 'mental',   type: 'list',          description: '角色的秘密' },
  personality:   { id: 'personality',   name: '性格变化',     category: 'mental',   type: 'enum',          description: '性格弧线当前阶段' },
  skill_level:   { id: 'skill_level',   name: '技能等级',     category: 'ability',  type: 'map',           description: '{技能名: 等级1-10}' },
  power_up:      { id: 'power_up',      name: '能力提升',     category: 'ability',  type: 'list',          description: '新获得的能力列表' },
  resource:      { id: 'resource',      name: '掌控资源',     category: 'ability',  type: 'map',           description: '{资源名: 数量/掌控度}' },
  limitation:    { id: 'limitation',    name: '当前限制',     category: 'ability',  type: 'list',          description: '诅咒/封印/毒/debuff' },
  location:      { id: 'location',      name: '当前位置',     category: 'plot',     type: 'enum',          description: '地点+坐标' },
  alliance:      { id: 'alliance',      name: '盟友/敌人状态', category: 'plot',    type: 'map',           description: '与他人的合作/敌对状态' },
  plot_flag:     { id: 'plot_flag',     name: '剧情标记',     category: 'plot',     type: 'list',          description: '已完成的关键剧情节点' },
  foreshadow_tag:{ id: 'foreshadow_tag',name: '伏笔标签',     category: 'plot',     type: 'list',          description: '角色身上的待回收伏笔' },
  arc_position:  { id: 'arc_position',  name: '角色弧位置',   category: 'plot',     type: 'computed',      description: '角色成长弧中位置(0-100%)' },
};

/** 默认角色状态 */
export const DEFAULT_CHARACTER_STATE: Record<string, unknown> = {
  hp_injury: 100,
  physical_cond: 'normal',
  appearance: [],
  equipment: [],
  faction: { name: '未加入', loyalty: 0 },
  reputation: {},
  debt: [],
  relationship: {},
  social_rank: '平民',
  wealth: { gold: 0 },
  mental_state: 'stable',
  motivation: { short_term: '生存', long_term: '未知' },
  knowledge: [],
  secret: [],
  personality: '初始阶段',
  skill_level: {},
  power_up: [],
  resource: {},
  limitation: [],
  location: '未知',
  alliance: {},
  plot_flag: [],
  foreshadow_tag: [],
  arc_position: 0,
};
