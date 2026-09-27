/**
 * Canonical structured-content contracts.
 *
 * Rule: transport/business layers use real JSON values. JSON strings are only
 * allowed at the persistence boundary and are decoded before leaving services.
 */
export type ContentContractKind = 'chapter_plan' | 'world_profile' | 'character_profile';

export interface ScenePlan {
  title?: string;
  summary: string;
  goal?: string;
  conflict?: string;
  outcome?: string;
  location?: string;
  characterIds?: string[];
}

export interface CharacterActionPlan {
  character: string;
  action: string;
  motivation?: string;
  result?: string;
}

/**
 * ChapterPlan is also the chapter execution contract.
 *
 * Older projects only contain the original planning fields below. Contract
 * fields stay optional at the transport boundary for backward compatibility,
 * but normalizeChapterPlan() always materializes them before drafting/review.
 * This keeps one chapter-level source of truth instead of creating a second
 * ChapterContract table/object that can drift from the detailed outline.
 */
export interface ChapterPlan {
  core: string;
  scenes: ScenePlan[];
  characterActions: CharacterActionPlan[];
  conflict: string;
  highlights: string[];
  foreshadowing: string[];
  foreshadowingRecoveries: string[];
  characterStateChanges: string[];
  hook: string;
  mood: string;
  reversalPoint?: string;
  hotScenes: string[];
  targetWords?: number;

  /** State that must already be true when the chapter starts. */
  entryState?: string[];
  /** The single irreversible narrative job of this chapter. */
  objective?: string;
  /** Beats that must occur in the body. */
  mandatoryBeats?: string[];
  /** Facts/events the body must not introduce or contradict. */
  forbiddenFacts?: string[];
  /** Character knowledge boundaries at chapter start/end. */
  characterKnowledge?: string[];
  /** Canon state changes that this chapter is allowed/required to cause. */
  stateTransitions?: string[];
  /** Foreshadowing actions to plant/remind/recover in this chapter. */
  foreshadowTasks?: string[];
  /** State that must be true when the chapter ends. */
  exitState?: string[];
  /** Concrete hand-off/hook required for the next chapter. */
  nextHook?: string;
}

/** A normalized ChapterPlan always exposes the execution contract fields. */
export type ExecutableChapterPlan = ChapterPlan & Required<Pick<ChapterPlan,
  'entryState' | 'objective' | 'mandatoryBeats' | 'forbiddenFacts' |
  'characterKnowledge' | 'stateTransitions' | 'foreshadowTasks' |
  'exitState' | 'nextHook'
>>;

const cleanText = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const cleanList = (value: unknown): string[] => Array.isArray(value)
  ? value.map(cleanText).filter(Boolean)
  : [];
const unique = (values: readonly string[]): string[] => [...new Set(values.map(cleanText).filter(Boolean))];

/**
 * Upgrade an existing detailed outline into the executable contract in place.
 *
 * The fallback rules are deliberately deterministic and only derive constraints
 * already present in the outline. They never invent story facts. New outline
 * generators may provide richer fields explicitly; legacy outlines therefore
 * become writable immediately without a parallel migration/table.
 */
