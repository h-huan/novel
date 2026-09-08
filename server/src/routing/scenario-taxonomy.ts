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
  'inspiration-seed-enrich': 'outline',
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
  'inspiration-seed-enrich': 'outline',
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

export function standardScene(scenario?: string | null): string {
  const key = String(scenario || 'daily');
  return STANDARD_ALIASES[key] || key;
}

/** A single stage classifier shared by telemetry, scoring and quality reports. */
export function qualityStage(scenario?: string | null, stepKey?: string | null): QualityStage {
  const key = `${String(scenario || '')} ${String(stepKey || '')}`.toLowerCase();
  if (/world/.test(key)) return 'world';
  if (/character/.test(key)) return 'character';
  if (/outline|organization|foreshadow|timeline/.test(key)) return 'outline';
  if (/polish|refin|repair|de.?ai|enhance|adapt_platform|quality_refine/.test(key)) return 'refinement';
  if (/writ|body|chapter/.test(key)) return 'chapter';
  return 'project';
}
