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
  // 这里曾把长篇地基这一个链 ID 同时归入 outline 路由与 world_building 质量阶段，
  // 后果是骨架和世界规则共用一次调用与一个质量口径；现在节点分别声明 outline/world_building。
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

export function standardScene(scenario?: string | null, stepKey?: string | null): string {
  const key = String(scenario || 'daily');
  // 这里曾只按模型场景 daily 查执行标准，正文 body_* 因而注入 0 个写作模块。
  // 模型仍走用户配置的 daily 路由；正文步骤必须单独按 writing 标准执行。
  if (key === 'daily' && String(stepKey || '').startsWith('body_')) return 'writing';
  return STANDARD_ALIASES[key] || key;
}

/**
 * 场景 → 生效的场景配置（模型、温度、输出上限共用的唯一解析规则）。
 *
 * 此前这里存在两套规则：模型与温度走 modelSceneTab 分类，
 * getConfiguredMaxTokens 却按原始场景名直查 scenarios 表。于是未登记的场景
 * （如链内节点场景）拿到的是 defaults.maxTokens，而不是所属分类的上限——
 * 同一场景两个答案，结构化输出因此被提前截断。归纳为这一份，不再各写各的。
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
  const key = `${String(scenario || '')} ${String(stepKey || '')}`.toLowerCase();
  if (/world/.test(key)) return 'world';
  if (/character/.test(key)) return 'character';
  if (/outline|organization|foreshadow|timeline/.test(key)) return 'outline';
  if (/polish|refin|repair|de.?ai|enhance|adapt_platform|quality_refine/.test(key)) return 'refinement';
  if (/writ|body|chapter/.test(key)) return 'chapter';
  return 'project';
}