export function normalizeChapterPlan(plan: ChapterPlan): ExecutableChapterPlan {
  const scenes = Array.isArray(plan.scenes) ? plan.scenes : [];
  const sceneBeats = scenes.flatMap(scene => unique([
    scene.goal || '',
    scene.summary || '',
    scene.outcome || '',
  ]));
  const lastOutcome = [...scenes].reverse().map(scene => cleanText(scene.outcome)).find(Boolean) || '';
  const actionKnowledge = (Array.isArray(plan.characterActions) ? plan.characterActions : [])
    .map(action => {
      const character = cleanText(action?.character);
      const motivation = cleanText(action?.motivation);
      if (!character || !motivation) return '';
      return `${character}：行动动机仅限“${motivation}”，不得无依据预知后续事实`;
    })
    .filter(Boolean);

  const objective = cleanText(plan.objective) || cleanText(plan.core) || cleanText(plan.conflict);
  const mandatoryBeats = cleanList(plan.mandatoryBeats).length
    ? cleanList(plan.mandatoryBeats)
    : unique([...sceneBeats, ...(Array.isArray(plan.highlights) ? plan.highlights : [])]);
  const stateTransitions = cleanList(plan.stateTransitions).length
    ? cleanList(plan.stateTransitions)
    : unique(Array.isArray(plan.characterStateChanges) ? plan.characterStateChanges : []);
  const foreshadowTasks = cleanList(plan.foreshadowTasks).length
    ? cleanList(plan.foreshadowTasks)
    : unique([
      ...(Array.isArray(plan.foreshadowing) ? plan.foreshadowing.map(item => `埋设/提醒：${item}`) : []),
      ...(Array.isArray(plan.foreshadowingRecoveries) ? plan.foreshadowingRecoveries.map(item => `回收：${item}`) : []),
    ]);
  const exitState = cleanList(plan.exitState).length
    ? cleanList(plan.exitState)
    : unique([lastOutcome, ...stateTransitions]);

  return {
    ...plan,
    entryState: cleanList(plan.entryState),
    objective,
    mandatoryBeats,
    forbiddenFacts: cleanList(plan.forbiddenFacts),
    characterKnowledge: cleanList(plan.characterKnowledge).length
      ? cleanList(plan.characterKnowledge)
      : unique(actionKnowledge),
    stateTransitions,
    foreshadowTasks,
    exitState,
    nextHook: cleanText(plan.nextHook) || cleanText(plan.hook),
  };
}

/** Stable subset injected into drafting/review context. */
export function chapterExecutionContract(plan: ChapterPlan): Pick<ExecutableChapterPlan,
  'entryState' | 'objective' | 'mandatoryBeats' | 'forbiddenFacts' |
  'characterKnowledge' | 'stateTransitions' | 'foreshadowTasks' |
  'exitState' | 'nextHook'
> {
  const normalized = normalizeChapterPlan(plan);
  return {
    entryState: normalized.entryState,
    objective: normalized.objective,
    mandatoryBeats: normalized.mandatoryBeats,
    forbiddenFacts: normalized.forbiddenFacts,
    characterKnowledge: normalized.characterKnowledge,
    stateTransitions: normalized.stateTransitions,
    foreshadowTasks: normalized.foreshadowTasks,
    exitState: normalized.exitState,
    nextHook: normalized.nextHook,
  };
}

export interface KeyValueSetting {
  key: string;
  value: string;
}

/** API keys intentionally match existing world profile endpoints. */
export interface WorldProfileContract {
  synopsis: string;
  basic_info: string;
  era: string;
  locations: string[];
  atmosphere_tone: string;
  rules: string[];
  social_structure: string;
  tech_supernatural: string;
  system_mechanics: string;
  economy_system: string;
  culture_customs: string;
  naming_rules: string;
  factions: string[];
  scale_plan: string;
  ending: string;
  hierarchy_rules: string[];
  supplementary: string;
  custom_settings: KeyValueSetting[];
}

/** API keys intentionally match existing character profile endpoints. */
export interface CharacterProfileContract {
  alias_title: string;
  identity_occupation: string;
  faction_stance: string;
  role_type: string;
  appearance: string;
  personality_traits: string[];
  abilities_skills: string[];
  backstory: string;
  relationships: string[];
  catchphrase_speech_style: string;
  goals_motivation: string[];
  weaknesses_fears: string[];
  supplementary: string;
}

