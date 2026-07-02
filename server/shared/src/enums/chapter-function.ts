/**
 * 章节功能类型枚举
 * 6种类型: 呼吸章/蓄力章/爆发章/铺垫章/过渡章/收束章
 */

export const ChapterFunction = {
  /** 呼吸章 - 节奏缓冲，角色日常/互动，降低紧张感 */
  BREATHING: 'breathing',
  /** 蓄力章 - 信息收集/能力提升，为爆发做准备 */
  CHARGING: 'charging',
  /** 爆发章 - 关键对战/揭露真相/重大转折 */
  EXPLOSION: 'explosion',
  /** 铺垫章 - 埋设伏笔/势力调配/人物关系变化 */
  PAVING: 'paving',
  /** 过渡章 - 场景切换/时间推进/视角转换 */
  TRANSITION: 'transition',
  /** 收束章 - 阶段性收尾/伏笔回收/剧情段落完结 */
  CLOSING: 'closing',
} as const;

export type ChapterFunctionType = (typeof ChapterFunction)[keyof typeof ChapterFunction];

/** 章节功能中文标签 */
export const ChapterFunctionLabels: Record<ChapterFunctionType, string> = {
  breathing: '呼吸章',
  charging: '蓄力章',
  explosion: '爆发章',
  paving: '铺垫章',
  transition: '过渡章',
  closing: '收束章',
};

/** 章节功能描述 */
export const ChapterFunctionDescriptions: Record<ChapterFunctionType, string> = {
  breathing: '节奏缓冲，角色日常/互动，降低紧张感',
  charging: '信息收集/能力提升，为爆发做准备',
  explosion: '关键对战/揭露真相/重大转折',
  paving: '埋设伏笔/势力调配/人物关系变化',
  transition: '场景切换/时间推进/视角转换',
  closing: '阶段性收尾/伏笔回收/剧情段落完结',
};
