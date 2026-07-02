export const ChapterStatus = {
  DRAFT: 'draft',
  REVIEWING: 'reviewing',
  LOCKED: 'locked',
} as const;
export type ChapterStatus = (typeof ChapterStatus)[keyof typeof ChapterStatus];

export const ChapterFunction = {
  BREATHING: 'breathing',
  CHARGING: 'charging',
  EXPLOSION: 'explosion',
  PAVING: 'paving',
  TRANSITION: 'transition',
  CLOSING: 'closing',
} as const;
export type ChapterFunctionType = (typeof ChapterFunction)[keyof typeof ChapterFunction];

export const GoalArc = {
  CRISIS_RESOLVE: 'crisis_resolve',
  ACCUMULATE_BURST: 'accumulate_burst',
  FORESHADOW_RECOVER: 'foreshadow_recover',
  PAVE_CLIMAX: 'pave_climax',
  SUPPRESS_COUNTER: 'suppress_counter',
  MIST_TRUTH: 'mist_truth',
  PROBE_SHOWDOWN: 'probe_showdown',
} as const;
export type GoalArcType = (typeof GoalArc)[keyof typeof GoalArc];

export const HookType = {
  DIALOGUE: 'dialogue',
  ACTION: 'action',
  MYSTERY: 'mystery',
  EMOTION: 'emotion',
} as const;
export type HookType = (typeof HookType)[keyof typeof HookType];

export const TransitionMode = {
  TIGHT: 'tight',
  JUMP: 'jump',
  PARALLEL: 'parallel',
} as const;
export type TransitionMode = (typeof TransitionMode)[keyof typeof TransitionMode];

export const RelationshipType = {
  ALLY: 'ally',
  ENEMY: 'enemy',
  NEUTRAL: 'neutral',
  FAMILY: 'family',
  MENTOR: 'mentor',
  RIVAL: 'rival',
} as const;
export type RelationshipType = (typeof RelationshipType)[keyof typeof RelationshipType];