export interface ContractValidationResult<T> {
  ok: boolean;
  value?: T;
  issues: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(item => typeof item === 'string');

const expectString = (obj: Record<string, unknown>, key: string, issues: string[]) => {
  if (typeof obj[key] !== 'string') issues.push(`${key}: expected string`);
};

const expectStringArray = (obj: Record<string, unknown>, key: string, issues: string[]) => {
  if (!isStringArray(obj[key])) issues.push(`${key}: expected string[]`);
};

const expectOptionalString = (obj: Record<string, unknown>, key: string, issues: string[]) => {
  if (obj[key] !== undefined && typeof obj[key] !== 'string') issues.push(`${key}: expected string`);
};

const expectOptionalStringArray = (obj: Record<string, unknown>, key: string, issues: string[]) => {
  if (obj[key] !== undefined && !isStringArray(obj[key])) issues.push(`${key}: expected string[]`);
};

export function validateChapterPlan(value: unknown): ContractValidationResult<ChapterPlan> {
  if (!isRecord(value)) return { ok: false, issues: ['chapter_plan: expected object'] };
  const issues: string[] = [];
  for (const key of ['core', 'conflict', 'hook', 'mood']) expectString(value, key, issues);
  for (const key of ['highlights', 'foreshadowing', 'foreshadowingRecoveries', 'characterStateChanges', 'hotScenes']) {
    expectStringArray(value, key, issues);
  }
  for (const key of ['objective', 'nextHook']) expectOptionalString(value, key, issues);
  for (const key of [
    'entryState', 'mandatoryBeats', 'forbiddenFacts', 'characterKnowledge',
    'stateTransitions', 'foreshadowTasks', 'exitState',
  ]) expectOptionalStringArray(value, key, issues);

  if (!Array.isArray(value.scenes)) {
    issues.push('scenes: expected ScenePlan[]');
  } else {
    value.scenes.forEach((scene, index) => {
      if (!isRecord(scene) || typeof scene.summary !== 'string') {
        issues.push(`scenes.${index}: expected object with string summary`);
        return;
      }
      for (const key of ['title', 'goal', 'conflict', 'outcome', 'location']) {
        if (scene[key] !== undefined && typeof scene[key] !== 'string') issues.push(`scenes.${index}.${key}: expected string`);
      }
      if (scene.characterIds !== undefined && !isStringArray(scene.characterIds)) {
        issues.push(`scenes.${index}.characterIds: expected string[]`);
      }
    });
  }
  if (!Array.isArray(value.characterActions)) {
    issues.push('characterActions: expected CharacterActionPlan[]');
  } else {
    value.characterActions.forEach((action, index) => {
      if (!isRecord(action) || typeof action.character !== 'string' || typeof action.action !== 'string') {
        issues.push(`characterActions.${index}: expected { character:string, action:string }`);
      }
    });
  }
  if (value.reversalPoint !== undefined && typeof value.reversalPoint !== 'string') {
    issues.push('reversalPoint: expected string');
  }
  if (value.targetWords !== undefined && (typeof value.targetWords !== 'number' || !Number.isFinite(value.targetWords))) {
    issues.push('targetWords: expected finite number');
  }
  return issues.length
    ? { ok: false, issues }
    : { ok: true, value: normalizeChapterPlan(value as unknown as ChapterPlan), issues };
}

export function validateWorldProfile(value: unknown): ContractValidationResult<WorldProfileContract> {
  if (!isRecord(value)) return { ok: false, issues: ['world_profile: expected object'] };
  const issues: string[] = [];
  for (const key of [
    'synopsis', 'basic_info', 'era', 'atmosphere_tone', 'social_structure', 'tech_supernatural',
    'system_mechanics', 'economy_system', 'culture_customs', 'naming_rules', 'scale_plan', 'ending', 'supplementary',
  ]) expectString(value, key, issues);
  for (const key of ['locations', 'rules', 'factions', 'hierarchy_rules']) expectStringArray(value, key, issues);
  if (!Array.isArray(value.custom_settings)) {
    issues.push('custom_settings: expected KeyValueSetting[]');
  } else {
    value.custom_settings.forEach((entry, index) => {
      if (!isRecord(entry) || typeof entry.key !== 'string' || typeof entry.value !== 'string') {
        issues.push(`custom_settings.${index}: expected { key:string, value:string }`);
      }
    });
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: value as unknown as WorldProfileContract, issues };
}

export function validateCharacterProfile(value: unknown): ContractValidationResult<CharacterProfileContract> {
  if (!isRecord(value)) return { ok: false, issues: ['character_profile: expected object'] };
  const issues: string[] = [];
  for (const key of ['alias_title', 'identity_occupation', 'faction_stance', 'role_type', 'appearance', 'backstory', 'catchphrase_speech_style', 'supplementary']) {
    expectString(value, key, issues);
  }
  for (const key of ['personality_traits', 'abilities_skills', 'relationships', 'goals_motivation', 'weaknesses_fears']) {
    expectStringArray(value, key, issues);
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: value as unknown as CharacterProfileContract, issues };
}

export function validateContentContract(kind: ContentContractKind, value: unknown): ContractValidationResult<unknown> {
  switch (kind) {
    case 'chapter_plan': return validateChapterPlan(value);
    case 'world_profile': return validateWorldProfile(value);
    case 'character_profile': return validateCharacterProfile(value);
  }
}