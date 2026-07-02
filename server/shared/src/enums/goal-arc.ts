/**
 * Goal弧线类型枚举
 * 7种Goal弧线: 参考游蜂写作
 */

export const GoalArc = {
  /** 危机→解决 */
  CRISIS_RESOLVE: 'crisis_resolve',
  /** 积累→爆发 */
  ACCUMULATE_BURST: 'accumulate_burst',
  /** 伏笔→回收 */
  FORESHADOW_RECOVER: 'foreshadow_recover',
  /** 铺垫→高潮 */
  PAVE_CLIMAX: 'pave_climax',
  /** 压制→反击 */
  SUPPRESS_COUNTER: 'suppress_counter',
  /** 迷雾→真相 */
  MIST_TRUTH: 'mist_truth',
  /** 试探→摊牌 */
  PROBE_SHOWDOWN: 'probe_showdown',
} as const;

export type GoalArcType = (typeof GoalArc)[keyof typeof GoalArc];

/** Goal弧线中文标签 */
export const GoalArcLabels: Record<GoalArcType, string> = {
  crisis_resolve: '危机→解决',
  accumulate_burst: '积累→爆发',
  foreshadow_recover: '伏笔→回收',
  pave_climax: '铺垫→高潮',
  suppress_counter: '压制→反击',
  mist_truth: '迷雾→真相',
  probe_showdown: '试探→摊牌',
};

/** Goal弧线描述 */
export const GoalArcDescriptions: Record<GoalArcType, string> = {
  crisis_resolve: '角色面临危机，经过努力最终解决',
  accumulate_burst: '矛盾积累到一定程度后爆发',
  foreshadow_recover: '前期伏笔在本章得到回收',
  pave_climax: '为下一章的高潮做铺垫',
  suppress_counter: '角色被压制后展开反击',
  mist_truth: '从迷雾中逐渐发现真相',
  probe_showdown: '试探性交锋后正式摊牌',
};
