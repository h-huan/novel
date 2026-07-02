/** 天龙8步 - 每章完整8步结构 */
export interface TianLong8Steps {
  goal: string;
  trigger: string;
  action: string;
  obstacle: string;
  misjudge: string;
  reversal: string;
  cost: string;
  hook: string;
}

export type TianLongMode = 'full_auto' | 'semi_auto' | 'free';

export interface TianLongConfig {
  mode: TianLongMode;
  stepWordRatios: number[];
  wordRange: [number, number];
  enableQualityGate: boolean;
  qualityThreshold: number;
}

export interface TianLongStepDetail {
  step: keyof TianLong8Steps;
  stepIndex: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  content: string;
  generatedText?: string;
  wordCount?: number;
  userAdjustment?: string;
}
