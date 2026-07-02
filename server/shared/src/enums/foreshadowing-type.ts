export const ForeshadowingTypeEnum = {
  HINT: 'hint',
  SETUP: 'setup',
  MYSTERY: 'mystery',
  OBJECT: 'object',
  RELATIONSHIP: 'relationship',
} as const;
export type ForeshadowingType = (typeof ForeshadowingTypeEnum)[keyof typeof ForeshadowingTypeEnum];

export const ForeshadowingStatus = {
  BURIED: 'buried',
  PENDING: 'pending',
  RECOVERED: 'recovered',
  CANCELLED: 'cancelled',
} as const;
export type ForeshadowingStatus = (typeof ForeshadowingStatus)[keyof typeof ForeshadowingStatus];

export const ForeshadowingImportance = [1, 2, 3] as const;
export type ForeshadowingImportance = (typeof ForeshadowingImportance)[number];
