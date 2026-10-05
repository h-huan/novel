export type ModelSceneTab = 'idea_generate' | 'outline' | 'writing' | 'polish' | 'daily';
export type QualityStage = 'project' | 'world' | 'character' | 'outline' | 'chapter' | 'refinement';

/**
 * Every internal generation name is classified here. Model routing and
 * execution-standard routing must not maintain separate alias tables.
 */
const MODEL_TABS: Record<string, ModelSceneTab> = {
  idea_generate: 'idea_generate',
  inspiration: 'idea_generate',
  idea_questions: 'idea_generate',
  idea_refine: 'idea_generate',
  outline: 'outline',
  world_building: 'outline',
  character_design: 'outline',
  organization_map: 'outline',
  foreshadowing: 'outline',
  timeline: 'outline',
  'long-novel-flexible-outline': 'outline',
  writing: 'writing',
  writing_daily: 'writing',
  writing_climax: 'writing',
  chapter_synthesis: 'writing',
  body: 'writing',
  body_by_outline: 'writing',
  polish: 'polish',
  refinement: 'polish',
  enhance_opening: 'polish',
  enhance_reversal: 'polish',
  adapt_platform: 'polish',
  quality_refine: 'polish',
  character_review: 'daily',
  review: 'daily',
  summary: 'daily',
  state_extract: 'daily',
  state_extraction: 'daily',
  daily: 'daily',
  default: 'daily',
};

const STANDARD_ALIASES: Record<string, string> = {
  inspiration: 'idea_generate',
  idea_questions: 'idea_generate',
  idea_refine: 'idea_generate',
  'long-novel-flexible-outline': 'outline',
  writing_daily: 'writing',
  writing_climax: 'writing',
  chapter_synthesis: 'writing',
  body: 'writing',
  body_by_outline: 'writing',
  refinement: 'polish',
  enhance_opening: 'polish',
  enhance_reversal: 'polish',
  adapt_platform: 'polish',
  quality_refine: 'polish',
  character_review: 'review',
  state_extract: 'state_extraction',
};

export function modelSceneTab(scenario?: string | null): ModelSceneTab {
  const key = String(scenario || 'daily');
  return MODEL_TABS[key] || 'daily';
}

export function standardScene(scenario?: string | null, stepKey?: string | null): string {
  const key = String(scenario || 'daily');
  if (key === 'daily' && String(stepKey || '').startsWith('body_')) return 'writing';
  return STANDARD_ALIASES[key] || key;
}

/** Evaluation reports retain their story context but are never themselves chapter prose. */
export function isEvaluationOutput(scenario?: string | null, stepKey?: string | null): boolean {
  const scene = standardScene(scenario, stepKey);
  return ['review', 'summary', 'state_extraction'].includes(scene)
    || /(?:^|_)(?:review|audit|judge)(?:_|$)/.test(String(stepKey || ''));
}

/**
 * 场景 → 生效的场景配置（模型、温度、输出上限共用的唯一解析规则）。
 */
export function resolveScenarioRoute(
  config: { scenarios?: Record<string, any> } | null | undefined,
  scenario?: string | null,
): any {
  const scenarios = config?.scenarios || {};
  const routeScenario = modelSceneTab(scenario);
  return routeScenario === 'daily' ? scenarios.writing : scenarios[routeScenario];
}

/** A single stage classifier shared by telemetry, scoring and quality reports. */
export function qualityStage(scenario?: string | null, stepKey?: string | null): QualityStage {
  const scenarioKey = String(scenario || '').toLowerCase();
  const step = String(stepKey || '').toLowerCase();
  const key = `${scenarioKey} ${step}`;
  if (/world/.test(key)) return 'world';
  if (/character/.test(key) && !/review|repair/.test(key)) return 'character';
  if (/outline|organization|foreshadow|timeline/.test(key) && !/repair/.test(key)) return 'outline';
  // A review/repair that belongs to a chapter must use the same bounded context
  // budget and chapter-contract selection as drafting. Previously plain `review`
  // fell through to project stage (16K), while the draft used chapter stage (24K),
  // so the reviewer could judge a different set of facts. Creation-time reviews
  // still resolve to world/character/outline above through their explicit step key.
  if (/polish|refin|repair|de.?ai|enhance|adapt_platform|quality_refine/.test(key)) return 'refinement';
  if (/writ|body|chapter/.test(key)) return 'chapter';
  if (/review/.test(scenarioKey)) return 'refinement';
  return 'project';
}
